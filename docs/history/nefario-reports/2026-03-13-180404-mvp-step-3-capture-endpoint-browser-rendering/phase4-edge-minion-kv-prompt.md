You are implementing the KV status tracking module for the Web Resource Ledger capture pipeline.

## Context
Working directory: /Users/ben/github/benpeter/web-resource-ledger
Read these files first:
- src/responses.js -- response helpers
- src/url-validation.js -- pattern to follow for module design
- wrangler.toml -- KV namespace binding (KV)
- openapi.yaml -- the API contract

## What to produce

### src/kv.js
Export four functions that encapsulate all KV access for the capture pipeline. No raw env.KV.put()/get() calls should exist outside this module.

**Key format**: `capture:{captureId}` (e.g., `capture:cap_a1b2c3d4...`)

```js
/**
 * Write initial pending record. Called BEFORE returning 202.
 * Uses expirationTtl: 86400 (24h) as self-cleaning for stuck captures.
 */
export async function createCapture(kv, captureId, url, ip) {
  const value = {
    status: 'pending',
    url,
    ip,
    captureId,
    createdAt: new Date().toISOString(),
  };
  await kv.put(`capture:${captureId}`, JSON.stringify(value), {
    expirationTtl: 86400,
  });
}

/**
 * Update status to complete. Removes TTL (completed records persist).
 * artifacts: { screenshot: 'captures/cap_.../screenshot.png', html: '...', headers: '...' }
 */
export async function completeCapture(kv, captureId, artifacts) {
  const existing = await kv.get(`capture:${captureId}`, 'json');
  if (!existing) return; // Expired or missing -- nothing to update
  const value = {
    ...existing,
    status: 'complete',
    completedAt: new Date().toISOString(),
    artifacts,
  };
  await kv.put(`capture:${captureId}`, JSON.stringify(value));
  // No expirationTtl -- completed records persist
}

/**
 * Update status to failed. Removes TTL (failed records persist for debugging).
 * error: human-readable string, retryable: boolean
 */
export async function failCapture(kv, captureId, error, retryable = false) {
  const existing = await kv.get(`capture:${captureId}`, 'json');
  if (!existing) return;
  const value = {
    ...existing,
    status: 'failed',
    failedAt: new Date().toISOString(),
    error,
    retryable,
  };
  await kv.put(`capture:${captureId}`, JSON.stringify(value));
}

/**
 * Read capture record. Returns parsed JSON or null for missing keys.
 */
export async function getCapture(kv, captureId) {
  return kv.get(`capture:${captureId}`, 'json');
}
```

The module encapsulates:
- Key prefix convention (`capture:`)
- JSON serialization
- TTL logic (24h on pending, none on complete/failed)
- Timestamp generation

### test/kv.test.js
Unit tests using the real in-memory KV from @cloudflare/vitest-pool-workers. Do NOT mock KV.

```js
import { env } from 'cloudflare:test';
```

Test cases:
- createCapture writes correct key (capture:{id}) and value shape
- getCapture returns null for missing keys
- getCapture returns parsed JSON for existing keys
- completeCapture updates status, adds completedAt and artifacts, removes TTL
- failCapture updates status, adds failedAt, error, and retryable
- Key prefix is correctly applied (verify via raw env.KV.get)
- Round-trip: createCapture then getCapture returns matching data
- failCapture with retryable=true and retryable=false both work
- completeCapture on expired/missing key is a no-op (does not throw)
- ADVISORY: Add idempotency tests -- calling completeCapture on an already-complete record and failCapture on an already-failed record should not throw

Follow test patterns from test/responses.test.js.

## Module header convention
Follow url-validation.js pattern: block comment at top explaining purpose and data model.

## What NOT to do
- Do not implement route handlers
- Do not implement browser rendering
- Do not use KV metadata field (value only)
- Do not create files beyond src/kv.js and test/kv.test.js

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced