## Domain Plan Contribution: debugger-minion

### Recommendations

#### 1. Capture pipeline log placement -- exact insertion points in `src/capture.js`

The pipeline has five distinct outcome paths. Each needs a log call at a specific location, and the placement relative to KV updates matters for debugging production issues where logs arrive but KV state is ambiguous.

**Path A: Renderer rejection (lines 99-103)**

```
renderer rejects -> categorizeError() -> failCapture() -> return
```

Insert log **after** `categorizeError()` but **before** `failCapture()`. Rationale: if KV write fails (it can throw), the log still records what happened. The log should include the categorized error type (timeout, subresource limit, size limit, session pool, navigation failure, unknown) and the `retryable` flag. Do NOT log `renderResult.reason` directly -- it may contain internal details. Log only the output of `categorizeError()`, which is already sanitized for user-safety. Severity: `error`.

Suggested fields: `{ stage: 'render', outcome: 'rejected', errorCategory: message, retryable, captureId, url }`.

**Path B: R2 write failures (lines 110-119)**

The `Promise.all()` for R2 writes can reject. Currently this falls through to the catch-all at line 157. There is no dedicated catch around the R2 block, which means the catch-all logs a generic "Capture could not be completed" via `failCapture()`.

Recommendation: **wrap lines 110-119 in their own try/catch** or at minimum, add a log at the catch-all that distinguishes R2 failures from other unexpected errors. If a dedicated try/catch is added:

- Log at `error` severity with `{ stage: 'r2_write', outcome: 'failed', captureId, url }`.
- Do NOT log `err.message` from R2 -- Cloudflare R2 errors may contain internal bucket/key details. Log only that it failed and which artifact type(s) were being written (inferred from the operation, not from the error).
- After logging, call `failCapture()` and return (same as Path A pattern).

If the team decides not to refactor the try/catch structure (keeping the flat approach), then the catch-all log at line 157 needs to differentiate -- see Path E below.

**Path C: WACZ bundling failure (lines 150-154)**

Currently: `console.warn('WACZ bundling failed unexpectedly; capture completed without bundle')`.

This is the "completed without bundle" path. The capture still succeeds with individual artifacts. The question is `warn` vs `error`:

- **Use `warn`, not `error`**. This is correct behavior: the system is doing exactly what it was designed to do (degrade gracefully). The capture completes. The user gets their artifacts. If WACZ bundling is failing systematically, that will be visible as a sustained `warn` rate -- which is exactly what dashboards are for. Logging at `error` would trigger alert fatigue on a non-critical path.
- Replace the bare `console.warn()` with a structured log call: `{ stage: 'wacz_bundle', outcome: 'failed', captureId, url, severity: 'warn' }`.
- Do NOT log `err.message` or `err.stack` from the WACZ error. The `buildWacz()` function calls into signing, WARC building, CDXJ, and ZIP assembly -- errors from any of these could leak internal state (key paths, hash values, file sizes). Log only that bundling failed.

**Path D: Successful completion (line 156)**

Insert a log call **after** `completeCapture()` succeeds. Rationale: logging before KV write is misleading if KV subsequently fails. Logging after confirms the capture is fully persisted.

Severity: `info`. Fields: `{ stage: 'complete', captureId, url, hasWacz: !!waczInfo, artifactCount: Object.keys(artifacts).length }`.

One subtlety: if `completeCapture()` throws (KV write fails), this path falls into the catch-all. The `info` log never fires. This is correct -- the capture is not actually complete.

**Path E: Catch-all (lines 157-162)**

This is the most dangerous path for observability because it swallows two potential failures: the original error AND the `failCapture()` KV write.

Current code:
```js
} catch (err) {
  try {
    await failCapture(env.KV, captureId, 'Capture could not be completed', true);
  } catch { /* KV write failed -- nothing more we can do */ }
}
```

Insert TWO log calls:

1. **Before** `failCapture()`: log the original error at `error` severity. This is the only record of what went wrong. Fields: `{ stage: 'catch_all', outcome: 'unexpected_error', captureId, url }`. For the error details: log `err.name` and a sanitized classification (similar to `categorizeError()`) but NOT `err.message` or `err.stack` (they could contain R2 keys, KV details, or other internals). If the team wants richer diagnostics, log `err.constructor.name` which reveals the error class without leaking message content.

2. **In the inner catch** (the `catch {}` at line 161): log at `error` severity that the KV write itself failed. Fields: `{ stage: 'catch_all', outcome: 'kv_write_also_failed', captureId }`. This is critical: without this log, a capture can enter a black hole -- the original operation failed, the KV status update failed, and there is zero observability. The capture stays `pending` until TTL expiry (24h) with no record of why.

