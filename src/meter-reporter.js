// tva
import { computePeriod, cacheStripeInvoice, clearStripeInvoiceCache } from './db.js';
import { reportMeterEvent, getUpcomingInvoice } from './stripe.js';
import { log } from './log.js';

/**
 * Compute the previous billing period (YYYY-MM) from the current period string.
 *
 * @param {string} period  e.g. '2026-03'
 * @returns {string}       e.g. '2026-02'
 */
function previousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Query paid tenants that have unreported usage in the current or previous
 * billing period, then report each delta to Stripe as a meter event.
 *
 * Per-tenant errors are isolated: a failure for tenant A does not prevent
 * tenant B from being processed. The watermark (reported_capture_count) is
 * only advanced on a confirmed successful Stripe response.
 *
 * A Stripe 200 response on a duplicate idempotency key is treated as success
 * and the watermark is updated (the event was already counted).
 *
 * @param {object} env  Worker env bindings (DB, STRIPE_SECRET_KEY, etc.)
 * @param {object} ctx  Execution context (unused directly, kept for signature parity)
 * @returns {Promise<void>}
 */
export async function reportPendingMeterEvents(env, ctx) {
  const startMs = Date.now();
  const current = computePeriod();
  const prev = previousPeriod(current);
  const periods = [current, prev];

  // Query paid tenants with unreported usage in the two most recent periods.
  const { results } = await env.DB.prepare(`
    SELECT uc.tenant_id, uc.period, uc.capture_count, uc.reported_capture_count,
           uc.eidas_capture_count, uc.reported_eidas_count,
           t.stripe_customer_id
    FROM usage_counters uc
    JOIN tenants t ON t.id = uc.tenant_id
    WHERE t.stripe_customer_id IS NOT NULL
      AND t.payment_method_added_at IS NOT NULL
      AND (uc.capture_count > uc.reported_capture_count OR uc.eidas_capture_count > uc.reported_eidas_count)
      AND uc.period IN (?, ?)
  `).bind(current, prev).all();

  log(env, 3, 'meter', {
    event: 'meter.report_cycle_start',
    tenantCount: results.length,
    periods,
  });

  let reportedCount = 0;
  let failedCount = 0;

  for (const row of results) {
    const {
      tenant_id: tenantId,
      period,
      capture_count: captureCount,
      reported_capture_count: reportedCaptureCount,
      eidas_capture_count: eidasCaptureCount,
      reported_eidas_count: reportedEidasCount,
      stripe_customer_id: stripeCustomerId,
    } = row;

    // --- captures meter ---
    const captureDelta = captureCount - reportedCaptureCount;
    if (captureDelta > 0) {
      const identifier = `wrl-meter:${tenantId}:${period}:captures:${captureCount}`;
      try {
        await reportMeterEvent(env, {
          event_name: 'captures',
          payload: {
            stripe_customer_id: stripeCustomerId,
            value: String(captureDelta),
          },
          identifier,
          timestamp: Math.floor(Date.now() / 1000),
        });

        const now = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE usage_counters
           SET reported_capture_count = ?, last_reported_at = ?
           WHERE tenant_id = ? AND period = ?`,
        ).bind(captureCount, now, tenantId, period).run();

        log(env, 3, 'meter', {
          event: 'meter.report_success',
          meter: 'captures',
          tenantId,
          period,
          delta: captureDelta,
          identifier,
          previousWatermark: reportedCaptureCount,
        });

        reportedCount++;
      } catch (err) {
        log(env, 5, 'meter', {
          event: 'meter.report_fail',
          meter: 'captures',
          tenantId,
          period,
          errorMessage: String(err?.message ?? '').slice(0, 256),
          httpStatus: err?.status ?? null,
          stripeErrorType: err?.stripeErrorType ?? null,
          captureCount,
          reportedCaptureCount,
        });
        failedCount++;
      }
    }

    // --- eidas_timestamps meter ---
    const eidasDelta = eidasCaptureCount - reportedEidasCount;
    if (eidasDelta > 0) {
      const identifier = `wrl-meter:${tenantId}:${period}:eidas:${eidasCaptureCount}`;
      try {
        await reportMeterEvent(env, {
          event_name: 'eidas_timestamps',
          payload: {
            stripe_customer_id: stripeCustomerId,
            value: String(eidasDelta),
          },
          identifier,
          timestamp: Math.floor(Date.now() / 1000),
        });

        const now = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE usage_counters
           SET reported_eidas_count = ?, last_reported_at = ?
           WHERE tenant_id = ? AND period = ?`,
        ).bind(eidasCaptureCount, now, tenantId, period).run();

        log(env, 3, 'meter', {
          event: 'meter.report_success',
          meter: 'eidas_timestamps',
          tenantId,
          period,
          delta: eidasDelta,
          identifier,
          previousWatermark: reportedEidasCount,
        });

        reportedCount++;
      } catch (err) {
        log(env, 5, 'meter', {
          event: 'meter.report_fail',
          meter: 'eidas_timestamps',
          tenantId,
          period,
          errorMessage: String(err?.message ?? '').slice(0, 256),
          httpStatus: err?.status ?? null,
          stripeErrorType: err?.stripeErrorType ?? null,
          eidasCaptureCount,
          reportedEidasCount,
        });
        failedCount++;
      }
    }
  }

  // --- Second pass: cache upcoming invoice amounts per customer ---
  // Collect unique stripeCustomerId → tenantId pairs from processed rows
  const customerMap = new Map();
  for (const row of results) {
    if (row.stripe_customer_id && !customerMap.has(row.stripe_customer_id)) {
      customerMap.set(row.stripe_customer_id, row.tenant_id);
    }
  }

  let invoiceCachedCount = 0;
  let invoiceFailedCount = 0;

  for (const [customerId, tenantId] of customerMap) {
    try {
      const invoice = await getUpcomingInvoice(env, customerId);
      if (invoice) {
        await cacheStripeInvoice(env.DB, tenantId, invoice.amount_due, invoice.currency);
        invoiceCachedCount++;
      } else {
        // No active subscription -- clear stale cache
        await clearStripeInvoiceCache(env.DB, tenantId);
      }
    } catch (err) {
      // Log warning, keep stale cache -- next hourly run retries
      log(env, 4, 'meter', {
        event: 'meter.invoice_cache_fail',
        tenantId,
        stripeCustomerId: customerId,
        errorMessage: String(err?.message ?? '').slice(0, 256),
      });
      invoiceFailedCount++;
    }
  }

  log(env, 3, 'meter', {
    event: 'meter.report_cycle_complete',
    reportedCount,
    failedCount,
    invoiceCachedCount,
    invoiceFailedCount,
    durationMs: Date.now() - startMs,
    periods,
  });
}
