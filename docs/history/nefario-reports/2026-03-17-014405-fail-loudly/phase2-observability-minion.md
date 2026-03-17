# Observability Contribution: Catch Block Logging Patterns
## Phase: fail-loudly

---

## Summary

After reading all twelve source files in full, this contribution classifies every
catch block by its operational meaning and specifies the exact logging treatment
each should receive.

The core distinction this codebase needs is between three states:

- **Error swallowed** (`catch {}` with nothing): the system degraded and no
  operator will ever know. This is what the task eliminates.
- **Error handled with fallback** (`catch (err) { ... specific handling ... }`):
  the system degraded intentionally, with a clear named reason. No Coralogix
  entry required IF the fallback outcome is already observable through the normal
  happy-path log.
- **Error logged and degraded** (`catch (err) { log(...); return fallback }`):
  the system degraded with a Coralogix entry that operators can query. The
  distinction between "service unavailable" and "misconfigured" must be visible
  in the event name or a `reason` field.

The project CLAUDE.md states the rule explicitly: use distinct status values so
operators can tell the difference. A metric spike in `capture.wacz_fail` vs
`capture.key_archive_fail` gives completely different operational responses.

---

## Classification Framework

### Category A: Pure data conversion fallback — no log needed

These catch blocks operate on attacker-controlled or untrusted third-party data
(URLs from WARC records, JSON from ZIP archives). They fire per-record during
batch operations. The caller already has visibility into whether the conversion
succeeded (it uses the fallback value). Logging here would create unbounded
high-cardinality noise — potentially hundreds of log entries per capture for
malformed pages — with no actionable signal.

**Rule**: Name the error type in the catch clause for documentation clarity. No
log call. The catch must have a comment explaining what degrades and why it is
safe to swallow.

### Category B: Internal race condition / lifecycle transition — no log needed

These are expected concurrency artifacts in the browser session pool (catching
races between `sessions()` list and `connect()`) and in Playwright's lifecycle
events (detached frames, cross-origin evaluate). They are not errors; they are
protocol.

**Rule**: Empty catch or `.catch(() => {})` is acceptable ONLY with a comment
that names the specific race condition and explains why falling through is
correct. The comment is the documentation that "this is intentional."

### Category C: Infrastructure boundary, non-fatal degradation — warn-level log

These catch blocks guard KV secondary index writes, WACZ bundling, and key
archival. The primary operation succeeds (the capture completes); a secondary
operation fails. The operator needs to know, but it is not an incident.

**Rule**: `log(env, 4, subsystem, { event: '...', captureId, tenantId, ... })`
at warn (severity 4). The event name must be distinct enough to distinguish
"it failed" from "it was skipped." Do NOT include the raw error message in the
log (INVARIANT in log.js: no attacker-controlled input); use `errorClass` for
the constructor name which is a static string.

### Category D: Infrastructure boundary, fatal path — error-level log

These catch blocks guard operations where failure means the capture cannot
proceed or the HTTP response must be 500/503. The operator needs to respond.

**Rule**: `log(env, 5, subsystem, { event: '...', ... })` at error (severity 5).
Include `errorClass: err.constructor.name` (static, not user-controlled). Do NOT
include `err.message` unless the source is framework-controlled and cannot echo
user input.

### Category E: Configuration errors — warn-level log

These catch blocks fire when an env binding is misconfigured or a key fails
validation. They fire at startup or on first use. The operator may not notice
that a feature is silently disabled.

**Rule**: `log(env, 4, subsystem, { event: '...', reason: 'specific_static_reason' })`
at warn. Use a `reason` field with a static string that names the specific
misconfiguration (not the raw error). This is what CLAUDE.md means by
distinguishing "service unavailable" from "misconfigured."

### Category F: Self-referential failure (log.js itself) — console.warn only

The logging subsystem cannot log its own failures to itself. The outer try/catch
in log.js that catches `JSON.stringify` failures, and the `.catch(() => {})` on
the fetch, are both correct as-is. Any change here would be circular.

**Rule**: No change. The existing pattern (outer `try { return fetch(...).catch(() => {}) } catch { return; }`)
is the correct terminal handler. Document this explicitly with a comment.

---

## Per-Catch-Block Recommendations

### 1. cdxj.js:75 — URL parsing failure in `toSurt()`

**Category**: A (pure data conversion fallback)

**Current code**:
```js
} catch {
  // Fallback: return URL as-is if parsing fails
  return url;
}
```

