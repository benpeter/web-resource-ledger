/*
 * kv.js -- KV access layer for capture status tracking
 *
 * Data model: one record per capture, stored as JSON under key `capture:{captureId}`.
 *
 * Lifecycle:
 *   pending  -- written by createCapture() before 202 is returned; expires in 24h
 *               (self-cleaning for captures that never complete)
 *   complete -- written by completeCapture(); no TTL, persists indefinitely
 *   failed   -- written by failCapture(); no TTL, persists for debugging
 *
 * All KV access is centralised here. No raw kv.put()/kv.get() calls should
 * exist outside this module.
 *
 * Record shape:
 *   { status, url, ip, captureId, createdAt }          -- pending
 *   { ...pending, status: 'complete', completedAt, artifacts }  -- complete
 *   { ...pending, status: 'failed', failedAt, error, retryable } -- failed
 *
 * Tests: test/kv.test.js
 */ // tva

const KEY_PREFIX = 'capture:';
const PENDING_TTL = 86400; // 24 hours

/**
 * Write initial pending record. Called BEFORE returning 202.
 * Uses expirationTtl: 86400 (24h) as self-cleaning for stuck captures.
 *
 * @param {KVNamespace} kv
 * @param {string} captureId
 * @param {string} url
 * @param {string} ip
 */
export async function createCapture(kv, captureId, url, ip) {
  const value = {
    status: 'pending',
    url,
    ip,
    captureId,
    createdAt: new Date().toISOString(),
  };
  await kv.put(`${KEY_PREFIX}${captureId}`, JSON.stringify(value), {
    expirationTtl: PENDING_TTL,
  });
}

/**
 * Update status to complete. Removes TTL (completed records persist).
 *
 * @param {KVNamespace} kv
 * @param {string} captureId
 * @param {{ screenshot: string, html: string, headers: string }} artifacts
 * @param {{ key: string, bundleHash: string, size: number } | null} [wacz=null]
 */
export async function completeCapture(kv, captureId, artifacts, wacz = null) {
  const existing = await kv.get(`${KEY_PREFIX}${captureId}`, 'json');
  if (!existing) return; // Expired or missing -- nothing to update
  const value = {
    ...existing,
    status: 'complete',
    completedAt: new Date().toISOString(),
    artifacts,
    ...(wacz ? { wacz } : {}),
  };
  await kv.put(`${KEY_PREFIX}${captureId}`, JSON.stringify(value));
  // No expirationTtl -- completed records persist
}

/**
 * Update status to failed. Removes TTL (failed records persist for debugging).
 *
 * @param {KVNamespace} kv
 * @param {string} captureId
 * @param {string} error Human-readable error message
 * @param {boolean} [retryable=false]
 */
export async function failCapture(kv, captureId, error, retryable = false) {
  const existing = await kv.get(`${KEY_PREFIX}${captureId}`, 'json');
  if (!existing) return; // Expired or missing -- nothing to update
  const value = {
    ...existing,
    status: 'failed',
    failedAt: new Date().toISOString(),
    error,
    retryable,
  };
  await kv.put(`${KEY_PREFIX}${captureId}`, JSON.stringify(value));
}

/**
 * Read capture record. Returns parsed JSON or null for missing keys.
 *
 * @param {KVNamespace} kv
 * @param {string} captureId
 * @returns {Promise<object|null>}
 */
export async function getCapture(kv, captureId) {
  return kv.get(`${KEY_PREFIX}${captureId}`, 'json');
}
