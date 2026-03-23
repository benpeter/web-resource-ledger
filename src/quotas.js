// Quota configuration for tenant tiers.
// Tier defaults define monthly capture and storage limits.
// Per-tenant overrides live in tenants.config JSON under the 'quotas' key.
// tva

import { computePeriod } from './db.js';

export const TIER_QUOTAS = {
  free: { capturesPerMonth: 100,  storageBytes: 1  * 1024 * 1024 * 1024 },  // 1 GB
  pro:  { capturesPerMonth: 5000, storageBytes: 50 * 1024 * 1024 * 1024 },  // 50 GB
};

export const DEFAULT_TIER = 'free';

// UI display names -- internal code uses 'free'/'pro', UI shows these
export const TIER_DISPLAY_NAMES = {
  free: 'Starter',
  pro:  'Pro',
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
 * Return the effective quota for a tenant by merging tier defaults with any
 * per-tenant overrides from tenantConfig.quotas.
 *
 * Pattern mirrors getEffectiveLimit() in rate-limits.js.
 *
 * @param {string} tier  'free' | 'pro' (unknown value falls back to DEFAULT_TIER)
 * @param {object|null} tenantConfig  From getTenantConfig(), may be null
 * @returns {{ capturesPerMonth: number, storageBytes: number }}
 */
export function getEffectiveQuota(tier, tenantConfig) {
  const defaults = TIER_QUOTAS[tier] || TIER_QUOTAS[DEFAULT_TIER];
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
 * tenant tier+config and current-period usage simultaneously.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {number} [count=1]  Number of captures being requested (supports batch checks)
 * @returns {Promise<object>} Result object with allowed:boolean and contextual fields
 */
export async function checkQuota(db, tenantId, count = 1) {
  const period = computePeriod();

  const [tenantResult, usageResult] = await db.batch([
    db.prepare('SELECT tier, config FROM tenants WHERE id = ?').bind(tenantId),
    db.prepare(
      'SELECT capture_count, storage_bytes FROM usage_counters WHERE tenant_id = ? AND period = ?',
    ).bind(tenantId, period),
  ]);

  const tenant = tenantResult.results?.[0];
  if (!tenant) return { allowed: false, reason: 'tenant_not_found' };

  const tier   = tenant.tier || DEFAULT_TIER;
  const config = tenant.config ? JSON.parse(tenant.config) : null;
  const quota  = getEffectiveQuota(tier, config);

  const usage        = usageResult.results?.[0];
  const captureCount = usage?.capture_count ?? 0;
  const storageBytes = usage?.storage_bytes ?? 0;

  // Capture limit: check whether adding `count` would exceed the monthly cap.
  // Uses > (not >=) so that count>1 batch checks work correctly.
  if (captureCount + count > quota.capturesPerMonth) {
    return {
      allowed:   false,
      reason:    'capture_limit',
      limit:     quota.capturesPerMonth,
      used:      captureCount,
      requested: count,
      resetsAt:  computeQuotaReset(),
      period,
    };
  }

  // Storage limit: check whether the tenant is already at or over their quota.
  // We cannot know the size of the incoming capture in advance.
  if (storageBytes >= quota.storageBytes) {
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
    allowed:      true,
    quota,
    captureCount,
    storageBytes,
    tier,
    period,
  };
}