**Assessment**: This is correct behavior. `toSurt()` is called once per WARC
record during CDXJ index building. Invalid URLs in WARC records are expected
(e.g. `urn:` variants, malformed URLs captured from the wild). The caller
receives the raw URL, which is a valid degradation — the CDXJ index entry is
still valid, just unsorted. No Coralogix entry.

**Recommendation**: No logging change required. The existing comment is adequate.
Add the error type name to the catch parameter for explicit documentation:

```js
} catch (_urlParseError) {
  // URL is not parseable by the WHATWG URL API; return as-is.
  // This is expected for urn: URIs and malformed URLs captured from the wild.
  return url;
}
```

No log call. This fires per-record and is not actionable.

---

### 2. index.js:162 — JSON parse failure, returns 400

**Category**: A (input validation at user boundary)

**Current code**:
```js
try {
  body = await request.json();
} catch {
  return problemResponse(400, 'Request body must be valid JSON');
}
```

**Assessment**: The 400 response IS the signal. The client sent invalid JSON;
they get a 400. No Coralogix entry is needed here — this is not an infrastructure
event, it is a client error. Logging every malformed request would be low-value
noise and a potential DoS vector (attacker floods with bad JSON, spams logs).

**Recommendation**: Name the error parameter for documentation. No log call.

```js
} catch (_jsonParseError) {
  return problemResponse(400, 'Request body must be valid JSON');
}
```

---

### 3. index.js:187 — KV createCapture failure, returns 500

**Category**: D (infrastructure boundary, fatal)

**Current code**:
```js
try {
  await createCapture(env.KV, captureId, result.url, result.ip, tenantId);
} catch {
  return problemResponse(500, 'Could not create capture record');
}
```

**Assessment**: This is a silent infrastructure failure. If KV is degraded,
every capture silently returns 500 and no operator is alerted. This must log.

**Recommendation**: Add error-level log before returning 500.

```js
} catch (err) {
  ctx.waitUntil(log(env, 5, 'capture', {
    event: 'capture.kv_create_fail',
    tenantId,
    cip,
    errorClass: err?.constructor?.name ?? 'Unknown',
  }) ?? Promise.resolve());
  return problemResponse(500, 'Could not create capture record');
}
```

Severity: 5 (error). Event name `capture.kv_create_fail` is distinct from
`capture.kv_fail` (the catch-all in performCapture) so operators can correlate:
a spike in `capture.kv_create_fail` means the KV binding is unhealthy before
captures even start.

---

### 4. capture.js:335 — Browser session connect race, falls through to acquire

**Category**: B (expected race condition)

**Current code**:
```js
try {
  return await connect(browserBinding, pick.sessionId);
} catch {
  // Another worker claimed the session between list and connect -- fall through
}
```

**Assessment**: This is a TOCTOU race between `sessions()` and `connect()`. It
is expected under load and falling through to `acquire()` is the correct
response. No Coralogix entry.

**Recommendation**: Name the catch parameter; the existing comment is the
correct documentation.

```js
} catch (_sessionClaimRace) {
  // TOCTOU: another worker claimed this session between sessions() and connect().
  // Fall through to acquire() which will either get a new session or fail fast.
}
```

No log call. This is protocol, not an error.

---

### 5. capture.js:563 — Partial capture deadline, rethrows

**Category**: B (rethrow, no swallowing)

**Current code**:
```js
} catch {
  throw new Error('Deadline exceeded before partial capture could complete');
}
```

**Assessment**: This catch block already preserves the error signal by
rethrowing. It is not a silent catch — it converts a variety of possible errors
(screenshot timeout, content extraction timeout) into a single named error that
the outer catch-all in `performCapture` will log at error level.

**Recommendation**: Name the catch parameter to document what is being caught.

```js
} catch (_partialCaptureError) {
  // Any failure during partial capture (screenshot, content extraction) is
  // collapsed into a deadline error for the outer catch-all to log and handle.
  throw new Error('Deadline exceeded before partial capture could complete');
}
```

No additional log call here — the outer catch-all at capture.js:256-264 already
logs `capture.fail` with `errorClass` and `errorMessage` at severity 5.

---

### 6. capture.js:660 — Cleanup `.catch(() => {})` in finally block

**Category**: B (cleanup race, terminal handler)

**Current code**:
```js
await Promise.race([
  context.close().then(() => browser.close()),
  new Promise((r) => setTimeout(r, 3000)),
]).catch(() => {});
```

