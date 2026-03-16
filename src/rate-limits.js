// Rate limit ceilings for X-RateLimit-Limit response headers.
// These MUST match the `simple.limit` values in wrangler.toml rate limiter bindings.
// tva
export const RATE_LIMITS = {
  capture: { limit: 10, period: 60 },
  verify:  { limit: 60, period: 60 },
};
