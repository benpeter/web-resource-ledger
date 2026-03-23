// Quota configuration for usage-based billing.
// Free tier: first FREE_CAPTURE_LIMIT captures/month at no charge.
// Paid tier: unlimited captures once a payment method is added (Stripe meters usage).
// Per-tenant config overrides remain available via tenants.config JSON.
// tva

import { computePeriod, setBillingStatus } from './db.js';

export const FREE_CAPTURE_LIMIT = 200;
export const FREE_STORAGE_LIMIT = 1 * 1024 * 1024 * 1024; // 1 GB

/** @deprecated Use FREE_CAPTURE_LIMIT instead. Kept for test backward compatibility until Phase 6. */
export const DEFAULT_TIER = 'free';

/**
 * @deprecated Use FREE_CAPTURE_LIMIT instead.
 * Kept for test backward compatibility until Phase 6.
 */
export const TIER_QUOTAS = {
  free: { capturesPerMonth: FREE_CAPTURE_LIMIT, storageBytes: FREE_STORAGE_LIMIT },
  pro:  { capturesPerMonth: 5000, storageBytes: 10 * 1024 * 1024 * 1024 },
};

/**
 * Compute the ISO timestamp at which the current quota period resets.
 * Always the first moment of the next calendar month (UTC).
 *
 * @returns {string} ISO 8601 timestamp
 */
export function computeQuotaReset() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * Return the effective quota for a tenant by merging payment-method-based
 * defaults with any per-tenant overrides from tenantConfig.quotas.
 *
 * @param {boolean} hasPaymentMethod  true if payment_method_added_at is non-null
 * @param {object|null} tenantConfig  From getTenantConfig(), may be null
 * @returns {{ capturesPerMonth: number, storageBytes: number }}
 */
export function getEffectiveQuota(hasPaymentMethod, tenantConfig) {
  const defaults = hasPaymentMethod
    ? { capturesPerMonth: Infinity, storageBytes: Infinity }
    : { capturesPerMonth: FREE_CAPTURE_LIMIT, storageBytes: FREE_STORAGE_LIMIT };
  if (!tenantConfig?.quotas) return { ...defaults };
  return {
    capturesPerMonth: tenantConfig.quotas.capturesPerMonth ?? defaults.capturesPerMonth,
    storageBytes:     tenantConfig.quotas.storageBytes     ?? defaults.storageBytes,
  };
}

/**
 * Check whether a tenant has remaining quota for a capture operation.
 *
 * Performs a single D1 batch (two prepared statements, one round-trip) to read
 * tenant billing state + config and current-period usage simultaneously.
 *
 * Grace period expiry is evaluated in JS (new Date comparison), NOT via
 * SQL strftime, so that vi.useFakeTimers() in tests controls the clock.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {number} [count=1]  Number of captures being requested (supports batch checks)
 * @returns {Promise<object>} Result object with allowed:boolean and contextual fields
 */
export async function checkQuota(db, tenantId, count = 1) {
  const period = computePeriod();

  const [tenantResult, usageResult] = await db.batch([
    db.prepare(
      'SELECT tier, config, payment_method_added_at, billing_status, grace_period_end, eidas_qualified FROM tenants WHERE id = ?',
    ).bind(tenantId),
    db.prepare(
      'SELECT capture_count, storage_bytes FROM usage_counters WHERE tenant_id = ? AND period = ?',
    ).bind(tenantId, period),
  ]);

  const tenant = tenantResult.results?.[0];
  if (!tenant) return { allowed: false, reason: 'tenant_not_found' };

  const billingStatus        = tenant.billing_status ?? 'active';
  const gracePeriodEnd       = tenant.grace_period_end ?? null;
  const hasPaymentMethod     = tenant.payment_method_added_at != null;
  const eidasQualified       = Boolean(tenant.eidas_qualified);
  const config               = tenant.config ? JSON.parse(tenant.config) : null;

  // Hard block: tenant has been cut off from captures.
  if (billingStatus === 'blocked') {
    return { allowed: false, reason: 'billing_blocked' };
  }

  // Grace period check: evaluate expiry in JS, not SQL, for fake timer support.
  if (billingStatus === 'grace_period') {
    if (gracePeriodEnd && new Date(gracePeriodEnd) < new Date()) {
      // Grace period expired -- lazily transition to blocked.
      await setBillingStatus(db, tenantId, 'blocked');
      return { allowed: false, reason: 'billing_blocked' };
    }
    // Still within grace period -- allow unlimited captures (no cap).
    const usage        = usageResult.results?.[0];
    const captureCount = usage?.capture_count ?? 0;
    const storageBytes = usage?.storage_bytes ?? 0;
    return {
      allowed:         true,
      billingStatus,
      hasPaymentMethod,
      eidasQualified,
      captureCount,
      storageBytes,
      period,
    };
  }

  const quota        = getEffectiveQuota(hasPaymentMethod, config);
  const usage        = usageResult.results?.[0];
  const captureCount = usage?.capture_count ?? 0;
  const storageBytes = usage?.storage_bytes ?? 0;

  // Capture limit check.
  // Infinity check avoids the > comparison misfiring for paid tenants.
  if (quota.capturesPerMonth !== Infinity && captureCount + count > quota.capturesPerMonth) {
    const reason = hasPaymentMethod ? 'capture_limit' : 'payment_required';
    return {
      allowed:   false,
      reason,
      limit:     quota.capturesPerMonth,
      used:      captureCount,
      requested: count,
      resetsAt:  computeQuotaReset(),
      period,
    };
  }

  // Storage limit check.
  if (quota.storageBytes !== Infinity && storageBytes >= quota.storageBytes) {
    return {
      allowed:  false,
      reason:   'storage_limit',
      limit:    quota.storageBytes,
      used:     storageBytes,
      resetsAt: computeQuotaReset(),
      period,
    };
  }

  return {
    allowed:         true,
    quota,
    captureCount,
    storageBytes,
    billingStatus,
    hasPaymentMethod,
    eidasQualified,
    period,
  };
}