#### 2. Security event logging in `src/index.js`

Three rejection points need security event log calls:

**Auth failures (line 70: `if (!auth.ok)`)**

Insert log **after** the auth check returns `{ ok: false }` and **before** the response is returned. The `auth` result contains only `{ ok: false, response }` -- the `response` object is a pre-built `problemResponse()` and does not expose any sensitive details. The log should NOT attempt to extract or log the provided API key, the auth header, or any portion thereof.

Fields: `{ event: 'auth_failure', ip: request.headers.get('CF-Connecting-IP'), severity: 'warn' }`. The auth module distinguishes missing header, wrong scheme, and invalid key -- but the `auth.response` is already built and the discriminant is not exposed in the return value. If finer-grained logging is wanted (distinguishing "no header" from "bad key"), the `verifyApiKey()` function needs to return a reason code alongside the response. This is a minor refactor in `src/auth.js`. Alternatively, log the HTTP status code from `auth.response.status` -- 503 (misconfigured) vs 401 (all auth failures) provides minimal discrimination but avoids touching the auth module.

**Rate limit hits (lines 77, 83, 241, 318)**

There are four rate limit checks: two in `handleCreateCapture` (per-IP and global), one in `handleVerifyCapture`, and one in `handleGetSigningKey`. All four need a security event log.

Fields: `{ event: 'rate_limit', limiter: 'capture_per_ip' | 'capture_global' | 'verify' | 'signing_key', ip: request.headers.get('CF-Connecting-IP'), severity: 'warn' }`.

Place each log **before** the `return problemResponse(429, ...)` call.

**SSRF blocks (line 104: `if (!result.ok)` from `validateUrl`)**

Insert log **after** `validateUrl()` returns `{ ok: false }` and **before** returning the problem response.

Fields: `{ event: 'ssrf_block', reason: result.detail, ip: request.headers.get('CF-Connecting-IP'), severity: 'warn' }`.

Using `result.detail` is safe here: the `validateUrl()` function is explicitly designed to never include the raw URL or resolved IP in its `detail` strings (confirmed by reading the code -- all rejection messages are static strings or contain only the URL scheme, never the hostname or IP).

One exception: the scheme rejection at line 339 includes `parsed.protocol` in the detail string (`URL scheme 'ftp' is not allowed`). This is intentional and safe -- it's the scheme, not the host. But note that `result.status === 400` for scheme/parse errors and `result.status === 422` for SSRF-specific blocks (private IP, credentials, double-encoding). A truly security-relevant SSRF block has `status === 422`. Consider filtering the security log to only fire for 422s, or at minimum include `result.status` in the log fields so dashboards can differentiate "bad URL format" (noise) from "attempted SSRF" (signal).

#### 3. Log ordering relative to KV updates -- the general principle

**Log before KV writes for failures. Log after KV writes for successes.**

Rationale:
- On failure paths, the KV write itself may fail. If you log after KV, you lose the failure record entirely. Logging before KV ensures the failure is always recorded.
- On success paths, logging before KV creates false-positive "completed" records if KV subsequently fails. The success log should only fire once KV has confirmed persistence.

This asymmetry is deliberate. It biases toward never losing failure information (even at the cost of a failure log + a subsequent KV failure, which means two logs for one event -- acceptable).

#### 4. Header capture failure is silent -- add a log

At line 106, if `headerResult.status === 'rejected'`, the code silently falls back to `headers = null`. This is correct behavior (headers are optional), but it should log at `warn` severity: `{ stage: 'header_fetch', outcome: 'failed', captureId, url }`. Without this, a systematic header fetch failure (e.g., DNS misconfiguration, fetch timeout changes) would be invisible.

#### 5. What NOT to log (security constraints)

The existing codebase is meticulous about information leakage. The logging layer must maintain this standard:

- **Never** log `err.message` or `err.stack` from errors originating in R2, KV, browser rendering, or signing operations. These may contain internal infrastructure details (bucket names, key paths, session IDs, key material paths).
- **Never** log the raw URL being captured in error-path logs if there's any risk the URL itself is attacker-controlled (it always is -- it comes from the user). In structured logs, including the URL in a dedicated field is acceptable (Coralogix can mask/redact fields), but it must never be interpolated into log message strings.
- **Never** log API keys, auth headers, or any derivative thereof.
- **Never** log resolved IP addresses from `validateUrl()` results in security event logs. The `result.ip` field in success cases is informational, but in rejection logs it would reveal internal network topology if an SSRF attempt resolves.
- The `categorizeError()` output is safe to log -- it was designed to produce user-safe messages.

