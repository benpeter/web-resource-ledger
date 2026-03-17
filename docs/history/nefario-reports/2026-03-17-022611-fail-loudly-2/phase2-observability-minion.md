# Observability Minion -- Phase 2 Contribution: Fail Loudly (#70)

## Catch Block Inventory and Log Event Specifications

I audited every `catch` block and `.catch()` call across the non-vendor source files. Below is a complete classification into three categories: (A) blocks that already log correctly, (B) blocks that need structured log events added, and (C) blocks that are intentionally silent and should remain so. Each category includes rationale.

---

### Category A: Already Logging (No Changes Needed)

These catch blocks already emit structured log events via `log()` or return a meaningful error response. No action required.

| File | Line | Current Behavior |
|------|------|-----------------|
| `capture.js:196` | `archiveSigningKey` catch | Logs `capture.key_archive_fail` at severity 4 |
| `capture.js:208` | WACZ bundling catch | Logs `capture.wacz_fail` at severity 4 |
| `capture.js:256` | Catch-all for `performCapture` | Logs `capture.fail` at severity 5 |
| `capture.js:261` | KV failCapture catch | Logs `capture.kv_fail` at severity 5 |
| `capture.js:595` | Consent dismissal catch | Re-throws browser death errors, degrades gracefully with `_error` metadata on consent object; upstream logs `capture.consent_error` at severity 4 |
| `wacz.js:113` | TSA timestamp catch | Logs `capture.tsa_fail` at severity 4 |
| `index.js:261` | `listCaptures` catch | Logs `list.error` at severity 3 (should be 5 -- see Recommendations) |
| `index.js:162` | JSON body parse catch | Returns `problemResponse(400)` -- client error, no log needed |
| `index.js:333` | URL parse catch | Returns `problemResponse(400)` -- client error, no log needed |

---

### Category B: Silent Catch Blocks That Need Log Events

These are the blocks that currently swallow errors silently and need instrumentation. Ordered by operational impact (highest first).

#### B1. `log.js:39` -- `.catch(() => {})` on fetch Promise
#### B2. `log.js:40` -- `catch { return; }` wrapping function body

**Current behavior:** Both silently swallow errors. The fetch `.catch()` drops network failures. The outer `catch` drops JSON serialization or other sync errors.

**Proposed change:** Use `console.error` as the fallback channel for both.

**Event specification:**
- No structured log event (infinite recursion risk -- `log()` cannot call `log()`)
- Fallback: `console.error('wrl:log_delivery_fail', { ... })`
- Fields: `{ event: 'log.delivery_fail', errorName: err?.name, errorMessage: String(err?.message ?? '').slice(0, 256) }`
- For the `.catch()` on fetch: same pattern, `console.error('wrl:log_delivery_fail', ...)`

**See dedicated section below for the log.js meta-logging analysis.**

---

#### B3. `signing.js:83` -- `catch { console.warn('Signing key validation failed'); }`

**Current behavior:** Catches all errors during key import, logs an unstructured `console.warn`, returns `null` (graceful degradation to unsigned captures).

**Proposed log event:**
- **Event name:** `signing.key_import_fail`
- **Severity:** 5 (error) -- a misconfigured signing key is an operator error, not a transient issue. It means every capture will be unsigned until fixed.
- **Subsystem:** `signing`
- **Structured fields:**
  ```json
  {
    "event": "signing.key_import_fail",
    "errorName": "<err.name>",
    "errorMessage": "<err.message, truncated to 256 chars>"
  }
  ```
- **Note:** This catch needs `env` passed through. `getSigningKeys(env)` already receives `env`, so the `log()` call has access to the Coralogix config. Add the error variable to the catch clause (`catch (err)`).
- **Retain `console.warn`** as a secondary channel (defense-in-depth) but make it structured: `console.warn('wrl:signing.key_import_fail', err?.message)`.

---

#### B4. `ip-hash.js:59` -- `catch { return undefined; }`

**Current behavior:** All crypto errors silently return `undefined`. The `cip` field is missing from all subsequent log events for that request, making abuse correlation impossible.

