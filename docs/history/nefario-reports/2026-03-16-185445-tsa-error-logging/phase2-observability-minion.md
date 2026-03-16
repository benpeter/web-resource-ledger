# Observability Minion Planning Contribution
## Phase: TSA Error Logging (`tsa-error-logging`)

---

## What I Read

- `src/log.js`: the `log()` function, its INVARIANT, and its fire-and-forget design
- `src/wacz.js:106-114`: the TSA catch block and the surrounding context
- `src/rfc3161.js`: all error-throwing paths in `requestTimestamp()` and its helpers
- `src/capture.js`: the existing `wacz_fail` event at line 203 and the `capture.success`
  event at lines 221-234 (which already surfaces `timestampStatus`)

---

## 1. Severity Level

**Use severity 4 (warn), not 5 (error).**

Rationale: the system already handles TSA failure gracefully -- the capture completes
and `timestampStatus` is returned as `'absent'`. From an operator perspective this is a
degraded-but-functional state, not a failure. Severity 5 (error) should be reserved for
events that result in a capture failing or a KV/R2 write failing (as modelled by
`capture.stage.fail` and `capture.fail`). TSA failure is closer to `capture.header_fail`
(also severity 4) -- important signal but not actionable as a page alert.

If the operator specifically wants to alert on TSA unavailability, severity 4 events are
still queryable in Coralogix; alert thresholds can be tuned independently of severity.

---

## 2. Subsystem

**Use `'capture'` (not a new `'wacz'` subsystem).**

Rationale: TSA timestamp request is part of the WACZ assembly step, which is itself part
of the capture pipeline. All existing logging from `capture.js` uses `'capture'`. The
`wacz_fail` event on line 203 also uses `'capture'`. Splitting to a `'wacz'` subsystem
would fragment Coralogix queries that aggregate across the full capture lifecycle. Keep the
subsystem boundary at service-level: `'capture'` for everything in the write path,
`'security'` for auth/signing concerns. The event name (`capture.tsa_fail`) already
disambiguates the location.

---

## 3. Structured Payload Fields

```js
{
  event: 'capture.tsa_fail',
  captureId,               // always present -- correlates to the capture
  tenantId,                // always present -- enables per-tenant alerting
  cip,                     // hashed client IP -- consistent with other events
  tsaUrl: env.TSA_URL,     // which TSA endpoint failed (safe: operator-configured)
  errorName: err?.name,    // 'AbortError', 'TypeError', 'Error' -- categorizes the failure
  errorCode: classifyTsaError(err),  // see section 4
}
```

**What to include and why:**

- `event: 'capture.tsa_fail'` -- consistent naming pattern (`capture.<noun>_fail`)
- `captureId` / `tenantId` / `cip` -- every event in this subsystem includes these three;
  omitting any one of them breaks cross-event correlation in Coralogix
- `tsaUrl: env.TSA_URL` -- tells operators immediately which TSA is down; this value is
  operator-configured (not user-supplied), so it is safe under the INVARIANT
- `errorName: err?.name` -- JavaScript error class names (`AbortError` from
  `AbortSignal.timeout()`, `TypeError` from network failure, plain `Error` from DER parsing
  or validation) are framework-generated, not user-supplied; safe under the INVARIANT
- `errorCode` -- a static enum derived from the error message (see section 4); enables
  PromQL-style grouping in Coralogix without putting raw error strings in the payload

**What NOT to include:**

- `errorMessage: err?.message` -- see section 4 for the INVARIANT analysis; this must not
  go in the payload without sanitization, and sanitization here adds complexity for marginal
  gain given that `errorCode` already categorizes the failure
- `bundleHash` -- the hash is already stored in the WACZ/KV on success; logging it on
  failure adds no operational value and would bloat the event
- HTTP response body from the TSA -- never; attacker-controlled content

---

## 4. Are `rfc3161.js` Error Messages Safe for the INVARIANT?

**Mixed. Classify them into a static enum rather than logging raw messages.**

Breaking down all `throw` sites in `rfc3161.js`:

