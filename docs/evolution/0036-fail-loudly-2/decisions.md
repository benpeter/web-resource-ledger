# Decisions: Eliminate Silent Catch Blocks

## Catch Block Audit

Every `catch` block in `src/` (excluding `src/vendor/`) was audited and classified:

### Modified (14 catches across 8 files)

| File | Line | Before | After | Rationale |
|------|------|--------|-------|-----------|
| `log.js:39` | `.catch(() => {})` | `console.warn('wrl:log_delivery_fail', ...)` | Meta-logging — cannot call `log()` (recursion). `console.warn` is the only safe channel. |
| `log.js:40` | `catch { return; }` | `console.warn('wrl:log_build_fail', ...)` | Same recursion constraint. |
| `signing.js:83` | `catch {}` + generic warn | `catch (err)` with error message in warn | Preserves error detail for diagnosing misconfigured SIGNING_KEY. Error message truncated to 200 chars to avoid leaking OpenSSL DER format hints. |
| `ip-hash.js:59` | `catch {}` | `console.warn('wrl:cip_hash_fail', ...)` | Distinguishes "HMAC computation failed" from "seed not configured" (the early-return path). |
| `index.js:187` | `catch {}` returns 500 | `catch (err)` with `capture.kv_create_fail` Coralogix event | KV write failure was completely invisible — 500 returned to client with zero logging. |
| `index.js:263` | `log(env, 3, ...)` | `log(env, 5, ...)` | Severity 3 (info) was wrong for a 500 error response. Changed to 5 (error). |
| `consent.js:71` | `catch {}` | `catch (err)` with `_error` field | Upstream caller at `capture.js:247` already checks for `_error` and logs `capture.consent_error`. Just needed wiring. |
| `capture.js:196` | `catch (err)` without errorMessage | Added `errorMessage` to log payload | Consistency: every other catch in this file forwards the error message. |
| `capture.js:208` | `catch (err)` without errorMessage | Added `errorMessage` to log payload | Same consistency fix. |
| `capture.js:261` | `catch {}` | `catch (err)` with `errorMessage` | Bound error for consistency with other catches. |
| `capture.js:335` | `catch {}` | `console.warn('wrl:session_connect_fail', ...)` | Distinguishes expected race condition from unexpected connect failure. |
| `capture.js:563` | `catch {}` rethrows generic | `catch (err)` preserves original via `{ cause: err }` | Original error was discarded, masking root cause of partial capture failures. |
| `capture.js:660` | `.catch(() => {})` | `console.warn('wrl:capture_cleanup_fail', ...)` | Cleanup failures in finally were invisible. |
| `wacz.js:162` | `'absent'` | `'skipped'` | Semantic clarity: `'skipped'` = intentionally not configured, distinct from `'error'` = configured but failed. Matches existing `capture.js:231` convention. |

### Added (2 new log events in index.js)

| File | Line | Event | Rationale |
|------|------|-------|-----------|
| `index.js:468` | `signing.key_unavailable` | Distinguishes `key_absent` (not configured) from `key_invalid` (misconfigured) at verify endpoint. Direct analog of the TSA fix. |
| `index.js:546` | `signing.key_unavailable` | Same event at the signing-key endpoint. |

### Approved as-is (correctly handled, no change needed)

| File | Line | Pattern | Why correct |
|------|------|---------|-------------|
| `wacz.js:113` | `catch (err)` | Already logs `capture.tsa_fail` to Coralogix with error details |
| `capture.js:114-130` | `Promise.allSettled` | Render failure logged with `capture.stage.fail` |
| `capture.js:256` | `catch (err)` | Catch-all logs `capture.fail` |
| `capture.js:464` | `catch (err)` | frame() detached frame — browser lifecycle, empty body acceptable |
| `index.js:162` | `catch {}` | JSON parse — returns 400 with meaningful message |
| `index.js:261` | `catch (err)` | List error — logs error class and message |
| `kv.js:81,121,155` | `catch (err)` | Index write failures — `console.warn` with error message |
| `kv.js:198` | `catch {}` | Cursor decode — returns `{ error: 'invalid_cursor' }` |
| `rfc3161.js:247` | `catch (err)` | Returns `{ valid: false, reason: err.message }` |
| `verify.js:63,104,209` | `catch {}` | Returns structured failure results with specific detail messages |
| `url-validation.js:135,220,333` | `catch {}` | Input validation — returns null/error appropriately |
| `url-validation.js:390` | `.catch(e => ...)` | DNS resolution error captured in result |

### Intentionally silent (browser context, documented with comments)

| File | Line | Pattern | Why silent |
|------|------|---------|-----------|
| `consent.js:103` | `.catch(() => {})` | Cross-origin frame initResp delivery — non-fatal |
| `consent.js:144` | `catch {}` | eval of autoconsent rule code in browser — non-fatal |
| `consent.js:153,155` | `.catch(() => {})` | evalResp delivery to frame — non-fatal |
| `consent.js:178` | `.catch(() => {})` | Script injection into cross-origin iframe — non-fatal |
| `consent.js:235` | `catch(e) {}` | eval in page context (injected string) — cannot reach Worker |
| `consent.js:253` | `.catch(() => {})` | Polling-path frame injection — non-fatal |
| `consent.js:271,283` | `.catch(() => null)` | Detached frame evaluate — returns null |
| `verify-page.js:310` | `catch (_) {}` | Client-side URL parse guard — returns null |
| `verify-page.js:321` | `catch (_)` | Client-side date format fallback — returns raw ISO |
| `verify-page.js:670` | `.catch(fn)` | Client-side retrieval fetch — returns null |
| `verify-page.js:679` | `.catch(fn)` | Client-side main error handler — shows error UI |

## Key Decisions

### console.warn vs console.error for log.js
- **Chose console.warn.** Telemetry degradation is not a system failure. The capture itself may have succeeded. `wrl:` prefix makes filtering possible regardless of severity.

### console.warn vs structured Coralogix events for signing.js and ip-hash.js
- **Chose console.warn only.** signing.js fires once at key import time (not hot path, but also not worth the wiring complexity). ip-hash.js is on every request — adding `log()` would add a network call in the hot path.

### Preserving original error in capture.js partial capture path
- **Chose `{ cause: err }`.** The current code discarded the original error entirely. Zero-cost fix that gives operators the real failure reason.

### timestampStatus: 'absent' → 'skipped'
- **Renamed.** `'skipped'` = intentional (TSA not configured). `'error'` = unintentional (TSA configured but failed). `'present'` = success. This was the root cause of the invisible DigiCert TSA misconfiguration (#66).