**Proposed log event:**
- **Event name:** `security.cip_hash_fail`
- **Severity:** 4 (warn) -- not a user-facing error, but loss of abuse correlation capability is operationally significant
- **Subsystem:** `security`
- **Structured fields:**
  ```json
  {
    "event": "security.cip_hash_fail",
    "errorName": "<err.name>",
    "errorMessage": "<err.message, truncated to 256 chars>"
  }
  ```
- **Note:** `computeCip` does not currently receive `env` -- only `env?.IP_HASH_SEED`. The function signature needs to change to accept the full `env` object so it can call `log()`. Alternatively, use `console.warn` as the only channel here since this function is called before the main capture pipeline. I recommend changing the signature to `computeCip(env, ip)` (it already is in the callers -- `computeCip(env, clientIp)`) and adding the log call.
- **Actually:** Looking more closely, `computeCip` already receives the full `env` object. The `env?.IP_HASH_SEED` check is just the guard clause. So `log(env, ...)` is directly available. Good.

---

#### B5. `consent.js:71` -- `catch { return { status: 'failed', cmp: null, durationMs: ... }; }`

**Current behavior:** Top-level catch in `dismissCookieConsent` returns a `failed` status object. The caller in `capture.js` does log `capture.consent_error` when `consent._error` is set, but this catch path does NOT set `_error` -- so the error is swallowed entirely.

**Proposed change:** Capture the error and include it in the returned object, so the existing upstream logging path works.

```javascript
} catch (err) {
  return {
    status: 'failed',
    cmp: null,
    durationMs: Date.now() - start,
    _error: { name: err?.constructor?.name ?? 'Unknown', message: String(err?.message ?? '').slice(0, 256) },
  };
}
```

No new log event needed -- the existing `capture.consent_error` event at severity 4 will fire because `_error` is now populated. This keeps the logging responsibility in one place (the capture orchestrator).

---

#### B6. `capture.js:335` -- Session connect race catch

**Current behavior:** `catch { /* fall through */ }` when another worker claims the session between `sessions()` and `connect()`.

**Proposed change:** This is genuinely expected behavior (session pool contention), not an error. However, the "fail loudly" principle says every catch must either log or handle a specific error type. The right fix here is to name the error type:

```javascript
} catch (err) {
  // Expected: another worker claimed session between list and connect
  // Fall through to acquire a new session
}
```

No log event needed -- but the catch should be documented as handling a specific, named race condition. If we want observability into session contention rates, a debug-level log could be useful, but Coralogix severity 3 (info) would create noise since this is expected under load.

**Recommendation:** Leave this catch silent but add a code comment naming the specific error condition. This satisfies the "handles a specific, named error type" requirement from the engineering philosophy.

---

#### B7. `capture.js:464` -- `frame()` throws for detached frames

**Current behavior:** `catch (err) { /* frame() throws for detached frames */ }` -- already named and handled.

**Status:** Already compliant with "fail loudly" -- handles a specific, named error type (detached frame lifecycle). No change needed.

---

#### B8. `capture.js:563` -- Partial capture deadline catch

**Current behavior:** `catch { throw new Error('Deadline exceeded...'); }` -- re-throws a categorized error.

**Status:** Already compliant -- converts arbitrary errors into a specific, named error. No change needed.

---

#### B9. `capture.js:660` -- `context.close().then(() => browser.close())` catch in finally

**Current behavior:** `.catch(() => {})` on cleanup in a `finally` block. The cleanup races against a 3s timeout.

**Proposed log event:**
- **Event name:** `capture.cleanup_fail`
- **Severity:** 4 (warn) -- cleanup failure means potential session/resource leaks
- **Subsystem:** `capture`
- **Structured fields:**
  ```json
  {
    "event": "capture.cleanup_fail",
    "errorName": "<err.name>",
    "errorMessage": "<err.message, truncated to 256 chars>"
  }
  ```
- **Problem:** This is in a `finally` block inside `defaultRenderer`, which does not have access to `env`, `captureId`, or `tenantId`. These are only available in `performCapture`. The cleanup `.catch()` cannot call `log()` without `env`.
- **Recommendation:** Use `console.warn('wrl:capture.cleanup_fail', err?.message)` here. This is the right tradeoff -- restructuring to pass `env` into `defaultRenderer` would violate the injection pattern (renderer is an injectable parameter for testing). `console.warn` gives visibility in Workers logs without architectural changes.

