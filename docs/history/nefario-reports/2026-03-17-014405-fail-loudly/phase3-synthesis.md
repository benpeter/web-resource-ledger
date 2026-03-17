# Execution Plan: Eliminate Silent Catch Blocks

## Task 1: Fix timestampStatus semantics (wacz.js)
**Agent**: self (direct execution)
**Changes**:
- wacz.js:162 — Change `'absent'` to `'skipped'` in the ternary

## Task 2: Audit and fix all bare catch blocks in src/
**Agent**: self (direct execution)
**Changes by file**:

### High priority (silent infrastructure failures):
- **index.js:187** — Add `(err)` parameter + Coralogix log before returning 500 (KV failure is currently invisible)
- **consent.js:71** — Add `(err)` parameter + preserve `_error` on returned shape (fixes bug: capture.js consent._error logging path never fires)

### Medium priority (bare catch needs parameter name):
- **cdxj.js:75** — `catch {` → `catch (_urlParseErr)` + comment: URL parse fallback
- **index.js:162** — `catch {` → `catch (_jsonErr)` + comment: input validation boundary
- **capture.js:335** — `catch {` → `catch (_sessionRaceErr)` + comment: session connect race
- **capture.js:563** — `catch {` → `catch (_deadlineErr)` + comment: rethrow pattern
- **capture.js:261** — `catch {` → `catch (_kvErr)` + already logs on next line
- **signing.js:83** — `catch {` → `catch (err)` + include err in console.warn
- **verify.js:63** — `catch {` → `catch (_zipErr)` + comment
- **verify.js:104** — `catch {` → `catch (_jsonErr)` + comment
- **verify.js:209** — `catch {` → `catch (_tsErr)` + comment
- **log.js:40** — `catch {` → `catch (_logErr)` + comment
- **kv.js:198** — `catch {` → `catch (_cursorErr)` + comment

### Low priority (inline .catch needs comment):
- **capture.js:660** — `.catch(() => {})` → add comment: cleanup terminal, result already determined
- **capture.js:464** — empty catch body → add comment: detached frame lifecycle
- **consent.js:103,143,144** — `.catch(() => {})` → add comments: cross-origin frame, non-fatal
- **consent.js:135** — `catch {` → `catch (_evalErr)` + comment: eval fallback in frame
- **consent.js:167,242** — `.catch(() => {})` → already have comment
- **log.js:39** — `.catch(() => {})` → add comment: logging failure terminal

### Browser-side JS (in template string):
- **consent.js:224** — `catch(e) {}` → `catch(_) { /* eval failed in CMP rule -- non-fatal */ }`

## Task 3: Update tests
**Agent**: self (direct execution)
**Changes**:
- **test/wacz.test.js** — Change 'absent' → 'skipped' assertion (line ~270-279)

## Dependencies
None — all tasks are independent and can be done sequentially in one pass.

## Risks
- Low: The 'absent' → 'skipped' change is a semantic API change for the waczInfo.timestampStatus field in KV records. However, no external consumer depends on this value (it's internal metadata).
- Low: Adding error parameters to catch blocks is purely syntactic, no behavioral change.