**Assessment**: This is the terminal cleanup handler. If `context.close()` or
`browser.close()` throws, there is nothing meaningful to do — the capture result
is already determined at this point. Logging here would require `env` to be
threaded into the `finally` block, and any log would post-date the capture
completion log. The 3-second race is already observable as a duration anomaly
in the `capture.success` or `capture.fail` log entries.

**Recommendation**: Add a comment documenting why this is silent.

```js
.catch(() => {
  // Intentionally silent: cleanup failures do not affect the capture result.
  // Browser session death here is already captured by the 3s race timeout,
  // which is visible as a duration anomaly in capture.success/capture.fail logs.
});
```

No log call. Logging cleanup failures would require `env` in a finally block
and produce spurious entries after the capture outcome is already recorded.

---

### 7. consent.js:71 — Top-level consent failure, returns failed status

**Category**: B (but needs improvement)

**Current code**:
```js
try {
  if (typeof page.exposeBinding === 'function') {
    return await _dismissWithBinding(page, start);
  } else {
    return await _dismissWithPolling(page, start);
  }
} catch {
  return { status: 'failed', cmp: null, durationMs: Date.now() - start };
}
```

**Assessment**: This catch guards against errors in the autoconsent dispatch
itself. The caller in capture.js (line 593-615) already handles the return value
and additionally checks for browser death errors (re-throwing those). Consent
failures are already logged by capture.js at severity 4 via `capture.consent_error`
when `consent._error` is set.

The problem is that THIS catch block creates a `{ status: 'failed' }` result with
NO `_error` field set, so the `consent._error` check in capture.js at line 247
will not fire. The error is lost.

**Recommendation**: Preserve the error object on the result so the caller can log it.

```js
} catch (err) {
  return {
    status: 'failed',
    cmp: null,
    durationMs: Date.now() - start,
    _error: { name: err?.constructor?.name ?? 'Unknown', message: String(err?.message ?? '').slice(0, 256) },
  };
}
```

This surfaces the error to the existing `consent._error` logging path in
capture.js without adding a new log call here (consent.js has no `env` binding
and cannot call `log()` directly). The error becomes observable via
`capture.consent_error` at severity 4.

---

### 8. consent.js:103, 143, 144, 167 — Cross-origin frame evaluate failures

**Category**: B (expected browser frame lifecycle)

**Current patterns**:
```js
frame.evaluate(inject, [autoconsentScript]).catch(() => {});    // line 167 (_binding path)
frame.evaluate(wrappedScript).catch(() => {});                   // line 243 (_polling path)
frame.evaluate((c) => { ... }).then(...).catch(() => {});        // line 144
frame.evaluate(({ id, res }) => { ... }).catch(() => {});        // line 143
```

**Assessment**: Cross-origin frames routinely reject `evaluate()` with security
errors. Detached frames (navigated away, garbage collected) reject with lifecycle
errors. These fire potentially dozens of times per consent attempt — Sourcepoint
and OneTrust CMPs regularly create 5-15 child frames. Logging these would
produce 50-150 log entries per capture for common news and e-commerce sites.
The consent outcome (dismissed/none/timeout/failed) already captures whether
these failures mattered.

**Recommendation**: Add comments where they are missing; the `.catch(() => {})`
pattern is correct here. The comment must name the specific reason.

```js
// Cross-origin and detached frames reject evaluate() -- expected, non-fatal.
frame.evaluate(inject, [autoconsentScript]).catch(() => {});
```

```js
// Eval response routing may fail if the frame navigated away -- non-fatal.
frame.evaluate(({ id, res }) => { ... }, { id: msg.id, res: result })
  .catch(() => {});
```

No log calls. The comment is the contract.

---

### 9. signing.js:83 — Key validation failure, console.warn + returns null

**Category**: E (configuration error, needs Coralogix visibility)

**Current code**:
```js
} catch {
  console.warn('Signing key validation failed');
  return null;
}
```

**Assessment**: `console.warn` is not visible in Coralogix. If `SIGNING_KEY` is
set but invalid (wrong format, wrong length, wrong algorithm), this silently
disables WACZ signing for all captures. Callers interpret `null` as "signing not
configured" — they cannot distinguish "no key set" from "key set but broken."
This is exactly the "service unavailable vs misconfigured" distinction CLAUDE.md
requires.

**Recommendation**: This function has no `env` parameter, which is a blocker.
Two options:

Option A (preferred — minimal change): Add `env` as an optional parameter to
`getSigningKeys()` and log when it is available.