---

#### B10. `cdxj.js:75` -- `toSurt()` URL parse catch

**Current behavior:** `catch { return url; }` -- returns URL as-is when SURT conversion fails.

**Proposed change:** This is a pure function called during WACZ assembly. It does not have access to `env` or `log()`. The URL that fails parsing has already passed validation (it came from our own capture), so this should never happen in practice.

**Recommendation:** Use `console.warn` for unexpected-but-harmless:
```javascript
} catch (err) {
  console.warn('wrl:cdxj.surt_parse_fail', url?.slice(0, 100));
  return url;
}
```

No structured Coralogix event -- this is deep in WACZ assembly and the error is non-fatal (the CDXJ index will use the raw URL, which is still valid).

---

#### B11. `index.js:187` -- `createCapture` KV write catch

**Current behavior:** `catch { return problemResponse(500, 'Could not create capture record'); }` -- returns 500 but does not log.

**Proposed log event:**
- **Event name:** `capture.kv_create_fail`
- **Severity:** 5 (error) -- this is a hard failure visible to the caller
- **Subsystem:** `capture`
- **Structured fields:**
  ```json
  {
    "event": "capture.kv_create_fail",
    "captureId": "<captureId>",
    "tenantId": "<tenantId>",
    "cip": "<cip>",
    "errorName": "<err.name>",
    "errorMessage": "<err.message, truncated to 256 chars>"
  }
  ```
- **Note:** The catch needs the error variable added (`catch (err)`). The `env`, `captureId`, `tenantId`, and `cip` variables are all in scope at this point in `handleCreateCapture`. Use `ctx.waitUntil(log(...) ?? Promise.resolve())` matching the pattern used elsewhere in `index.js`.

---

#### B12. `kv.js:81` -- `createCapture` index write catch
#### B13. `kv.js:121` -- `completeCapture` index re-write catch
#### B14. `kv.js:155` -- `failCapture` index re-write catch

**Current behavior:** All three use `console.warn` with an unstructured message. These are non-fatal (secondary index failure; primary record still exists).

**Proposed change:** These functions do not have access to `env` (they receive only `kv`). Adding `env` would change the function signature and all callers.

**Recommendation:** Keep `console.warn` but improve the message format for grep-ability:
```javascript
console.warn('wrl:kv.index_write_fail', { fn: 'createCapture', captureId, error: err?.message });
```

The structured prefix `wrl:` makes these filterable in Workers logs. No Coralogix event -- the cost of passing `env` through to KV functions outweighs the benefit for non-fatal index operations.

**Alternative considered and rejected:** Passing `env` to every KV function. This would change 6+ function signatures and every call site, for a non-fatal secondary index write. Not worth the churn.

---

### Category C: Intentionally Silent (No Changes Needed)

These catch blocks should remain as-is. Each is either (a) handling a specific named error type, (b) running in browser-context code where structured logging is impossible, or (c) is in vendored third-party code.

