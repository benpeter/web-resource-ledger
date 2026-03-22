/*
 * kv.js -- KV access layer for rate limit counters only
 *
 * All metadata operations (captures, tenants, API keys, signing keys) have
 * been moved to db.js (D1/SQLite). This file retains only the rate limit
 * counter functions that require KV's atomic TTL semantics.
 *
 * TENANT_ID_RE is re-exported here for backward compatibility with modules
 * that import it from kv.js.
 *
 * KV key prefix used here:
 *   rl:{tenantId}:{group}:{windowId}  -- rate limit sliding window counters (TTL: period * 2)
 */ // tva

/** Regex for valid tenant IDs -- single source of truth, also exported from db.js */
export const TENANT_ID_RE = /^[a-z0-9_-]{1,64}$/;

// ---------------------------------------------------------------------------
// Rate limit counters
// ---------------------------------------------------------------------------

/**
 * Compute the window ID for the current time and period.
 * @param {number} period  Window size in seconds (10 or 60)
 * @returns {number}
 */
export function rateLimitWindowId(period) {
  return Math.floor(Date.now() / (period * 1000));
}

/**
 * Read and increment the rate limit counter for a tenant+group.
 * Returns the count BEFORE this request is counted.
 * The check uses `current >= limit` to correctly block at the boundary.
 *
 * Non-blocking: the KV write (increment) is returned as a Promise
 * for the caller to pass to ctx.waitUntil().
 *
 * @param {KVNamespace} kv
 * @param {string} tenantId
 * @param {string} group  Rate limit group name (e.g., 'capture')
 * @param {number} limit  The tenant's effective limit for this group
 * @param {number} period  Window size in seconds
 * @param {number} [count=1]  Number of tokens to consume (e.g., batch size)
 * @returns {Promise<{ remaining: number, resetIn: number, exceeded: boolean, writePromise: Promise<void> }>}
 */
export async function rateLimitCounter(kv, tenantId, group, limit, period, count = 1) {
  const windowId = rateLimitWindowId(period);
  const key = `rl:${tenantId}:${group}:${windowId}`;

  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) : 0;
  const exceeded = (current + count) > limit;
  const remaining = Math.max(0, limit - current - count);

  // Seconds until current window resets
  const windowStart = windowId * period;
  const resetIn = Math.max(1, (windowStart + period) - Math.floor(Date.now() / 1000));

  // Non-blocking write -- caller passes to ctx.waitUntil()
  // Skip write when exceeded to avoid inflating counter on blocked requests
  const writePromise = exceeded
    ? Promise.resolve()
    : kv.put(key, String(current + count), { expirationTtl: period * 2 });

  return { remaining, resetIn, exceeded, writePromise };
}
