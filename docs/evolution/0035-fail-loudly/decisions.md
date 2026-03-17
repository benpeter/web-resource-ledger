# Decisions: Fail Loudly (#70)

## 1. timestampStatus: 'absent' → 'skipped'

**Decision**: Rename the "TSA not configured" status value from `'absent'` to `'skipped'`.

**Rationale**: `'absent'` is ambiguous — it could mean "TSA was configured but didn't respond" or "TSA was never configured." The new three-way semantics make the distinction clear:
- `'present'` — TSA configured, timestamp obtained successfully
- `'skipped'` — TSA not configured (intentional omission, not an error)
- `'error'` — TSA configured but request failed (operational issue needing attention)

**Rejected alternative**: Adding a fourth status `'disabled'` — unnecessary complexity. `'skipped'` already communicates "not configured."

## 2. Catch block classification: log vs comment

**Decision**: Classify catch blocks into three tiers:
1. **Log to Coralogix** — infrastructure failures that are otherwise invisible (index.js KV createCapture failure)
2. **Name the error + comment** — intentional degradation at system boundaries or data conversion fallbacks (most catch blocks)
3. **Comment only** — terminal handlers where no recourse exists (log.js self-failure, browser cleanup)

**Rationale**: Not every catch block needs Coralogix logging. URL parsing failures in cdxj.js fire for every malformed WARC record URL — logging each would be noise. But a KV write failure returning 500 with zero logging is an invisible outage.

**Rejected alternative**: Adding Coralogix logging to every catch block — violates KISS and would create log noise for expected browser frame failures (consent.js fires `.catch()` dozens of times per capture for cross-origin frame injection).

## 3. consent.js _error propagation fix

**Decision**: The top-level catch in `dismissCookieConsent()` now preserves the error object as `_error` on the returned shape, matching the pattern used in capture.js's consent error handling.

**Rationale**: capture.js has an `if (consent?._error)` logging path at line 247 that logs consent errors to Coralogix. But when the top-level catch fired, it returned `{ status: 'failed', cmp: null }` without `_error`, making this logging path dead code. This was a silent error swallowing bug.

## 4. Scope discipline — kept kv.js console.warn as-is

**Decision**: Did not upgrade kv.js `console.warn` calls to Coralogix logging.

**Rationale**: The issue scope is "fix silent catch blocks." kv.js already logs via `console.warn('createCapture: index write failed (non-fatal)', err?.message)` — this is not silent. Upgrading to Coralogix would require threading `env` through additional parameters, which is scope creep. The index write failures are documented as non-fatal in code comments.

## 5. Browser-side JS catch blocks

**Decision**: Fixed the bare `catch(e) {}` in consent.js's browser-injected script to `catch(_) { /* comment */ }`.

**Rationale**: While this runs in the browser (not the Worker), it's still source code in `src/`. The "no bare catch" rule applies to all code in the codebase.