| File | Line | Rationale |
|------|------|-----------|
| `consent.js:103` | `frame.evaluate(initResp).catch(() => {})` | Cross-origin/detached frames may reject evaluate. This is expected browser behavior, not an application error. Logging would produce noise proportional to iframe count. |
| `consent.js:135` | `catch { return Promise.resolve(null); }` | Eval of autoconsent rule inside browser page context. Target page JS interference is expected. |
| `consent.js:143` | `.catch(() => {})` on evalResp frame.evaluate | Same as 103 -- cross-origin frame rejection. |
| `consent.js:144` | `.catch(() => {})` on outer eval chain | Same -- detached frame during eval pipeline. |
| `consent.js:167` | `frame.evaluate(inject).catch(() => {})` | Comment explicitly states: "Cross-origin or detached frames may reject evaluate -- non-fatal". Named error type. |
| `consent.js:224` | `catch(e) {}` in polling wrappedScript eval | Runs INSIDE the target page's browser context (injected JS). No access to Workers runtime or `log()`. |
| `consent.js:242` | `frame.evaluate(wrappedScript).catch(() => {})` | Same as 167 -- cross-origin/detached frame injection. |
| `consent.js:260` | `.catch(() => null)` on polling frame.evaluate | Detached frame polling. Returns null = "no result from this frame". |
| `consent.js:272` | `.catch(() => null)` on CMP detection polling | Same -- detached frame returns "no CMP detected". |
| `capture.js:509` | `.catch(() => 'unknown')` on readyState evaluate | Page may be crashed/unresponsive. Returns 'unknown' which is handled by the subsequent conditional. Named degradation. |
| `url-validation.js:135` | `new URL()` parse catch | Returns null -- "not an IPv4 address". Pure validation logic. |
| `url-validation.js:220` | `parseIPv6ToBigInt` catch | Returns null -- "not valid IPv6". Pure validation logic. |
| `url-validation.js:333` | `new URL(rawUrl)` parse catch | Returns `problemResponse(400)`. Handles specific error type (malformed URL). |
| `url-validation.js:390-391` | DNS resolve `.catch()` | Captures error for subsequent logic (`v4error`/`v6error`). Already handled. |
| `verify.js:63` | `unzipSync` catch | Returns verification failure with detail. Handles specific type (malformed ZIP). |
| `verify.js:104` | JSON.parse catch | Returns verification failure with detail. Handles specific type (malformed JSON). |
| `verify.js:209` | `verifyTimestamp` catch | Returns verification failure with detail. Handles specific type (timestamp DER error). |
| `kv.js:198` | Cursor decode catch | Returns `{ error: 'invalid_cursor' }`. Handles specific type (malformed cursor). |
| `rfc3161.js:247` | `verifyTimestamp` catch | Returns `{ valid: false, reason: err.message }`. Handles specific type (DER parse error). |
| `verify-page.js:310` | `safeUrl` catch | Client-side JS. No server-side logging available. |
| `verify-page.js:321` | `fmtDate` catch | Client-side JS. Falls back to raw ISO string. |
| `verify-page.js:670` | Retrieval fetch `.catch()` | Client-side JS. Returns null on network error. |
| `verify-page.js:679` | Overall fetch chain `.catch()` | Client-side JS. Shows error state in UI. |
| `vendor/*` | All catch blocks | Third-party vendored code. Do not modify. |

---

## The `log.js` Meta-Logging Question

### The Problem

`log.js` contains two silent error-handling paths:
1. `.catch(() => {})` on the `fetch()` Promise (line 39)
2. `catch { return; }` wrapping the entire function body (line 40)

`log()` cannot use itself to report failures -- that's infinite recursion. The question is: what's the right fallback?

### Analysis: `console.error` as Fallback

