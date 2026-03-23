// tva
import { computePeriod } from './db.js';
import { reportMeterEvent } from './stripe.js';
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
           t.stripe_customer_id
    FROM usage_counters uc
    JOIN tenants t ON t.id = uc.tenant_id
    WHERE t.stripe_customer_id IS NOT NULL
      AND t.payment_method_added_at IS NOT NULL
      AND uc.capture_count > uc.reported_capture_count
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
    const { tenant_id: tenantId, period, capture_count: captureCount, reported_capture_count: reportedCaptureCount, stripe_customer_id: stripeCustomerId } = row;
    const delta = captureCount - reportedCaptureCount;
    if (delta <= 0) continue;

    // Idempotency key encodes the exact snapshot -- safe to retry with the same key.
    const identifier = `wrl-meter:${tenantId}:${period}:${captureCount}`;

    try {
      await reportMeterEvent(env, {
        event_name: 'captures',
        payload: {
          stripe_customer_id: stripeCustomerId,
          value: String(delta),
        },
        identifier,
        timestamp: Math.floor(Date.now() / 1000),
      });

      // Advance the watermark to the snapshot value used for this event.
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE usage_counters
         SET reported_capture_count = ?, last_reported_at = ?
         WHERE tenant_id = ? AND period = ?`,
      ).bind(captureCount, now, tenantId, period).run();

      log(env, 3, 'meter', {
        event: 'meter.report_success',
        tenantId,
        period,
        delta,
        identifier,
        previousWatermark: reportedCaptureCount,
      });

      reportedCount++;
    } catch (err) {
      log(env, 5, 'meter', {
        event: 'meter.report_fail',
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

  log(env, 3, 'meter', {
    event: 'meter.report_cycle_complete',
    reportedCount,
    failedCount,
    durationMs: Date.now() - startMs,
    periods,
  });
}
