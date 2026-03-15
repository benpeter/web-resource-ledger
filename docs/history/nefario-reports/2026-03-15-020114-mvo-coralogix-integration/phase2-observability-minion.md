# Domain Plan Contribution: observability-minion

## Recommendations

### 1. Log Entry Schema: Common Envelope vs. Stage-Specific Fields

After reading the codebase, the capture pipeline has two distinct logging contexts: (a) the multi-stage capture pipeline in `capture.js` operating inside `ctx.waitUntil()`, and (b) synchronous rejection points in `index.js` (auth, rate limit, SSRF). The schema must serve both without branching logic.

**Common envelope** (present on every log entry):

| Field | Type | Source | Rationale |
|-------|------|--------|-----------|
| `timestamp` | number (ms epoch) | `Date.now()` | Coralogix accepts millisecond timestamps; `Date.now()` is cheapest |
| `severity` | int (1-6) | caller | Coralogix severity: 1=debug, 2=verbose, 3=info, 4=warn, 5=error, 6=critical |
| `applicationName` | string | hardcoded `"wrl"` | Matches `name = "wrl"` in wrangler.toml |
| `subsystemName` | string | caller | Identifies the module: `"capture"`, `"auth"`, `"security"`, `"wacz"` |
| `text` | string (JSON) | caller | Coralogix expects the log body here; we stringify the structured payload into this field |

**Structured payload** (inside `text` as JSON string):

| Field | Type | When present | Purpose |
|-------|------|-------------|---------|
| `event` | string | always | Machine-readable event name: `"capture.success"`, `"capture.stage.fail"`, `"security.auth_fail"`, etc. |
| `captureId` | string | capture pipeline events | Correlation key -- links log to specific capture |
| `stage` | string | pipeline failure events | `"browser_render"`, `"r2_write"`, `"kv_write"`, `"wacz_bundle"`, `"wacz_sign"`, `"catch_all"` |
| `errorCategory` | string | failure events | Output of `categorizeError()` message field (already sanitized) |
| `retryable` | boolean | failure events | From `categorizeError()` |
| `durationMs` | number | success events | Total pipeline wall time (`Date.now() - start`) |
| `bundleSize` | number | success events with WACZ | `waczBytes.byteLength` |
| `waczStatus` | string | success events | `"ok"`, `"skipped"` (no key), or `"failed"` (error caught) |
| `reason` | string | security events | Why the request was rejected: `"missing_auth"`, `"invalid_key"`, `"rate_limit"`, `"ssrf_block"`, etc. |

**Design rationale**: Coralogix's `/singles` endpoint expects `text` as the log body. Putting the structured payload as a JSON string inside `text` means Coralogix auto-parses it for indexing and querying. The outer fields (`applicationName`, `subsystemName`, `severity`) are Coralogix's native classification dimensions -- using them correctly enables Coralogix's built-in filtering, severity-based views, and TCO Optimizer tiering without custom parsing rules.

**What NOT to include**: No `service` field (redundant with `applicationName`). No `trace_id` or `span_id` (no distributed tracing in scope -- these would be empty placeholders violating YAGNI). No `level` string (Coralogix uses integer severity natively; a redundant string adds bytes for no query benefit).

### 2. Severity Level Mapping

Coralogix severity integers and their mapping to WRL events:

| Coralogix Severity | Int | WRL Events |
|-------------------|-----|------------|
| INFO | 3 | Capture success (`capture.success`) |
| WARNING | 4 | WACZ bundling failed but capture completed (`capture.wacz_fail`), rate limit hit (`security.rate_limit`) |
| ERROR | 5 | Pipeline stage failure (`capture.stage.fail`), catch-all failure (`capture.fail`), auth failure (`security.auth_fail`), SSRF block (`security.ssrf_block`) |

**Rationale for each mapping**:

- **Capture success = INFO (3)**: Normal operation. This is the baseline signal. In Coralogix, INFO severity is the default view -- operators see the stream of successful captures at a glance.

- **WACZ bundle failure = WARNING (4)**: The capture still completed with individual artifacts. The user got their screenshot and HTML. The WACZ is an enhancement that degraded gracefully. This matches the existing `console.warn()` pattern in the codebase (line 153 of `capture.js`). WARNING alerts operators to investigate signing key issues without triggering incident response.

- **Pipeline stage failure = ERROR (5)**: The capture failed. The user's request will show `status: "failed"` in KV. This is a user-impacting event that needs operator attention.

- **Catch-all failure = ERROR (5)**: Same rationale as pipeline stage failure, but worse -- something unexpected happened. Still ERROR (not CRITICAL) because the blast radius is one capture, not the entire service.