**How `console` works in Cloudflare Workers:**
- `console.log/warn/error` output goes to the Workers runtime log stream
- Accessible via `wrangler tail` during development
- Accessible via Cloudflare dashboard "Logs" tab
- NOT sent to Coralogix (that's what `log.js` does)
- In production Workers, console output is ephemeral -- it's only visible if someone is actively tailing or if Workers Logpush is configured

**Tradeoffs of adding `console.error`:**

| For | Against |
|-----|---------|
| Visible in `wrangler tail` during debugging | Production Workers: console output is ephemeral unless Logpush is configured |
| Zero risk of infinite recursion | If Coralogix is fully down, `console.error` fires on every log call -- potentially hundreds per request |
| Distinguishes "log delivery failed" from "everything is fine" | Adds noise to Workers logs that are otherwise clean |
| Cheap -- no network call, no serialization beyond the message | Cannot be queried, aggregated, or alerted on (unlike Coralogix) |
| Standard practice -- every logging library needs a fallback | |

**Risk assessment -- noise in production:**

The noise risk is real but bounded. A Coralogix outage would cause `console.error` to fire for every `log()` call. A typical capture request makes 3-5 `log()` calls. At 10 captures/minute (current scale), that's 30-50 console errors per minute. This is manageable. At 1000 captures/minute, it would be 3000-5000 console errors per minute -- still manageable for console output, which is not stored unless Logpush is active.

**The deeper concern:** Without any fallback, a Coralogix outage is completely invisible. You discover it only when you try to query logs and find a gap. With `console.error`, at least `wrangler tail` shows the problem immediately.

### Recommendation

**Use `console.error` for both catch paths, with a structured prefix for filterability.**

```javascript
export function log(env, severity, subsystem, data) {
  if (!env.CORALOGIX_ENDPOINT || !env.CORALOGIX_SEND_KEY) return;
  try {
    return fetch(env.CORALOGIX_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.CORALOGIX_SEND_KEY}`,
      },
      body: JSON.stringify([{
        applicationName: env.APPLICATION_NAME || 'wrl',
        subsystemName: subsystem,
        severity,
        timestamp: Date.now(),
        text: JSON.stringify(data),
      }]),
    }).catch((err) => {
      console.error('wrl:log_delivery_fail', {
        event: data?.event,
        errorName: err?.name,
        errorMessage: String(err?.message ?? '').slice(0, 128),
      });
    });
  } catch (err) {
    console.error('wrl:log_serialization_fail', {
      event: data?.event,
      errorName: err?.name,
      errorMessage: String(err?.message ?? '').slice(0, 128),
    });
    return;
  }
}
```

Key design decisions:
- **`console.error` not `console.warn`**: This is a failure in the observability pipeline itself. If your logging is broken, that's an error, not a warning.
- **Structured prefix `wrl:`**: Makes it greppable in Workers logs. The `wrl:` prefix distinguishes WRL log delivery failures from other console output.
- **Include `data?.event`**: So you can see WHICH log event failed to deliver (was it `capture.fail`? `security.auth_fail`?). Critical for debugging gaps.
- **Separate error names**: `log_delivery_fail` (network/HTTP failure) vs `log_serialization_fail` (JSON.stringify or other sync error). Different root causes need different responses.
- **Truncate to 128 chars** (shorter than the 256 used elsewhere): Console output is ephemeral and not queried -- keep it compact.

### What NOT to do

- **Do NOT add retry logic**: `log()` is fire-and-forget by design. Adding retries changes the contract and could delay capture processing.
- **Do NOT queue failed logs for later delivery**: Adds complexity and state management for a fire-and-forget function.
- **Do NOT add a circuit breaker**: At WRL's scale, the overhead of `console.error` per failed log is negligible. A circuit breaker adds complexity for a problem that doesn't need it.

---

## Additional Finding: `list.error` Severity

`index.js:263` logs `list.error` at severity **3 (info)**, but this is a 500 Internal Server Error response to the client. This should be severity **5 (error)**:

```javascript
// Current:
ctx.waitUntil(log(env, 3, 'list', { event: 'list.error', ... }));