```js
export async function getSigningKeys(env) {
  // ... existing null guard ...
  try {
    // ... existing key import logic ...
  } catch (err) {
    log(env, 4, 'security', {
      event: 'security.signing_key_invalid',
      reason: 'key_import_failed',
      errorClass: err?.constructor?.name ?? 'Unknown',
    });
    console.warn('Signing key validation failed');
    return null;
  }
}
```

`env` is already passed to `getSigningKeys` from every call site
(index.js:465, index.js:546). The log call is fire-and-forget (the returned
promise is not awaited since this function is not in a `ctx.waitUntil()` context).

Severity: 4 (warn). The `reason: 'key_import_failed'` field distinguishes
"SIGNING_KEY env var absent" (returns null before the try block, no log) from
"SIGNING_KEY present but invalid" (logs and returns null). Operators can now
alert on `security.signing_key_invalid` to detect misconfigured deployments.

---

### 10. verify.js:63, 104, 209 — Structured failure returns

**Category**: A (pure verification logic, returns structured result)

**Current patterns**:

verify.js:63 (ZIP parse failure):
```js
} catch {
  return { verified: false, checks: [...] };
}
```

verify.js:104 (JSON parse failure):
```js
} catch {
  return { verified: false, checks: [...] };
}
```

verify.js:209 (timestamp verify failure):
```js
} catch {
  checks.push({ name: 'timestamp', status: 'fail', detail: 'Independent timestamp verification failed' });
}
```

**Assessment**: `verifyWacz()` is a pure function. It takes bytes, returns a
structured result. It has no `env` parameter and no access to Coralogix.
Verification failures are not infrastructure events — they are expected for
tampered or malformed WACZs. The caller in index.js (handleVerifyCapture) returns
the full checks array in the HTTP response, so the failure IS observable to the
client and to anyone querying the API.

The timestamp case (verify.js:209) is particularly important: it catches errors
from `verifyTimestamp()` (rfc3161 ASN.1 parsing) which could throw on malformed
DER. The catch converts that to `status: 'fail'` which is the correct structured
response.

**Recommendation**: Name the catch parameters. No log calls. The structured
return is the observability mechanism.

```js
// verify.js:63
} catch (_zipParseError) {
  return { verified: false, checks: [...] };
}

// verify.js:104
} catch (_jsonParseError) {
  return { verified: false, checks: [...] };
}

// verify.js:209
} catch (_timestampVerifyError) {
  // rfc3161 ASN.1 parsing threw -- treat as failed timestamp check.
  checks.push({ name: 'timestamp', status: 'fail', detail: 'Independent timestamp verification failed' });
}
```

---

### 11. log.js:39, 40 — Logging itself failing

**Category**: F (self-referential, terminal handler)

**Current code**:
```js
return fetch(env.CORALOGIX_ENDPOINT, { ... })
  .catch(() => {});    // line 39: network/HTTP failure
// ...
} catch { return; }    // line 40: JSON.stringify or header construction failure
```

**Assessment**: These two catches are correct and must not change. The inner
`.catch(() => {})` handles network errors from the Coralogix fetch. The outer
`try/catch` handles synchronous errors in `JSON.stringify` or header construction.
Both are terminal handlers — there is nowhere to send the error and no recovery
action possible.

**Recommendation**: Add comments to document the intent explicitly.

```js
    }).catch(() => {
      // Intentionally silent: Coralogix network failures must not affect
      // the Worker response. This is a fire-and-forget log path.
    });
  } catch {
    // Intentionally silent: if JSON.stringify or header construction throws,
    // logging is unavailable for this call. No recovery is possible.
    return;
  }
```

---

### 12. kv.js:198 — Cursor decode failure, returns error object

**Category**: A (user input validation, structured error return)

**Current code**:
```js
} catch {
  return { error: 'invalid_cursor' };
}
```

**Assessment**: This is a user-supplied cursor that failed base64/JSON decoding.
The caller in index.js returns a 400. This is input validation, not an
infrastructure event. No Coralogix entry needed.

**Recommendation**: Name the catch parameter.

```js
} catch (_cursorDecodeError) {
  return { error: 'invalid_cursor' };
}
```

---

### 13. kv.js:81 — createCapture secondary index write failure

**Category**: C (non-fatal infrastructure degradation — currently `console.warn`)

**Current code**:
```js
} catch (err) {
  console.warn('createCapture: index write failed (non-fatal)', err?.message);
}
```