### Proposed Tasks

1. **Map each error path to its log call with exact line numbers and fields** -- this is the instrumentation spec. Must be done before any code is written so the implementer knows exactly what to insert where. My recommendations above serve as this spec.

2. **Decide on the `err.message` sanitization strategy for the catch-all path** -- either: (a) classify errors similarly to `categorizeError()` and log only the classification, or (b) log `err.constructor.name` only, or (c) create a second `categorizeError()`-like function for non-renderer errors. Option (a) is most informative but requires enumerating expected R2/KV error types. Option (b) is safest but least informative. Recommendation: start with (b) and upgrade to (a) only if catch-all errors prove hard to diagnose in practice.

3. **Add a reason code to `verifyApiKey()` return value** (optional, minor refactor) -- to distinguish "missing header" / "wrong scheme" / "invalid key" / "misconfigured" in auth failure logs. Without this, all auth failures log identically.

4. **Add `warn`-level log at line 106 for failed header fetch** -- this is a gap that will be invisible without logging.

5. **Verify that the `log()` function itself cannot throw in a way that disrupts the capture pipeline** -- the log function must be infallible (swallow its own errors). If `log()` throws inside the try block of `performCapture()`, it cascades to the catch-all and triggers a `failCapture()` for a capture that actually succeeded in rendering. The log function must have its own internal try/catch or must be a fire-and-forget `console.log()` wrapper. This is a hard requirement.

6. **Verify log output works with Cloudflare Workers `console.log()`** -- Cloudflare Workers forward `console.log()` to the Workers Logpush pipeline, which can send to Coralogix. Structured JSON output via `console.log(JSON.stringify({...}))` is the standard pattern. Confirm that the planned `log()` function uses this transport and that Coralogix ingestion is configured for the logpush destination.

### Risks and Concerns

1. **Log function throws inside try block -- capture pipeline disruption.** If the `log()` function is not infallible, a logging failure inside the try block (lines 93-156) will cascade to the catch-all and mark a successful capture as failed. This is the highest-risk item. The `log()` implementation MUST wrap its internals in try/catch and never propagate exceptions. Test this explicitly: inject a `log()` that throws, verify the capture still completes.

2. **Double-logging on the catch-all path.** If a `log()` call is inserted at the render rejection path (Path A) or the R2 failure path (Path B), AND those paths also reach the catch-all (they shouldn't, but if someone refactors), the same failure could be logged twice with different stages. The current code structure prevents this (Path A returns early, Path B falls through only if no dedicated catch is added), but future refactors could break this invariant. Add a comment at each log site noting which path it serves.

3. **Log volume under attack.** Rate limit hits and auth failures can generate high log volume during an attack. If Coralogix charges per log volume, this could be expensive. Consider: (a) sampling security event logs under high volume, or (b) aggregating (count per IP per minute) rather than logging every individual event. For MVP, per-event logging is fine -- address volume when it becomes a problem.

4. **WACZ error path loses error details.** The current `catch (err)` at line 150 discards `err` entirely. Even if we don't log `err.message`, we should log `err.name` or `err.constructor.name` to distinguish between signing errors, ZIP errors, WARC errors, etc. This is safe (class names are not secrets) and essential for diagnosing systematic WACZ failures.

5. **The inner catch at line 161 currently has an empty body.** This is the "KV write failed, nothing more we can do" case. If the log call inserted here also fails (e.g., if both KV and console.log are broken, which happens during platform incidents), the capture is truly unobservable. This is an accepted residual risk -- there is no further fallback available. But document it explicitly in a comment.

6. **`completeCapture()` silent return on missing record.** At `kv.js` line 58, `completeCapture()` returns silently if the KV record is missing (expired or not found). This means a capture that took longer than 24h (the pending TTL) will log as `complete` in the observability system but have no KV record. The log and KV will disagree. This is an existing bug/limitation, not introduced by logging, but logging will make it visible for the first time. Add a `warn` log inside `completeCapture()` for the early-return path, or at minimum, have `completeCapture()` return a boolean indicating whether it actually wrote, and log accordingly in `capture.js`.

### Additional Agents Needed

None beyond what is presumably already involved. The planning question is well-scoped for a debugger analysis. The implementation itself is straightforward instrumentation work -- no additional specialist perspective is needed for the log placement decisions.

One note: if Coralogix integration involves configuring Cloudflare Logpush (the transport layer), that is an infrastructure concern. The iac-minion should handle the Logpush destination configuration. But the question asked here is about log call placement in application code, which does not require iac-minion input.