- **Auth failure = ERROR (5)**: Could indicate credential compromise, brute force, or misconfigured clients. Needs visibility. Not WARNING because auth failures are zero-tolerance events from a security monitoring perspective.

- **SSRF block = ERROR (5)**: An attempt to access private networks. Whether malicious or accidental, this is a security boundary enforcement that needs visibility.

- **Rate limit = WARNING (4)**: Rate limits are normal under load. They are capacity protection, not security incidents. WARNING allows operators to notice trends (is a client misconfigured? is traffic growing?) without flooding the ERROR severity tier.

**What NOT to use**: DEBUG (1) and VERBOSE (2) are not used. There are no debug-level logs in production. CRITICAL (6) is not used -- no single event in this worker represents a service-level outage (each failure affects one capture, not all captures).

### 3. Log Helper Function Design

The function must: (a) build the Coralogix `/singles` payload, (b) fire a `fetch()` call, (c) swallow all errors, (d) stay under 30 lines. Here is the recommended implementation shape:

```js
/**
 * Ships a structured log entry to Coralogix. Fire-and-forget.
 * Silently no-ops if CORALOGIX_ENDPOINT or CORALOGIX_SEND_KEY is absent.
 *
 * @param {object} env Worker env bindings
 * @param {number} severity Coralogix severity (1-6): 3=info, 4=warn, 5=error
 * @param {string} subsystem Module name: "capture", "auth", "security", "wacz"
 * @param {object} data Structured payload (event, captureId, stage, etc.)
 */
export function log(env, severity, subsystem, data) {
  if (!env.CORALOGIX_ENDPOINT || !env.CORALOGIX_SEND_KEY) return;
  const body = JSON.stringify([{
    applicationName: 'wrl',
    subsystemName: subsystem,
    severity,
    timestamp: Date.now(),
    text: JSON.stringify(data),
  }]);
  fetch(env.CORALOGIX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CORALOGIX_SEND_KEY}`,
    },
    body,
  }).catch(() => {});
}
```

**Line count**: 17 lines of code (excluding JSDoc and blank lines). Well under the 30-line constraint.

**Key design decisions**:

1. **Synchronous function, not async**: The `fetch()` call returns a Promise, but we don't await it. The `.catch(() => {})` handles rejection silently. This means the function returns immediately -- no await needed at call sites. In `capture.js` where the code runs inside `ctx.waitUntil()`, the fetch will complete because Workers keep the isolate alive for `waitUntil` promises. In `index.js` for security events, the fetch may be cut short if the isolate terminates before it completes -- this is acceptable because security events are best-effort observability, not guaranteed delivery. If guaranteed delivery is needed later, the call site can wrap in `ctx.waitUntil(log(...))`, but that is a separate concern from the helper's design.

2. **No batching**: Each log call sends one entry. The Coralogix `/singles` endpoint accepts arrays, but batching requires either buffering (adds state) or collecting (adds complexity). One-entry arrays are the simplest correct approach. The overhead is one fetch per log event. For a capture pipeline that runs ~5 stages, that is 1-2 log events per capture (success or failure). At the current rate limit of 200 captures/minute globally, this is at most ~400 fetches/minute to Coralogix -- negligible.

3. **Guard clause for missing config**: If either `CORALOGIX_ENDPOINT` or `CORALOGIX_SEND_KEY` is absent, the function returns immediately. This handles: (a) local development where Coralogix is not configured, (b) preview environments, (c) test environments. No test will accidentally call Coralogix.

4. **`applicationName` hardcoded to `"wrl"`**: Matches the wrangler.toml `name` field. No reason to make this configurable -- this is a single-service worker.

5. **`subsystemName` as a parameter**: Different modules (`capture.js`, `index.js`) pass their own subsystem name. This is the primary Coralogix dimension for filtering ("show me all auth events" vs. "show me all capture events").

6. **`data` object as the structured payload**: Caller constructs the payload with whatever fields are relevant. The helper does not validate or filter -- it just serializes. This keeps the helper generic and under 30 lines.

### 4. Coralogix REST API Integration Details

**Endpoint URL**: The Coralogix `/singles` endpoint follows the pattern:
```
https://ingress.<region>.coralogix.com/logs/v1/singles
```

Regional domains (determined by the Coralogix account region):
- US1: `ingress.us1.coralogix.com`
- US2: `ingress.us2.coralogix.com`
- EU1: `ingress.eu1.coralogix.com`
- EU2: `ingress.eu2.coralogix.com`
- AP1: `ingress.ap1.coralogix.com`
- AP2: `ingress.ap2.coralogix.com`
- AP3: `ingress.ap3.coralogix.com`

**Configuration in wrangler.toml**: The `CORALOGIX_ENDPOINT` should be the full URL (e.g., `https://ingress.eu1.coralogix.com/logs/v1/singles`) stored as a `[vars]` entry. The `CORALOGIX_SEND_KEY` (the "Send Your Data" API key from Coralogix) must be stored as a secret via `wrangler secret put`, not in wrangler.toml.

