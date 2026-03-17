## Domain Plan Contribution: debugger-minion

### Complete Catch Block Audit

I audited every `catch` block and `.catch()` call in `src/` (excluding `src/vendor/`). Below is the full classification, organized by file.

---

#### CATEGORY 1: Already Correct (logs error or handles specific named error type)

**wacz.js:113-121** -- TSA catch block
```js
catch (err) {
  tsaError = true;
  await log(env, 4, 'capture', {
    event: 'capture.tsa_fail', tsaUrl: env.TSA_URL,
    errorName: err?.name, errorMessage: String(err?.message ?? '').slice(0, 256),
  });
}
```
Verdict: Already correct -- logs error details. The `timestampStatus` ternary on line 162 already produces `'present'`, `'error'`, or `'absent'`. However, `'absent'` needs renaming to `'skipped'` (see Category 3 below).

**capture.js:125-130** -- Render rejection handler
Logs error details and calls `failCapture`. Already correct.

**capture.js:135-137** -- Header fetch failure
Logs a warning. Already correct.

**capture.js:194-199** -- `archiveSigningKey` catch
Logs a warning. Comment explains why non-fatal. Already correct.

**capture.js:208-212** -- WACZ bundling catch
Logs a warning. Already correct.

**capture.js:256-264** -- Catch-all in `performCapture`
Logs error at severity 5, calls `failCapture`. Already correct.

**capture.js:593-615** -- Consent catch in `defaultRenderer`
Handles specific browser-death errors (re-throws them) and degrades gracefully for consent-specific errors, including structured error metadata in `_error`. Already correct.

**capture.js:505-506** -- Navigation `TimeoutError`
Catches navError, checks `navError.name === 'TimeoutError'` specifically. Already correct.

**kv.js:76-83** -- `createCapture` index write catch
Logs via `console.warn` with error message. Comment explains non-fatal. Already correct.

**kv.js:118-123** -- `completeCapture` index re-write catch
Same pattern as createCapture. Logs with `console.warn`. Already correct.

**kv.js:151-157** -- `failCapture` index re-write catch
Same pattern. Logs with `console.warn`. Already correct.

**verify.js:247-249** -- `verifyTimestamp` catch in verify check
Returns `{ valid: false, reason: err.message }`. Uses the error information. Already correct.

**rfc3161.js:247** -- `verifyTimestamp` outer catch
Returns `{ valid: false, reason: err.message }`. Already correct.

---

#### CATEGORY 2: Silent Swallow -- Needs Fixing

**C2-1. log.js:39** -- `.catch(() => {})`
```js
}).catch(() => {});
```
Location: Promise chain on the `fetch()` call to Coralogix.
Risk: If Coralogix is down, misconfigured, or returning errors, this is invisible. No telemetry on telemetry failure.
Special concern: This is meta-logging. Logging the failure of logging risks infinite recursion if the failure handler itself calls `log()`.

**C2-2. log.js:40** -- `catch { return; }`
```js
catch { return; }
```
Location: Outer try/catch wrapping the entire `log()` function body.
Risk: If `JSON.stringify` throws (circular references) or the fetch construction fails, silent swallow.
Same recursion concern as C2-1.

**C2-3. capture.js:335** -- `catch {}` in `getOrCreateSession`
```js
try {
  return await connect(browserBinding, pick.sessionId);
} catch {
  // Another worker claimed the session between list and connect -- fall through
}
```
Risk: This catches ALL errors from `connect()`, not just "session already claimed" errors. Network errors, protocol errors, or bugs in the Playwright binding would be silently swallowed, and the code would fall through to attempt a new session acquisition instead. The comment names the expected error but doesn't filter for it.

**C2-4. capture.js:563** -- `catch {}` in partial capture deadline fallback
```js
} catch {
  throw new Error('Deadline exceeded before partial capture could complete');
}
```
Risk: Replaces the original error entirely. If `page.screenshot()` or `page.content()` fails for a reason unrelated to the deadline (e.g., browser crash), the original error is lost. The logged error in the caller will show "Deadline exceeded" instead of the real cause. This is a mild form of swallowing -- the catch does propagate an error, but it masks the original.

