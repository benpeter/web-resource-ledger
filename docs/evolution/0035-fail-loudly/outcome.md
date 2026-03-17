# Outcome: Fail Loudly (#70)

## What was built

Eliminated all bare `catch {}` blocks from `src/` and established three-way timestamp status semantics (`present`/`skipped`/`error`).

## Files changed

| File | Change | Lines |
|------|--------|-------|
| `src/wacz.js` | `'absent'` → `'skipped'` in timestampStatus ternary | 1 |
| `src/index.js` | Named catch params, added Coralogix logging for KV failure | 4 |
| `src/cdxj.js` | Named catch param + comment | 1 |
| `src/capture.js` | Named 4 catch params + added comments | 8 |
| `src/consent.js` | Named catch param + `_error` propagation fix + comments | 10 |
| `src/signing.js` | Named catch param + included error in console.warn | 1 |
| `src/verify.js` | Named 3 catch params + comments | 6 |
| `src/log.js` | Named catch param + comments | 2 |
| `src/kv.js` | Named catch param + comment | 2 |
| `src/url-validation.js` | Named 3 catch params + comments | 3 |
| `src/ip-hash.js` | Named catch param + comment | 2 |
| `test/wacz.test.js` | Updated `'absent'` → `'skipped'` assertion | 2 |

## Key outcomes

1. **Zero bare catch blocks remain in `src/`** — grep confirms `} catch {` returns no matches
2. **Three-way timestamp status** — `'present'`/`'skipped'`/`'error'` now unambiguously distinguishes "working," "not configured," and "broken"
3. **consent.js bug fix** — top-level catch now preserves `_error`, enabling the existing `capture.consent_error` Coralogix logging path
4. **KV failure visibility** — `index.js` now logs `capture.kv_create_fail` to Coralogix when the initial KV write fails (previously returned 500 with zero logging)
5. **All 508 tests pass** — only one test needed updating (wacz.test.js `'absent'` → `'skipped'`)

## What deviated from plan

Nothing — the scope was well-defined and execution matched the plan exactly.

## Backlog changes

No new items added. No items removed. The issue's "Out of scope" items (retry logic, circuit breakers, alerting rules) remain as potential future work but are not on the backlog.
