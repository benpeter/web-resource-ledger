// Rate limit configuration.
// CAPTURE_RATE_LIMITER binding ceiling is 100/60s (hard backstop in wrangler.toml).
// Per-tenant defaults below are enforced via application-level KV counters.
// CAPTURE_IP_GUARD binding ceiling is 50/60s (secondary abuse guard).
// tva
export const RATE_LIMITS = {
  capture: { limit: 10, period: 60 },   // per-tenant default (all authenticated endpoints)
  verify:  { limit: 60, period: 60 },    // per-IP (unauthenticated)
  admin:   { limit: 30, period: 60 },    // per-IP (admin)
  auth:    { limit: 20, period: 60 },    // per-IP (OAuth flow)
  account: { limit: 30, period: 60 },    // per-IP (account settings)
};

// IP secondary guard -- separate binding, higher ceiling
export const IP_GUARD_LIMITS = {
  capture: { limit: 50, period: 60 },
};

// Hard ceiling -- CAPTURE_RATE_LIMITER binding value in wrangler.toml.
// Custom tenant overrides cannot exceed this.
export const BINDING_CEILING = 100;

/**
 * Get the effective rate limit for a tenant and group.
 * Tenant config overrides take precedence over defaults.
 *
 * @param {object|null} tenantConfig  From getTenantConfig(), may be null
 * @param {string} group  Rate limit group name
 * @returns {{ limit: number, period: number }}
 */
export function getEffectiveLimit(tenantConfig, group) {
  const defaults = RATE_LIMITS[group] || RATE_LIMITS.capture;
  if (!tenantConfig?.rateLimit?.[group]) return defaults;
  const override = tenantConfig.rateLimit[group];
  return {
    limit: Math.min(override.limit, BINDING_CEILING),
    period: override.period || defaults.period,
  };
}