**C2-5. capture.js:660** -- `.catch(() => {})` in finally block
```js
await Promise.race([
  context.close().then(() => browser.close()),
  new Promise((r) => setTimeout(r, 3000)),
]).catch(() => {});
```
Risk: If `context.close()` or `browser.close()` throws, the error is invisible. Particularly relevant for diagnosing browser session leaks or Playwright binding issues.

**C2-6. capture.js:261** -- `catch {}` on failCapture in catch-all
```js
try {
  await failCapture(env.KV, captureId, 'Capture could not be completed', true);
} catch {
  await log(env, 5, 'capture', { event: 'capture.kv_fail', captureId, tenantId, cip });
}
```
Wait -- this one IS correct. It catches the KV failure and logs it. Reclassifying to Category 1.

**C2-7. consent.js:71** -- `catch {}` in `dismissCookieConsent`
```js
catch {
  return { status: 'failed', cmp: null, durationMs: Date.now() - start };
}
```
Risk: Catches ALL errors from the binding/polling path. This is the top-level catch for the entire consent operation. Since consent is intentionally non-fatal, returning `'failed'` is correct behavior, but the error is completely lost -- no logging, no `_error` metadata. The caller in `capture.js:593` adds `_error` when it catches consent errors, but this catch at line 71 fires first and swallows before the caller's catch ever sees it.

**C2-8. consent.js:103** -- `.catch(() => {})` on `frame.evaluate` (initResp)
```js
frame.evaluate((cfg) => { ... }, AUTOCONSENT_CONFIG).catch(() => {});
```
Risk: If sending `initResp` to a frame fails, no signal. This is expected for detached/cross-origin frames, but the catch doesn't distinguish "expected detached frame" from "unexpected bug".

**C2-9. consent.js:143** -- `.catch(() => {})` on `frame.evaluate` (evalResp)
```js
}).catch(() => {});
```
Same as C2-8.

**C2-10. consent.js:144** -- `.catch(() => {})` on outer `frame.evaluate` chain (eval)
```js
}).catch(() => {});
```
Same as C2-8.

**C2-11. consent.js:167** -- `.catch(() => {})` on `frame.evaluate(inject, ...)`
```js
frame.evaluate(inject, [autoconsentScript]).catch(() => {});
```
Comment on line 166 says "Cross-origin or detached frames may reject evaluate -- non-fatal". Same pattern.

**C2-12. consent.js:242** -- `.catch(() => {})` on `frame.evaluate(wrappedScript)`
```js
frame.evaluate(wrappedScript).catch(() => {});
```
Same as C2-11 but in the polling path. Comment on line 241 is identical.

**C2-13. consent.js:260** -- `.catch(() => null)` on `frame.evaluate` (polling result check)
```js
const result = await frame.evaluate(() => window.__autoconsentResult).catch(() => null);
```
Returns null on failure. This is a form of intentional degradation (detached frame returns no result) and the null is checked. Borderline -- not truly silent because null propagates as "no result yet". Reclassifying to Category 1.

**C2-14. consent.js:272** -- `.catch(() => null)` on `frame.evaluate` (CMP detection check)
```js
const frameCmp = await frame.evaluate(() => window.__autoconsentCmp).catch(() => null);
```
Same as C2-13. Reclassifying to Category 1.