```toml
[vars]
CORALOGIX_ENDPOINT = "https://ingress.eu1.coralogix.com/logs/v1/singles"
```

**Why CORALOGIX_ENDPOINT as a var, not hardcoded**: The endpoint is region-specific. If the Coralogix account moves regions or the project adds a staging environment in a different region, only the wrangler.toml var changes. No code change needed.

**Why CORALOGIX_SEND_KEY as a secret**: This is an API key that grants write access to the Coralogix account. It must not appear in source control or `[vars]`. The `wrangler secret put CORALOGIX_SEND_KEY` command stores it encrypted in Cloudflare's secret store, accessible only at runtime via `env.CORALOGIX_SEND_KEY`.

**Payload format** (Coralogix `/singles` expects an array):

```json
[{
  "applicationName": "wrl",
  "subsystemName": "capture",
  "severity": 3,
  "timestamp": 1710500000000,
  "text": "{\"event\":\"capture.success\",\"captureId\":\"cap_abc123\",\"durationMs\":4200,\"waczStatus\":\"ok\",\"bundleSize\":128456}"
}]
```

**Authentication**: `Authorization: Bearer <send-key>` header.

**Message size limit**: Coralogix enforces a 2MB limit per request. A single structured log entry will be well under 1KB. Not a concern.

### 5. Event Naming Convention

Use a dot-separated hierarchy for the `event` field. This enables Coralogix queries like `event:capture.*` to match all capture events or `event:security.*` to match all security events.

**Capture pipeline events**:
- `capture.success` -- pipeline completed, artifacts stored
- `capture.stage.fail` -- a specific pipeline stage failed
- `capture.fail` -- catch-all failure (unexpected error)
- `capture.wacz_fail` -- WACZ bundling failed but capture completed

**Security events**:
- `security.auth_fail` -- missing or invalid API key
- `security.ssrf_block` -- URL validation rejected a private/reserved IP
- `security.rate_limit` -- per-IP rate limit exceeded
- `security.capacity_limit` -- global capacity rate limit exceeded

### 6. Call Site Placement in capture.js

Based on my reading of the pipeline flow in `capture.js`:

**Render failure (line 99-103)**: Log after `categorizeError()` but before `failCapture()`. The error has been categorized, and the log should capture the stage, error category, and retryable flag. Stage: `"browser_render"`.

```js
if (renderResult.status === 'rejected') {
  const { message, retryable } = categorizeError(renderResult.reason);
  log(env, 5, 'capture', { event: 'capture.stage.fail', captureId, stage: 'browser_render', errorCategory: message, retryable });
  await failCapture(env.KV, captureId, message, retryable);
  return;
}
```

**R2 write failure**: Currently not individually caught -- a failure in the `Promise.all` at lines 110-119 falls through to the catch-all at line 157. To get stage-level granularity, the `Promise.all` should be wrapped in its own try/catch with stage `"r2_write"`. Alternatively, the catch-all can log with stage `"catch_all"` and accept less granularity. I recommend the former -- it adds 4 lines and produces much more useful log data. The catch-all is a safety net, not a diagnostic tool.

**WACZ bundling failure (line 150-154)**: Log at WARNING severity. Stage: `"wacz_bundle"`. Replace the `console.warn()` with a structured log.

```js
} catch (err) {
  log(env, 4, 'capture', { event: 'capture.wacz_fail', captureId });
}
```

**Capture success (after line 156)**: Log at INFO severity with duration, WACZ status, and bundle size. This requires adding `const start = Date.now()` at the top of `performCapture()`.

```js
await completeCapture(env.KV, captureId, artifacts, waczInfo);
log(env, 3, 'capture', {
  event: 'capture.success', captureId,
  durationMs: Date.now() - start,
  waczStatus: waczInfo ? 'ok' : 'skipped',
  bundleSize: waczInfo?.size ?? 0,
});
```

**Catch-all failure (line 157-162)**: Log at ERROR severity. This is the last-resort handler.

```js
} catch (err) {
  log(env, 5, 'capture', { event: 'capture.fail', captureId, stage: 'catch_all' });
  try {
    await failCapture(env.KV, captureId, 'Capture could not be completed', true);
  } catch { /* KV write failed -- nothing more we can do */ }
}
```