**Assessment**: `console.warn` is not visible in Coralogix. If the tenant index
write silently fails, `listCaptures` will return incomplete results for that
tenant. This is not immediately visible from the API response (the capture itself
succeeds). An operator debugging "why are my captures missing from list?" will
find no trace in Coralogix.

**Recommendation**: Add warn-level Coralogix log. The function signature already
has `kv` but not `env`. This is the same structural problem as signing.js.

Option A: Pass `env` through from `createCapture`'s call site in index.js.
The call site already has `env`.

However, `kv.js` is positioned as a pure KV access layer. Threading `env` in
would couple it to the logging infrastructure. The cleaner approach:

Option B (preferred): Rethrow from `createCapture` and let the caller log.

The secondary index write failure in `createCapture` is already non-fatal by
design (comment says so). But the caller at index.js:185-189 wraps the entire
`createCapture` call in a catch that returns 500. If the primary record write
succeeds but the secondary index write fails and rethrows, the caller would
incorrectly return 500.

Option C (cleanest): Keep the catch in kv.js but log at the call site by
surfacing it as a warning return value.

Actually, examining the code more carefully: the primary write at kv.js:70 is
OUTSIDE the try block; the secondary index write at kv.js:76-83 is inside a
separate try. So `createCapture` can throw from the primary write (KV unhealthy)
but will never throw from the secondary index write (caught internally).

The console.warn is the right place for the signal. The fix is simple: also log
to Coralogix by accepting `env` as an optional parameter.

For consistency with the project's pattern, the recommendation is:

- For kv.js:81 (`createCapture` secondary index fail): replace `console.warn`
  with `log(env, 4, 'kv', { event: 'kv.index_write_fail', operation: 'createCapture', errorClass: err?.constructor?.name })` when env is available, falling back to `console.warn` when not (tests, local dev).
- Same pattern for kv.js:121 (`completeCapture` index re-write) and kv.js:153 (`failCapture` index re-write).

This requires adding `env` as a parameter to `createCapture`, `completeCapture`,
and `failCapture`. All three are called from capture.js and index.js where `env`
is available.

---

## Severity Level Summary

| Severity | Coralogix value | When to use |
|----------|----------------|-------------|
| info     | 3              | Normal degradation with known cause (header_fail, key_archive_fail already exists) |
| warn     | 4              | Non-fatal infrastructure failure; capture completes but a secondary operation did not (index write, WACZ fail, consent error, key invalid) |
| error    | 5              | Fatal path: KV create failed, capture failed, security event |

---

## Distinguishing "error swallowed" from "error handled with fallback" in Coralogix

Use event name conventions consistently:

- `*.fail` — a primary operation failed fatally (e.g. `capture.fail`, `capture.kv_create_fail`)
- `*._fail` — a secondary operation failed non-fatally and the primary path continued (e.g. `capture.wacz_fail`, `capture.key_archive_fail`, `capture.header_fail`, `kv.index_write_fail`)
- `*.invalid` — a configuration item is present but invalid (e.g. `security.signing_key_invalid`)

The `_error` suffix is reserved for the `_error` sub-field on consent results
(already established in the codebase) which surfaces through the `capture.consent_error`
event. Do not use `_error` as an event name suffix to avoid confusion.

Query in Coralogix to detect all non-fatal degradations in one search:
```
subsystem:capture event:capture.*_fail
```

Query to detect configuration problems:
```
subsystem:security event:*.invalid
```

Query to confirm clean captures (no degradation):
```
subsystem:capture event:capture.success waczStatus:ok
```

---

## What NOT to log (and why)

These catch blocks should remain silent or comment-only:

1. **cdxj.js:75** — per-record URL conversion, fires in batch, no signal
2. **index.js:162** — user input error, 400 is the signal
3. **capture.js:335** — TOCTOU race, expected concurrency protocol
4. **capture.js:563** — rethrows, outer catch-all logs it
5. **capture.js:660** — cleanup terminal handler, no env access, no recovery
6. **consent.js:103,143,144,167** — per-frame browser operations, fires 5-50x per capture
7. **verify.js:63,104,209** — pure function, structured return is the signal
8. **kv.js:198** — user input validation, 400 is the signal
9. **log.js:39,40** — logging cannot log itself

Logging all of these would produce high-cardinality noise that degrades Coralogix
query performance and trains operators to ignore log volume. The value of
`capture.consent_error` being a warn-level event is precisely that it does NOT
fire on every cross-origin frame evaluate failure — it fires once per capture
where something materially went wrong with consent dismissal.