// Should be:
ctx.waitUntil(log(env, 5, 'list', { event: 'list.error', ... }));
```

Additionally, the severity 6 used for `list.success` (line 292) is outside the documented Coralogix range (1-5). This appears to be using Coralogix severity 6 = "verbose/debug". It works but should be documented in a comment or changed to 3 (info) for consistency with `capture.start`.

---

## Summary: Changes Required

| Priority | File | Change | Log Event | Severity |
|----------|------|--------|-----------|----------|
| HIGH | `log.js` | Replace both silent catches with `console.error` | `wrl:log_delivery_fail` / `wrl:log_serialization_fail` | console.error |
| HIGH | `signing.js` | Add structured log + keep console.warn | `signing.key_import_fail` | 5 (error) |
| HIGH | `index.js:187` | Add structured log to KV create catch | `capture.kv_create_fail` | 5 (error) |
| HIGH | `index.js:263` | Fix severity from 3 to 5 | `list.error` (existing) | 5 (error) |
| MED | `ip-hash.js` | Add structured log to crypto catch | `security.cip_hash_fail` | 4 (warn) |
| MED | `consent.js:71` | Add `_error` to returned object | (uses existing `capture.consent_error`) | 4 (warn) |
| MED | `capture.js:660` | Replace `.catch(() => {})` with `console.warn` | `wrl:capture.cleanup_fail` | console.warn |
| LOW | `cdxj.js:75` | Add `console.warn` | `wrl:cdxj.surt_parse_fail` | console.warn |
| LOW | `kv.js:81,121,155` | Improve `console.warn` message format | `wrl:kv.index_write_fail` | console.warn |
| LOW | `capture.js:335` | Add comment naming the race condition | (documentation only) | N/A |

---

## Recommendations

### 1. Establish a `console.error`/`console.warn` convention for "cannot reach Coralogix" scenarios

Not every catch block can call `log()` -- some lack `env`, some would cause recursion. For these, use a consistent prefix pattern:

```
console.error('wrl:<module>.<event>', { key: value })
console.warn('wrl:<module>.<event>', { key: value })
```

The `wrl:` prefix makes these filterable if Workers Logpush is ever configured.

### 2. Consider Workers Logpush for console output persistence

If `console.error` is going to be the fallback for log delivery failures, Workers Logpush to an R2 bucket or S3 would make these persistent and queryable. This is a future infrastructure task (iac-minion scope), not needed for this PR.

### 3. `signing.key_import_fail` should trigger a distinct API response

When `getSigningKeys()` returns `null` due to a malformed key (vs. absent key), downstream code treats it identically to "signing not configured." The new log event helps operators distinguish these cases in logs. For a future improvement, consider having `getSigningKeys()` return a discriminated result (`{ reason: 'not_configured' }` vs `{ reason: 'import_failed' }`) so API responses can distinguish "service unavailable" from "misconfigured." This is out of scope for #70 but worth a backlog item.

---

## Proposed Tasks

1. **log.js: Replace silent catches with `console.error`** -- Smallest change with highest leverage. Makes log delivery failures visible.

2. **signing.js: Add structured log to key import failure** -- Add `catch (err)` binding, call `log(env, 5, 'signing', ...)`, retain `console.warn`.

3. **index.js: Add log to KV create catch + fix list.error severity** -- Two small changes in the same file.

4. **ip-hash.js: Add structured log to crypto failure** -- Add `catch (err)` binding, call `log(env, 4, 'security', ...)`.

5. **consent.js: Add `_error` to top-level catch return** -- Include error details so upstream `capture.consent_error` fires.

6. **capture.js: Replace cleanup `.catch(() => {})` with `console.warn`** -- Non-blocking, uses console since `env` is not available.

7. **cdxj.js, kv.js, capture.js:335: Minor improvements** -- console.warn formatting, documentation comments.

---

## Risks and Concerns

### Risk 1: `console.error` noise during Coralogix outage
**Likelihood:** Low (Coralogix has strong uptime).
**Impact:** Moderate (hundreds of console errors per minute, but ephemeral).
**Mitigation:** The `wrl:` prefix makes filtering trivial. Console output is cheap. The alternative (silent swallowing) is worse.

### Risk 2: Signing key log event leaks key material
**Concern:** The error message from `crypto.subtle.importKey` might include key bytes.
**Mitigation:** The proposed event logs `err.name` and `err.message` (truncated). WebCrypto error messages are generic ("The imported key data is incorrect" style), never include the key material itself. Still, truncate to 256 chars as defense-in-depth.

### Risk 3: Breaking the `log()` contract
**Concern:** Adding `console.error` to `log()` changes its behavior for callers that expect pure fire-and-forget silence.
**Mitigation:** The function signature and return type are unchanged. The `console.error` is a side effect visible only in Workers console, not in application logic. No caller depends on `log()` being perfectly silent on failure.

### Risk 4: `ip-hash.js` change could affect request latency
**Concern:** Adding a `log()` call in the catch path of `computeCip` adds a network call (to Coralogix) in the request handler hot path.
**Mitigation:** The `log()` call returns a Promise that goes to `ctx.waitUntil()` (or is fire-and-forget). It does not block the response. However, since `computeCip` is called synchronously before the response, the `log()` call should use the same `ctx.waitUntil` pattern. The caller in `index.js` would need to handle this. Alternative: use `console.warn` instead of `log()` in `ip-hash.js` to avoid any latency concern. I recommend `console.warn` for this module given it's called on every request.

**Revised recommendation for ip-hash.js:** Use `console.warn('wrl:security.cip_hash_fail', ...)` instead of `log()`. This avoids latency concerns and the need to pass `ctx` into the hashing function.

---

## Additional Agents Needed

- **None for this task.** All changes are within the observability domain -- adding log events to existing catch blocks. The debugger-minion's code audit will identify the same catch blocks from a different angle (which to convert vs. which to leave). The test-minion should verify that new log events are emitted correctly in test scenarios.