### 7. Call Site Placement in index.js

**Auth failure (line 70)**: After `verifyApiKey()` returns `{ ok: false }`, before returning the response.

**Rate limit hit (line 77, 83)**: After the rate limiter returns `{ success: false }`.

**SSRF block (line 104)**: After `validateUrl()` returns `{ ok: false }`, before returning the response.

For all of these, the `log()` call is inline (not in `ctx.waitUntil()`) because these are synchronous rejection paths. The fire-and-forget `fetch()` inside `log()` will attempt to send but may be cut short if the isolate terminates before the fetch completes. This is acceptable -- these events are best-effort. If delivery reliability is needed, wrap in `ctx.waitUntil(Promise.resolve(log(...)))`, but that adds complexity for marginal benefit. The simpler path is: just call `log()` and accept occasional loss for synchronous rejections.

**Important nuance**: In `handleCreateCapture`, the `ctx` parameter is available. For security events in the request path, wrapping in `ctx.waitUntil()` would guarantee delivery without blocking the response. This is worth doing -- it costs one line per call site and the ctx is already in scope. Recommendation: use `ctx.waitUntil(Promise.resolve(log(...)))` for security events in `index.js`.

Actually, since `log()` returns `undefined` (not a Promise), `ctx.waitUntil()` needs the fetch Promise to keep alive. This means the helper should return the fetch Promise (or undefined if no-op). A minor design adjustment:

