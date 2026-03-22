## Task 2: Counter Integration — Wire incrementUsage into capture pipeline and API handlers

You are implementing usage counter increments for the Web Resource Ledger (WRL).
The DAL functions (computePeriod, incrementUsage, getUsage) already exist in src/db.js.
Your job is to wire incrementUsage calls into the existing code paths.

### Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wise-wondering-lerdorf

### What to modify

**1. `src/index.js` — Import incrementUsage**

Add `incrementUsage` to the existing import from `./db.js` (line 4).

**2. `src/index.js` — handleCaptureMessage (queue consumer, ~line 65)**

After `result.ok === true` (line 137), before `msg.ack()`, add a deferred usage increment
for capture count AND storage bytes. The capture pipeline returns `{ ok: true }` — we need
to extend `performCapture` to also return `storedBytes`.

Wire it as:
```js
if (result.ok === true) {
  ctx.waitUntil(
    incrementUsage(env.DB, tenantId, {
      captures: 1,
      storageBytes: result.storedBytes || 0,
    }).then(() =>
      log(env, 3, 'usage', {
        event: 'usage.counter_incremented',
        tenantId,
        captureId,
        captures: 1,
        storageBytes: result.storedBytes || 0,
      })
    ).catch((err) => {
      console.warn('wrl:usage_increment_fail', { captureId, tenantId, errorMessage: String(err?.message ?? '').slice(0, 128) });
    })
  );
  msg.ack();
```

IMPORTANT: The success log MUST be chained inside `.then()` on the incrementUsage promise,
NOT in a separate parallel `ctx.waitUntil()`. This ensures the log fires only when the D1
write succeeds, which is critical for reconciliation.

**3. `src/capture.js` — performCapture return value**

Currently `performCapture` returns `{ ok: true }` on success (line 265).
Change it to return `{ ok: true, storedBytes: N }` where N is the total bytes stored in R2.

To compute storedBytes, sum the sizes of all R2 artifacts. The available sizes are:
- `screenshot.byteLength` (Uint8Array)
- `screenshotBefore.byteLength` (Uint8Array, if present)
- `html.length` (string — byte count via `new Blob([html]).size` or `new TextEncoder().encode(html).byteLength`)
- `headers ? JSON.stringify(headers).length : 0`
- `waczInfo?.size ?? 0` (this is `waczBytes.byteLength`, already computed at line 212)

Note: `waczInfo.size` is available after the WACZ block (line 212). Use it — do NOT
reference `waczBytes.byteLength` directly, as `waczBytes` is block-scoped inside the
WACZ try block and not accessible here.

Compute the total just before the return statement:
```js
const storedBytes = screenshot.byteLength
  + (screenshotBefore ? screenshotBefore.byteLength : 0)
  + new TextEncoder().encode(html).byteLength
  + (headers ? JSON.stringify(headers).length : 0)
  + (waczInfo?.size ?? 0);
return { ok: true, storedBytes };
```

For partial captures (line ~549-569 area), also compute and return storedBytes
(just screenshot + html, no WACZ).

**4. `src/index.js` — Three authenticated API handlers: increment api_call_count**

The three handlers that call `verifyApiKey` are:
- `handleCreateCapture` (~line 404) — after successful auth, before rate limit check
- `handleBatchCapture` (~line 548) — after successful auth
- `handleListCaptures` (~line 761) — after successful auth

For each, add a deferred API call counter increment right after the auth check succeeds
(after destructuring `tenantId`):

```js
ctx.waitUntil(
  incrementUsage(env.DB, tenantId, { apiCalls: 1 })
    .catch((err) => {
      console.warn('wrl:usage_increment_fail', { tenantId, errorMessage: String(err?.message ?? '').slice(0, 128) });
    })
);
```

These are fire-and-forget — no success log needed for API call counting. The `.catch()`
ensures a D1 failure doesn't create an unhandled rejection.

DO NOT touch any other handlers. The public endpoints (handleCaptureStatus,
handleGetCapture, handleGetCaptureArtifact) have no tenantId and must NOT be modified.

### Conventions
- Use `ctx.waitUntil()` for all deferred writes — no latency added to hot path
- Chain success logs with `.then()` not separate `ctx.waitUntil()`
- Use `?? Promise.resolve()` pattern for log() calls that may return undefined
- Follow existing error handling: `.catch()` with `console.warn()` for non-critical failures
- Never log raw API keys or tokens
- Keep changes minimal — only the lines described above

### What NOT to do
- Do NOT create new files
- Do NOT modify admin.js, db.js, auth.js, or any other source file
- Do NOT add tests (that's Task 4/5)
- Do NOT add OpenAPI changes (that's Task 3)
- Do NOT modify the import from './log.js' — it's already imported
