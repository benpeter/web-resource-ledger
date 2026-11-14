// Quota configuration for usage-based billing.
// Free tier: first FREE_CAPTURE_LIMIT captures/month at no charge.
// Paid tier: unlimited captures once a payment method is added (Stripe meters usage).
// Per-tenant config overrides remain available via tenants.config JSON.
// tva

import { computePeriod, setBillingStatus, DELETION_GRACE_DAYS } from './db.js';

export const FREE_CAPTURE_LIMIT = 200;
export const FREE_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024; // 10 GB, 200 captures at 50 MB each

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
      'SELECT tier, config, payment_method_added_at, billing_status, grace_period_end, eidas_qualified, deletion_requested_at FROM tenants WHERE id = ?',
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

  // Account deletion requested (phase 0152): no new captures until it is
  // cancelled or the data is purged.
  if (tenant.deletion_requested_at) {
    return { allowed: false, reason: 'deletion_requested', deletionRequestedAt: tenant.deletion_requested_at };
  }

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
      hasPaymentMethod,
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

/**
 * Format a byte count as gigabytes for quota messages, e.g. "10.0 GB".
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatStorage(bytes) {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Refusals that aren't about the quota: the account itself may not capture.
// Returns null for quota refusals, which answer with quota details instead.
export function accountRefusalDetail(quotaCheck) {
  if (quotaCheck.reason === 'deletion_requested') {
    const purgeAfter = new Date(Date.parse(quotaCheck.deletionRequestedAt) + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    return `This account is scheduled for deletion on ${purgeAfter.toISOString().slice(0, 10)} and can't capture. Contact support to cancel the deletion.`;
  }
  if (quotaCheck.reason === 'billing_blocked') {
    return 'Account is blocked. Contact support to restore access.';
  }
  return null;
}

// Detail for a storage_limit refusal.
export function storageLimitDetail(quotaCheck) {
  if (quotaCheck.hasPaymentMethod) {
    return `Storage quota reached. Resets ${quotaCheck.resetsAt}. View usage in Settings.`;
  }
  return `Storage quota reached (${formatStorage(quotaCheck.used)} of ${formatStorage(quotaCheck.limit)}). Add a payment method to continue capturing. Resets ${quotaCheck.resetsAt}.`;
}

// Detail for a quota refusal. batchSize is the number of URLs in a batch
// request; leave it out for a single capture.
export function quotaLimitDetail(quotaCheck, batchSize) {
  const { used, limit, resetsAt } = quotaCheck;
  if (quotaCheck.reason === 'payment_required') {
    return batchSize
      ? `Batch of ${batchSize} captures would exceed free tier limit (${used}/${limit}). Add a payment method to continue capturing.`
      : `Free tier limit reached (${used}/${limit}). Add a payment method to continue capturing. Resets ${resetsAt}.`;
  }
  if (quotaCheck.reason === 'capture_limit') {
    return batchSize
      ? `Batch of ${batchSize} captures would exceed monthly quota (${used}/${limit}). Resets ${resetsAt}. View usage in Settings.`
      : `Monthly capture quota reached (${used}/${limit}). Resets ${resetsAt}. View usage in Settings.`;
  }
  return storageLimitDetail(quotaCheck);
}

/**
 * Template data for the limit_reached email, or null when a refused capture
 * should not send one: paid tenants, and batches that would only exceed the
 * free captures while some are left.
 *
 * @param {object} env
 * @param {object} quotaCheck  Result of checkQuota()
 * @returns {object|null}
 */
export function limitReachedEmailData(env, quotaCheck) {
  if (quotaCheck.allowed || quotaCheck.hasPaymentMethod) return null;

  let usage;
  if (quotaCheck.reason === 'payment_required' && quotaCheck.used >= quotaCheck.limit) {
    usage = { resource: 'captures', used: quotaCheck.used, limit: quotaCheck.limit };
  } else if (quotaCheck.reason === 'storage_limit') {
    usage = { resource: 'storage', used: formatStorage(quotaCheck.used), limit: formatStorage(quotaCheck.limit) };
  } else {
    return null;
  }

  const baseUrl = env.VERIFICATION_BASE_URL
    ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
    : 'https://api.webresourceledger.com';
  return {
    ...usage,
    period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    addPaymentUrl: `${baseUrl}/v1/billing/checkout`,
    resetsAt: quotaCheck.resetsAt,
  };
}