```js
export function log(env, severity, subsystem, data) {
  if (!env.CORALOGIX_ENDPOINT || !env.CORALOGIX_SEND_KEY) return;
  // Return the promise so callers CAN await or pass to ctx.waitUntil() if desired
  return fetch(env.CORALOGIX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CORALOGIX_SEND_KEY}`,
    },
    body: JSON.stringify([{
      applicationName: 'wrl',
      subsystemName: subsystem,
      severity,
      timestamp: Date.now(),
      text: JSON.stringify(data),
    }]),
  }).catch(() => {});
}
```

This way:
- In `capture.js` (inside `ctx.waitUntil`): just call `log(env, ...)` -- the fetch is already kept alive by the outer `waitUntil`.
- In `index.js` (synchronous path): call `ctx.waitUntil(log(env, ...) ?? Promise.resolve())` to ensure the fetch completes even after the response is sent. The `?? Promise.resolve()` handles the no-op case where `log()` returns `undefined`.

## Proposed Tasks

### Task 1: Create `src/log.js` with the `log()` helper
- Single exported function, ~17 lines of code
- Accepts `(env, severity, subsystem, data)`
- Builds Coralogix `/singles` payload, fires `fetch()`, returns the Promise
- Guards on `env.CORALOGIX_ENDPOINT` and `env.CORALOGIX_SEND_KEY`
- No external dependencies
- JSDoc with parameter descriptions and severity level reference

### Task 2: Add `CORALOGIX_ENDPOINT` to wrangler.toml
- Add a `[vars]` section with `CORALOGIX_ENDPOINT`
- The actual URL value can be a placeholder in source control (e.g., empty string or a comment noting it must be set per environment); the real value is set via Cloudflare dashboard or `wrangler vars`
- Add a comment noting `CORALOGIX_SEND_KEY` must be set via `wrangler secret put`

### Task 3: Instrument `src/capture.js` pipeline stages
- Add `import { log } from './log.js'`
- Add `const start = Date.now()` at top of `performCapture()`
- Log at render failure (ERROR, stage `browser_render`)
- Wrap R2 `Promise.all` in try/catch and log R2 failures (ERROR, stage `r2_write`)
- Replace `console.warn` with structured log at WACZ failure (WARNING)
- Log capture success after `completeCapture()` (INFO, with duration and WACZ status)
- Log catch-all failure (ERROR, stage `catch_all`)

### Task 4: Instrument `src/index.js` security events
- Add `import { log } from './log.js'`
- Log auth failures after `verifyApiKey()` returns not-ok (ERROR, subsystem `security`)
- Log rate limit hits after limiter returns not-success (WARNING, subsystem `security`)
- Log SSRF blocks after `validateUrl()` returns not-ok (ERROR, subsystem `security`)
- Use `ctx.waitUntil(log(...) ?? Promise.resolve())` to guarantee delivery

### Task 5: Write tests for `src/log.js`
- Test that `log()` calls `fetch` with correct Coralogix payload structure
- Test that `log()` is a no-op when `CORALOGIX_ENDPOINT` is missing
- Test that `log()` is a no-op when `CORALOGIX_SEND_KEY` is missing
- Test that `log()` swallows fetch errors silently (mock fetch to reject)
- Test severity, subsystemName, applicationName, and timestamp presence
- Test that `text` field contains valid JSON with expected data fields
- Use `globalThis.fetch` mock or vitest `vi.fn()` -- no new dependencies

### Task 6: Verify all existing tests pass
- Run full test suite (17 test files)
- If any test fails due to unmocked fetch calls to Coralogix endpoint, fix by ensuring the guard clause prevents log calls when env vars are absent (test environments should not set these)

## Risks and Concerns

### Risk 1: Fetch calls in non-waitUntil context may be dropped
**Severity**: Low.
**Detail**: In `index.js`, security event logs fire during the synchronous request handler. If `ctx.waitUntil()` is not used, the fetch may be terminated when the isolate shuts down after sending the response. The mitigation (wrapping in `ctx.waitUntil()`) is straightforward but adds a line per call site.
**Mitigation**: Use `ctx.waitUntil(log(...) ?? Promise.resolve())` at all `index.js` call sites.

### Risk 2: Coralogix endpoint misconfiguration causes silent data loss
**Severity**: Low-Medium.
**Detail**: If `CORALOGIX_ENDPOINT` is set to a wrong URL or the `CORALOGIX_SEND_KEY` is invalid, all logs are silently dropped (by design -- errors are swallowed). The operator has no way to know logging is broken from inside the system.
**Mitigation**: This is inherent to the fire-and-forget design and is acceptable for MVP. Future improvement: a health check endpoint that sends a test log and reports success/failure, or a `console.error()` on the first Coralogix rejection per isolate lifetime (rate-limited to avoid log spam).

### Risk 3: Test environment leakage
**Severity**: Low.
**Detail**: If someone sets `CORALOGIX_ENDPOINT` and `CORALOGIX_SEND_KEY` in their local `.dev.vars` file, tests that exercise capture or auth paths will make real HTTP calls to Coralogix.
**Mitigation**: The guard clause in `log()` is sufficient -- test environments should not set these vars. Add a note in the JSDoc or a brief comment. The existing test setup (miniflare) does not inject these bindings, so existing tests are safe.

### Risk 4: Double-logging at catch-all
**Severity**: Low.
**Detail**: If a render failure is logged at the stage level (Task 3) and then the subsequent `failCapture()` call also throws (unlikely but possible), the catch-all handler will log again. This results in two log entries for one failure: one at stage level, one at catch-all level.
**Mitigation**: This is acceptable and actually desirable -- the catch-all log indicates that not only did the capture fail, but the KV status update also failed. These are two distinct failure events. The `stage` field distinguishes them: `"browser_render"` vs. `"catch_all"`. No deduplication needed.

### Risk 5: CORALOGIX_SEND_KEY in Worker memory
**Severity**: Low (inherent to all Workers secrets).
**Detail**: The send key is accessible via `env.CORALOGIX_SEND_KEY` at runtime. This is standard Workers secret binding behavior -- the key is decrypted at request time and available in isolate memory. It is write-only (ingestion), so compromise allows log injection but not data exfiltration from Coralogix.
**Mitigation**: No action needed beyond standard secret hygiene (rotate keys periodically, use minimum-privilege Coralogix API key scoped to ingestion only). Defer to security-minion for final assessment.

### Risk 6: Legacy endpoint deprecation
**Severity**: Medium (time-sensitive).
**Detail**: Coralogix is deprecating legacy ingestion endpoints on March 31, 2026. The new regional format (`ingress.<region>.coralogix.com`) must be used. Since `CORALOGIX_ENDPOINT` is configurable via wrangler.toml vars, the operator controls which URL is used. But the documentation and any setup guides must reference the new format.
**Mitigation**: Document the correct endpoint format in JSDoc and evolution log. Use the new regional format in all examples.

## Additional Agents Needed

**None beyond what the meta-plan already includes.** The three consultations (observability, security, debugger) cover all the domain expertise needed for planning. Specifically:

- **test-minion** is not needed for planning but should review the test approach at Phase 3.5 to confirm the fetch mocking strategy works with the existing test harness (vitest + miniflare).
- **margo** should review at Phase 3.5 to ensure the log helper and call sites stay lean. The 30-line constraint is a good guardrail, but margo should verify the implementation doesn't introduce unnecessary abstraction.
- **security-minion** (already in plan) should confirm the security event field choices -- my recommendations above deliberately exclude client IP and request path from log payloads to avoid information disclosure, but security-minion should validate this decision.
