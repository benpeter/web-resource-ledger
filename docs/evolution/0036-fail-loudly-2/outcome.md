# Outcome: Eliminate Silent Catch Blocks

## Summary

Audited all 40+ catch blocks across `src/`, fixed 14 silent catches in 8 source files, added 3 new tests, updated 3 existing test files. Renamed `timestampStatus: 'absent'` to `'skipped'` for clear three-way semantics. Added `signing.key_unavailable` Coralogix event to distinguish misconfigured from absent signing keys.

## What Changed

### Source files (8 modified)

| File | Changes |
|------|---------|
| `src/log.js` | 2 catches: `.catch(() => {})` → `console.warn('wrl:log_delivery_fail', ...)` and `catch {}` → `console.warn('wrl:log_build_fail', ...)` |
| `src/signing.js` | 1 catch: bare `catch` → `catch (err)` with error message in warning (truncated to 200 chars) |
| `src/ip-hash.js` | 1 catch: bare `catch` → `console.warn('wrl:cip_hash_fail', ...)` |
| `src/index.js` | 3 changes: `capture.kv_create_fail` Coralogix event (sev 5), `list.error` severity 3→5, `signing.key_unavailable` events at verify and signing-key endpoints |
| `src/consent.js` | 1 catch: top-level `catch {}` → `catch (err)` with `_error` field. Added explanatory comments to 4 intentionally silent browser-context catches. |
| `src/capture.js` | 5 changes: `key_archive_fail` and `wacz_fail` now include `errorMessage`; session connect catch warns; partial capture preserves original error via `{ cause: err }`; cleanup catch warns; `kv_fail` catch binds err |
| `src/cdxj.js` | 1 catch: bare `catch` → `console.warn('wrl:cdxj_surt_parse_fail', ...)` with scheme+length only (no raw URL) |
| `src/wacz.js` | `timestampStatus: 'absent'` → `'skipped'` in JSDoc and return value |

### Test files (4 modified)

| File | Changes |
|------|---------|
| `test/log.test.js` | Renamed describe blocks, added `console.warn` spy assertions for `wrl:log_delivery_fail` and `wrl:log_build_fail` |
| `test/wacz.test.js` | `'absent'` → `'skipped'` assertion, added `toSurt returns unparseable URL as-is` test |
| `test/key-rotation.test.js` | Added `getSigningKeys returns null for malformed SIGNING_KEY` test with spy asserting no key value leakage |
| `test/verify-integration.test.js` | Fixed stale comment referencing 'absent' |

### Other files

| File | Changes |
|------|---------|
| `src/verify-page.js` | Added explanatory comment to `safeUrl` catch (browser-side code) |

## Test Results

510 tests pass across 23 test files. No regressions.

## Backlog Changes

No backlog changes. This phase addressed an existing issue (#70) without deferring any work or creating new backlog items. The `timestampStatus` rename is internal (KV records and logs only) and requires no migration of existing data.

## Surprises

1. **`capture.js:196,208` were already binding `err` but not forwarding it.** These pre-existing catches had the error object available but weren't including it in the log payload. Caught during Phase 5 code review.

2. **`capture.js:231` already used `'skipped'` as the null fallback** (`waczInfo?.timestampStatus ?? 'skipped'`), meaning the `'absent'` value in `wacz.js` was always inconsistent with `capture.js`. The rename corrected this inconsistency.

3. **The `consent.js:235` catch** is inside a string template injected into browser page context — it can't reach Worker-side logging. Required an inline comment rather than actual logging.