| Error message | Safe? | Reason |
|---|---|---|
| `bundleHash must start with "sha256:"` | Yes | Static string, no user data |
| `bundleHash SHA-256 hex must be 64 characters` | Yes | Static string, no user data |
| `TSA returned HTTP ${resp.status}` | **Borderline** | `resp.status` is an integer from the TSA response; it cannot contain injection payloads but it is TSA-controlled input, not a static value |
| `TSA response too large: ${arrayBuf.byteLength} bytes...` | **Borderline** | `byteLength` is an integer, low risk but still TSA-controlled |
| `DER: ...` (all DER parsing errors) | **No** | Some include `offset` and `length` values derived from the TSA response buffer -- TSA-controlled integers embedded in the string |
| `TSA rejected request with PKIStatus ${status}` | **Borderline** | Integer from TSA response |
| `Nonce mismatch: ...` | Yes | Static string, no variable interpolation |
| `messageImprint mismatch: ...` | Yes | Static string, no variable interpolation |
| `DER: child index ${index} not found (only ${i} children present)` | **No** | TSA-controlled integers interpolated into string |
| `GeneralizedTime must be UTC (trailing Z required)` | Yes | Static string |

The INVARIANT says: "attacker-controlled input" must not appear in `data`. The TSA is
operator-configured and not directly user-controlled. However, the TSA endpoint is an
external party, and a misconfigured or malicious TSA could craft response bytes that
influence DER error message content. The safer design is to not rely on that reasoning
and instead classify errors into a bounded static enum.

**Recommended `classifyTsaError()` helper:**

```js
function classifyTsaError(err) {
  const msg = err?.message ?? '';
  if (err?.name === 'AbortError' || msg.includes('timeout') || msg.includes('Timeout')) {
    return 'timeout';
  }
  if (msg.startsWith('TSA returned HTTP')) return 'http_error';
  if (msg.startsWith('TSA response too large')) return 'response_too_large';
  if (msg.startsWith('TSA rejected request with PKIStatus')) return 'tsa_rejected';
  if (msg.startsWith('Nonce mismatch')) return 'nonce_mismatch';
  if (msg.startsWith('messageImprint mismatch')) return 'imprint_mismatch';
  if (msg.startsWith('DER:')) return 'der_parse_error';
  if (err?.name === 'TypeError') return 'network_error';
  return 'unknown';
}
```

This function is the only place that touches `err.message`. Its output is one of a small
set of static string literals -- safe under the INVARIANT. The caller logs only `errorCode`
(the return value) and `errorName` (the JS class name), never the raw message.

The `classifyTsaError` helper belongs in `wacz.js` as a module-private function, co-located
with the catch block that uses it. It should not be exported or moved to `rfc3161.js`
(which has no knowledge of logging).

---

## 5. `await` vs Fire-and-Forget

**Use `await`.**

The existing pattern in `capture.js` is instructive: almost every `log()` call is
`await`-ed. The only structural exception is that `log()` itself does an internal
fire-and-forget (`.catch(() => {})`) for the Coralogix HTTP request, so the `await`
in the caller does not block the Worker for the full round-trip -- it resolves when the
fetch is dispatched, not when Coralogix acknowledges it.

More concretely: `log()` returns `undefined` when Coralogix is not configured (dev/test)
and returns a `Promise<void>` in production. Using `await` is always safe and ensures
that if `log()` is ever changed to be truly blocking, callers do not silently lose logs.
Fire-and-forget from the caller (not `await`-ing) would make the log event vulnerable to
being dropped if the Worker's execution context terminates before the dispatch completes --
a realistic risk in a `ctx.waitUntil()` path.

The TSA catch block is inside `buildWacz()`, which is called inside `capture.js` in a
`try/catch` that is itself inside a `ctx.waitUntil()` callback. There is no
`ctx.waitUntil()` available inside `wacz.js` -- it is not threaded through. This means
the log call must complete (or at least be dispatched) before `buildWacz()` returns, which
is another reason to `await` it synchronously from the catch block.

However: `buildWacz()` currently has no `env` parameter in its signature for Coralogix
credentials. The `env` object must be passed in. See section 6.