**C2-15. consent.js:131-136** -- `catch {}` inside `frame.evaluate` (browser-side eval)
```js
try {
  const result = eval(c);
  return Promise.resolve(result);
} catch {
  return Promise.resolve(null);
}
```
This executes INSIDE the browser page context (it's the argument to `frame.evaluate`). Not a Worker-side catch. The vendored autoconsent rules use eval for CMP detection; some rules will naturally throw. This is correct behavior in browser context -- we can't log from inside the page. Reclassifying to Category 1.

**C2-16. consent.js:224** -- `catch(e) {}` inside polling wrapped script
```js
try {
  const result = eval(code);
  ...
} catch(e) {}
```
Same as C2-15 -- executes inside the browser page. Reclassifying to Category 1.

**C2-17. signing.js:83** -- `catch {}` in `getSigningKeys`
```js
catch {
  console.warn('Signing key validation failed');
  return null;
}
```
This does log a warning but loses ALL error detail. The `console.warn` message is static -- no error name, no error message. If the SIGNING_KEY is malformed (wrong base64, wrong algorithm, wrong length), the operator sees "Signing key validation failed" with no clue what's wrong. This is a misconfiguration scenario that needs clear diagnostics.

**C2-18. ip-hash.js:59** -- `catch {}` in `computeCip`
```js
catch {
  return undefined;
}
```
Risk: If HMAC computation fails (corrupted seed, WebCrypto API issue), completely silent. Caller gets `undefined` which is the same as "no seed configured". Operator cannot tell "seed not set" from "seed broken".

**C2-19. index.js:162** -- `catch {}` on `request.json()`
```js
try {
  body = await request.json();
} catch {
  return problemResponse(400, 'Request body must be valid JSON');
}
```
This handles a specific error type (JSON parse failure) and returns a meaningful error to the caller. The error detail is not interesting (it's always a client-sent bad body). Reclassifying to Category 1.

**C2-20. index.js:187** -- `catch {}` on `createCapture`
```js
try {
  await createCapture(env.KV, captureId, result.url, result.ip, tenantId);
} catch {
  return problemResponse(500, 'Could not create capture record');
}
```
Risk: KV write failure returns 500 but the error is not logged. If KV is down or misconfigured, no telemetry. Operator sees 500 responses but doesn't know why.

**C2-21. url-validation.js:135** -- `catch {}` in `parseIPv4`
```js
try {
  const normalized = new URL('http://' + hostname).hostname;
  ...
} catch {
  // Not parseable as a URL host
}
```
Returns null on failure. This is a pure parsing function -- it's asking "is this an IPv4 address?" and the answer is "no". Not an error condition. Reclassifying to Category 1.

**C2-22. url-validation.js:220** -- `catch {}` in `parseIPv6ToBigInt`
```js
} catch {
  return null;
}
```
Same as C2-21. Pure parsing. Reclassifying to Category 1.

**C2-23. url-validation.js:333** -- `catch {}` in `validateUrl`
```js
try {
  parsed = new URL(rawUrl);
} catch {
  return { ok: false, status: 400, detail: 'URL is not valid' };
}
```
Handles specific error (URL parse failure). Returns meaningful client error. Reclassifying to Category 1.

**C2-24. cdxj.js:75** -- `catch {}` in `toSurt`
```js
} catch {
  return url;
}
```
Pure parsing. Falls back to original URL. Reclassifying to Category 1.

**C2-25. kv.js:198** -- `catch {}` in cursor decode
```js
} catch {
  return { error: 'invalid_cursor' };
}
```
Handles client-supplied bad cursor. Returns meaningful error. Reclassifying to Category 1.

**C2-26. verify.js:63** -- `catch {}` on `unzipSync`
```js
try {
  files = unzipSync(waczBytes);
} catch {
  return { verified: false, checks: [...] };
}
```
Handles specific error (malformed ZIP). Returns structured verification failure. Reclassifying to Category 1.

**C2-27. verify.js:104** -- `catch {}` on JSON.parse
```js
try {
  datapackage = JSON.parse(...);
  digest      = JSON.parse(...);
} catch {
  return { verified: false, checks: [...] };
}
```
Same as C2-26. Malformed JSON in WACZ. Reclassifying to Category 1.

**C2-28. verify.js:209** -- `catch {}` on timestamp verification
```js
try {
  const result = verifyTimestamp(tsEntry.token, signedData.hash);
  ...
} catch {
  checks.push({ name: 'timestamp', status: 'fail', detail: 'Independent timestamp verification failed' });
}
```
Handles verification failure. Returns structured failure. Reclassifying to Category 1.

**C2-29. verify-page.js (browser-side JS)** -- `catch (_) {}` patterns
Lines 308, 322 -- inside client-side `safeUrl()` and `fmtDate()` functions in the verification page's inline `<script>`. These run in the end-user's browser, not in the Worker. They're defensive browser-side code (URL constructor or Intl.DateTimeFormat may throw in exotic locales/inputs). Not Worker-side catches. Reclassifying to N/A.

---

#### Final Category 2 List (truly silent catches needing fixes)

| # | File:Line | Pattern | Issue |
|---|-----------|---------|-------|
| C2-1 | log.js:39 | `.catch(() => {})` | Meta-logging fetch failure silent |
| C2-2 | log.js:40 | `catch { return; }` | JSON.stringify / fetch construction failure silent |
| C2-3 | capture.js:335 | `catch {}` | Session connect failure masks non-race errors |
| C2-4 | capture.js:563 | `catch {}` | Replaces original error with generic deadline message |
| C2-5 | capture.js:660 | `.catch(() => {})` | Cleanup failure silent |
| C2-7 | consent.js:71 | `catch {}` | Top-level consent error loses all detail |
| C2-8 | consent.js:103 | `.catch(() => {})` | Frame evaluate initResp silent |
| C2-9 | consent.js:143 | `.catch(() => {})` | Frame evaluate evalResp silent |
| C2-10 | consent.js:144 | `.catch(() => {})` | Frame evaluate eval chain silent |
| C2-11 | consent.js:167 | `.catch(() => {})` | Frame inject silent |
| C2-12 | consent.js:242 | `.catch(() => {})` | Frame inject (polling path) silent |
| C2-17 | signing.js:83 | `catch {}` | Key validation error detail lost |
| C2-18 | ip-hash.js:59 | `catch {}` | HMAC failure indistinguishable from unconfigured |
| C2-20 | index.js:187 | `catch {}` | KV write failure not logged |

---

#### CATEGORY 3: Intentional Degradation -- Needs Status Distinction

**C3-1. wacz.js:162** -- `timestampStatus: 'absent'` rename
```js
timestampStatus: tsaResult ? 'present' : (tsaError ? 'error' : 'absent')
```
The value `'absent'` means "TSA_URL was not configured" (intentional skip). This is correct behavior but the status value `'absent'` is ambiguous -- it could mean "TSA was configured but didn't respond" or "TSA was intentionally not set up". The issue spec calls for renaming `'absent'` to `'skipped'` to make the semantics clear:
- `'present'` = TSA configured, timestamp obtained
- `'skipped'` = TSA not configured (env.TSA_URL absent)
- `'error'` = TSA configured, request failed

This rename propagates to:
- `wacz.js:45` -- JSDoc type annotation
- `wacz.js:162` -- the actual value
- `test/wacz.test.js:270,278` -- test description and assertion
- `capture.js:239` -- log field default value (already uses `'skipped'` but for different semantics: "WACZ not built because partial")

Note: `capture.js:239` uses `waczInfo?.timestampStatus ?? 'skipped'` which means "if no WACZ was built, report timestampStatus as skipped". This is already semantically correct -- the fallback `'skipped'` means "timestamp was skipped because WACZ was skipped". No change needed here because the nullish coalescing handles the case where `waczInfo` is null (partial capture or no signing key), and when `waczInfo` exists, the value comes from `wacz.js` which will now return `'skipped'` instead of `'absent'`.

---

### Recommendations

#### R1. log.js: Use `console.warn` for meta-logging failures (C2-1, C2-2)

The recursion risk is real: if `log()` called `log()` on failure, a broken Coralogix endpoint would create infinite recursion. The correct fix is `console.warn` -- it goes to Workers runtime logs (visible in `wrangler tail`) without going through the Coralogix pipeline.

```js
export function log(env, severity, subsystem, data) {
  if (!env.CORALOGIX_ENDPOINT || !env.CORALOGIX_SEND_KEY) return;
  try {
    return fetch(env.CORALOGIX_ENDPOINT, {
      method: 'POST',
      headers: { ... },
      body: JSON.stringify([{ ... }]),
    }).catch((err) => {
      console.warn('log: Coralogix fetch failed:', err?.message);
    });
  } catch (err) {
    console.warn('log: failed to build log entry:', err?.message);
    return;
  }
}
```

Why `console.warn` and not `console.error`: This is telemetry degradation, not a system failure. The capture itself may have succeeded. `warn` is the right severity for "observability pipeline is degraded".

#### R2. capture.js:335: Log when session connect fails (C2-3)

The catch should log at debug level, because the "race claimed" case is common and normal. But it should still capture the error information for the non-race cases.

```js
try {
  return await connect(browserBinding, pick.sessionId);
} catch (err) {
  // Expected: another worker claimed the session between list and connect.
  // Also catches unexpected connect failures -- log to distinguish.
  console.warn('getOrCreateSession: connect to free session failed:', err?.message);
}
```

Why `console.warn` and not `log()`: This runs before we have `env` in scope (the function only receives `browserBinding`). `console.warn` is the only option.

#### R3. capture.js:563: Preserve original error in partial capture catch (C2-4)

```js
} catch (err) {
  throw new Error(
    `Partial capture failed: ${err?.message ?? 'unknown'}`,
    { cause: err }
  );
}
```

This preserves the original error as `cause` while still communicating "partial capture failed". The caller (`categorizeError`) will use the outer message.

#### R4. capture.js:660: Log cleanup failure in finally block (C2-5)

```js
await Promise.race([
  context.close().then(() => browser.close()),
  new Promise((r) => setTimeout(r, 3000)),
]).catch((err) => {
  console.warn('capture: browser cleanup failed:', err?.message);
});
```

Why not `log()`: We're in the finally block, likely after the main work is done. The `env` binding may still be available, but calling `log()` here extends the request lifetime. `console.warn` is lighter and avoids coupling cleanup to the observability pipeline.

#### R5. consent.js:71: Capture error details in top-level catch (C2-7)

```js
} catch (err) {
  return {
    status: 'failed',
    cmp: null,
    durationMs: Date.now() - start,
    _error: {
      name: err?.constructor?.name ?? 'Unknown',
      message: String(err?.message ?? '').slice(0, 256),
    },
  };
}
```

This mirrors the pattern already used in `capture.js:609-613`. The caller already checks for `_error` and logs it at `capture.js:247-254`.

#### R6. consent.js frame evaluate catches (C2-8, C2-9, C2-10, C2-11, C2-12): Leave as-is but document

These catches are genuinely expected for cross-origin and detached frames. Frame lifecycle operations in Playwright throw on detached frames, and this is normal during page teardown. Adding logging here would generate noise (every capture with iframes would log multiple warnings).

Recommendation: Change the empty catches to include a comment referencing the project principle and explaining why they're exempt:

```js
// Expected: cross-origin or detached frames reject evaluate (non-fatal, not logged)
frame.evaluate(inject, [autoconsentScript]).catch(() => {});
```

These are the one legitimate exception to the "no silent catch" rule. The error IS handled -- it's handled by being intentionally ignored because the operation is best-effort across frames. The comment makes this explicit for future auditors.

If the team wants stricter adherence, an alternative is logging at the lowest severity (severity 1/debug) but only for the FIRST frame failure per consent attempt, to avoid log spam.

#### R7. signing.js:83: Include error details in warning (C2-17)

```js
} catch (err) {
  console.warn('Signing key validation failed:', err?.message);
  return null;
}
```

This preserves the `return null` graceful degradation but gives operators enough information to diagnose misconfigured SIGNING_KEY values (wrong format, wrong algorithm).

#### R8. ip-hash.js:59: Log HMAC failure and distinguish from unconfigured (C2-18)

```js
} catch (err) {
  console.warn('computeCip: HMAC computation failed:', err?.message);
  return undefined;
}
```

The return value stays `undefined` (same as unconfigured) because the caller's behavior is the same either way -- proceed without CIP. But the `console.warn` makes misconfiguration visible in `wrangler tail`.

#### R9. index.js:187: Log KV write failure (C2-20)

```js
try {
  await createCapture(env.KV, captureId, result.url, result.ip, tenantId);
} catch (err) {
  await log(env, 5, 'capture', {
    event: 'capture.kv_create_fail',
    tenantId,
    cip,
    errorMessage: String(err?.message ?? '').slice(0, 256),
  });
  return problemResponse(500, 'Could not create capture record');
}
```

Why `log()` and not `console.warn`: Here we have `env` in scope, the error is a server-side failure (KV unavailable), and it should be visible in Coralogix alongside other capture telemetry. If `log()` itself fails, R1 ensures that failure is also visible via `console.warn`.

#### R10. wacz.js: Rename `'absent'` to `'skipped'` (C3-1)

Line 45 JSDoc: Change `'absent'` to `'skipped'` in the type annotation.
Line 162: Change `'absent'` to `'skipped'` in the return value.

Test files to update:
- `test/wacz.test.js:270`: Change test description from "absent" to "skipped"
- `test/wacz.test.js:278`: Change assertion from `'absent'` to `'skipped'`

No changes needed in `capture.js:239` -- the fallback `'skipped'` is already correct.

---

### Proposed Tasks

1. **T1: Fix log.js catches** (C2-1, C2-2) -- Replace empty catches with `console.warn`. Est: trivial.

2. **T2: Fix capture.js silent catches** (C2-3, C2-4, C2-5) -- Add `console.warn` to session connect, preserve original error in partial capture, add `console.warn` to cleanup. Est: small.

3. **T3: Fix consent.js top-level catch** (C2-7) -- Add `_error` field. Document frame-level catches (C2-8 through C2-12). Est: small.

4. **T4: Fix signing.js catch** (C2-17) -- Include `err?.message` in console.warn. Est: trivial.

5. **T5: Fix ip-hash.js catch** (C2-18) -- Add `console.warn`. Est: trivial.

6. **T6: Fix index.js createCapture catch** (C2-20) -- Add `log()` call before returning 500. Est: trivial.

7. **T7: Rename timestampStatus 'absent' to 'skipped'** (C3-1) -- Update wacz.js value and JSDoc, update test assertions. Est: small.

8. **T8: Update tests** -- Update existing test assertions that check for the old `'absent'` value, and add test coverage for the new `console.warn` calls where practical.

Tasks T1-T7 can be done in a single PR. They are all independent changes (no ordering dependency) and all small/trivial. Total estimated LOC changed: ~40-60 lines.

---

### Risks and Concerns

**Risk 1: log.js recursion**
The R1 fix uses `console.warn` specifically to avoid recursion. Any fix that calls `log()` from within `log()` MUST be rejected -- even indirectly (e.g., calling a helper that calls `log()`).

**Risk 2: consent.js frame catches are genuinely expected**
Adding logging to every frame evaluate catch (C2-8 through C2-12) would generate 5-50 log lines per consent attempt. The cost outweighs the benefit. The recommendation is to document rather than log. If the team disagrees, use a counter (log only the count of frame failures, not each one) or log at severity 1 (debug/trace) which can be filtered at the Coralogix level.

**Risk 3: Test brittleness from timestampStatus rename**
The `'absent'` to `'skipped'` rename touches test assertions. The integration tests (`capture-pipeline.test.js`, `advisory.test.js`) only check for `'present'`, so they are not affected. Only `test/wacz.test.js` needs updating.

**Risk 4: console.warn in production Workers**
`console.warn` output is visible in `wrangler tail` and Workers trace events. In production, it goes to Cloudflare's internal log pipeline. This is the correct destination for meta-logging failures that cannot go through Coralogix. However, verify that the Workers runtime does not throttle or drop `console.warn` calls under high concurrency.

**Risk 5: verify-page.js and API timestampStatus exposure**
The verify-page.js HTML template and the API responses do not currently expose `timestampStatus` directly. The status flows through the `timestamp` check in `verify.js` which uses `'skip'` (not `'skipped'` or `'absent'`) as the check status. The `timestampStatus` field lives in KV records and log entries. The rename from `'absent'` to `'skipped'` affects:
- KV records created after deployment (new captures)
- Log entries going forward
Existing KV records will still have `'absent'`. Downstream consumers (if any) that parse `timestampStatus` from KV records should handle both values during the transition. The verification page does not read `timestampStatus` at all -- it reads the `checks` array which uses `'skip'`/`'pass'`/`'fail'`.

---

### Additional Agents Needed

- **test-minion**: Update test assertions for `'absent'` -> `'skipped'` rename. Potentially add test coverage verifying that `console.warn` is called in the new error paths (using `vi.spyOn(console, 'warn')`).

- No other agents needed. The changes are straightforward error handling improvements -- no architectural changes, no new features, no security implications beyond improved observability.