---

## 6. Signature Change Required

The current `buildWacz()` signature:

```js
export async function buildWacz(url, captureDate, artifacts, env)
```

`env` is already present and contains `TSA_URL`, `SIGNING_KEY`, etc. It also contains
`CORALOGIX_ENDPOINT` and `CORALOGIX_SEND_KEY` (used by `log()`). So no signature change
is needed -- `log(env, ...)` can be called directly from inside the TSA catch block.

---

## 7. The `timestampStatus: 'error'` Change

The task requires adding `'error'` as a third value alongside `'present'` and `'absent'`.
The current return at line 154:

```js
timestampStatus: tsaResult ? 'present' : 'absent'
```

This must become:

```js
timestampStatus: tsaResult ? 'present' : (tsaFailed ? 'error' : 'absent')
```

Where `tsaFailed` is a boolean set to `true` in the catch block. This means the catch
block needs to both set `tsaFailed = true` and emit the log event.

The JSDoc return type at line 44 must also be updated:

```js
* @returns {Promise<{ ..., timestampStatus: 'present'|'absent'|'error' } | null>}
```

The caller in `capture.js` at line 230 logs `timestampStatus` in `capture.success`:

```js
timestampStatus: waczInfo?.timestampStatus ?? 'skipped',
```

This already handles the new `'error'` value correctly -- it will propagate to Coralogix
as `timestampStatus: 'error'` in the `capture.success` event, giving operators a second
signal (in addition to `capture.tsa_fail`) at the capture-level view.

---

## 8. Complete Catch Block (Recommended Implementation)

```js
// Step 8.5: Request RFC 3161 timestamp (optional, graceful degradation)
let tsaResult = null;
let tsaFailed = false;
if (env.TSA_URL) {
  try {
    tsaResult = await requestTimestamp(env.TSA_URL, bundleHash);
  } catch (err) {
    tsaFailed = true;
    await log(env, 4, 'capture', {
      event: 'capture.tsa_fail',
      captureId,
      tenantId,
      cip,
      tsaUrl: env.TSA_URL,
      errorName: err?.name,
      errorCode: classifyTsaError(err),
    });
  }
}
```

Note: `captureId`, `tenantId`, and `cip` are not currently in scope in `wacz.js` -- they
live in `capture.js`. The implementation team has two options:

**Option A (preferred):** Pass `{ captureId, tenantId, cip }` as a context object into
`buildWacz()` alongside `env`. This is minimal: three additional fields on an existing
parameter, or a new optional `logCtx` parameter.

**Option B:** Emit the `capture.tsa_fail` log from `capture.js` instead of from
`wacz.js`. Propagate the failure upward by having `buildWacz()` return
`timestampStatus: 'error'` (without logging), and let `capture.js` log when it sees that
status. This keeps `wacz.js` free of logging concerns, at the cost of adding conditional
logic to `capture.js`'s success path.

Option A is cleaner for observability because the log event is co-located with the failure
site. Option B avoids changing `buildWacz()`'s signature (beyond the `env` that is already
present). Given that `env` is already threaded through and `captureId`/`tenantId`/`cip`
are the only additions, Option A is preferred -- but this is an implementation decision
for the engineering team.

If Option B is chosen, `classifyTsaError()` still belongs in `wacz.js` and its output
must be included in the returned result for `capture.js` to log.

---

## 9. Summary of Recommendations

| Decision | Recommendation |
|---|---|
| Severity | 4 (warn) |
| Subsystem | `'capture'` |
| Event name | `'capture.tsa_fail'` |
| `await` vs fire-and-forget | `await` |
| Raw error messages in payload | No -- use `classifyTsaError()` enum |
| `errorName` in payload | Yes -- JS error class names are framework-generated, not user-supplied |
| `tsaUrl` in payload | Yes -- operator-configured, not user-supplied |
| `timestampStatus: 'error'` | Yes -- add as third enum value; update JSDoc |
| Where to log | Inside the catch block in `wacz.js` (Option A) |
| Helper function | `classifyTsaError(err)` private to `wacz.js` |
