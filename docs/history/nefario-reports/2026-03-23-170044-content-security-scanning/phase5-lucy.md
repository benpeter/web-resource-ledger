# Lucy Review: Phase 0061 -- Content Security Scanning

## Verdict: ADVISE

The implementation correctly addresses all stated requirements from Issue #109 / the phase prompt. No goal drift, no scope creep, no missing requirements. The code is clean, well-structured, and follows project conventions. The issues below are documentation-vs-code inconsistencies that should be corrected before merge to prevent operator confusion during incident response.

---

## Requirements Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|---|---|---|
| Pre-capture URL check against threat intel | `src/threat-check.js:checkUrl()` + `src/index.js:723-736` (single) + `src/index.js:1008-1037` (batch) | COVERED |
| Malicious URLs rejected with HTTP 422 + threat type | `src/index.js:733-735` returns 422 with `threatTypes` in body | COVERED |
| Background re-scan via Cron Trigger (daily) | `src/rescan.js:handleRescanTick()` + `wrangler.toml` cron `0 3 * * *` | COVERED |
| Flagged captures quarantined: metadata accessible, artifacts return 451 | `src/index.js:1388-1405` (metadata), `src/index.js:1465-1472` (artifacts 451), `src/index.js:1545-1553` (verify 451) | COVERED |
| Quarantine status visible in metadata (`status: "quarantined"`, `quarantineReason`) | `src/db.js:57-77` rowToCapture maps quarantined flag | COVERED |
| Coralogix alert for flagged-capture threshold | `scripts/provision-alerts.sh:117-155` + `docs/operations/alerts.md:96-121` | COVERED |
| Graceful degradation: capture proceeds with threat check status in metadata | `src/index.js:737-746` logs degraded + proceeds; `src/index.js:769-772` stores `unavailable` | COVERED |
| API key stored as Worker secret | `GOOGLE_WEB_RISK_API_KEY` accessed via `env.GOOGLE_WEB_RISK_API_KEY` | COVERED |

No orphaned tasks. No unaddressed requirements.

---

## Findings

### 1. [CONVENTION] Runbook and alerts.md describe fail-open behavior as fail-closed

**File:** `docs/operations/runbooks/threat-check-api-failures.md:7-11`
**File:** `docs/operations/alerts.md:134-135`

**CHANGE:** Both documents state that when the Web Risk API fails, "capture requests are being rejected with an error response" and "tenants cannot complete captures until the Web Risk API recovers."

**WHY this is wrong:** The actual behavior is fail-open. When the API is degraded, `checkUrl()` returns `{ safe: true, degraded: true }` (threat-check.js:65,71,78), and the capture proceeds normally with `threat_check = 'unavailable'` (index.js:737-746, responseStatus 202). The system explicitly does NOT block captures on API failure -- this was a stated requirement ("capture proceeds with `safeBrowsing: "unavailable"` in metadata, not silently skipped"). An operator reading this runbook during an incident would believe captures are failing when they are not.

**FIX:** Rewrite both documents to describe the actual behavior: captures proceed in degraded mode, the `threatCheck` field is set to `unavailable`, and the alert is a monitoring signal that threat screening coverage is reduced -- not that captures are failing.

---

### 2. [CONVENTION] `threatcheck.api_fail` log severity mismatch between code and audit-log-schema

**File:** `src/index.js:738` -- logs at severity 4 (warn)
**File:** `docs/audit-log-schema.md:53` -- documents severity 5 (error) for `context:"pre_capture"`

**CHANGE:** The audit log schema says `threatcheck.api_fail` with `context:"pre_capture"` should be severity 5 (error). The code emits it at severity 4 (warn).

**WHY this matters:** The Coralogix alert for Threat Check API Failures matches on `event:"threatcheck.api_fail" AND context:"pre_capture"`. If operators build dashboards or queries that filter by severity level >= 5, they will miss these events. Either the code or the docs is wrong -- pick one and align the other.

**FIX:** Either change `src/index.js:738` from `log(env, 4, ...)` to `log(env, 5, ...)` to match the documented schema, or update `docs/audit-log-schema.md:53` to say severity 4. Given the fail-open behavior (captures proceed), severity 4 (warn) is arguably more appropriate -- this is a degradation, not a failure.

---

### 3. [CONVENTION] `threatcheck.pass` event documented but never emitted

**File:** `docs/audit-log-schema.md:49`

**CHANGE:** The audit log schema documents a `threatcheck.pass` event: "Pre-capture URL threat check passed; capture proceeds." No code in `src/` emits this event.

**WHY this matters:** An operator querying for `threatcheck.pass` events will get zero results and may conclude threat checking is broken. The schema is the contract for what appears in logs.

**FIX:** Either add the log emission to the capture flow after a successful threat check (one `log()` call in index.js after line 746 and after the batch equivalent), or remove the entry from the audit log schema. Given the logging cost at info level for every successful capture, removing the doc entry may be preferable unless the operator explicitly needs a positive signal.

---

### 4. [CONVENTION] OpenAPI and README list `threatCheck: "fail"` as a possible value, but it is never written

**File:** `openapi.yaml:576` -- `enum: [pass, fail, unavailable]`
**File:** `README.md:30` -- "reflects the outcome: `pass`, `fail`, or `unavailable`"

**CHANGE:** The `threatCheck` field's enum includes `fail`, but the code only writes `pass` or `unavailable` (index.js:771, 1065). When a URL fails the threat check, the capture is rejected with 422 -- no capture record is created, so there is no record to store `fail` on.

**WHY this matters:** API consumers reading the OpenAPI spec will write code to handle a `threatCheck: "fail"` state that can never occur. This creates dead code paths and confuses developers integrating with the API.

**FIX:** Remove `fail` from the enum in `openapi.yaml:576` (and the duplicate at ~line 650) and from the README. The only possible values are `pass`, `unavailable`, and `null` (pre-feature captures).

---

### 5. [CONVENTION] Bare `catch {}` block in threat-check.js

**File:** `src/threat-check.js:77`

**CHANGE:** Line 77 uses a bare `catch {}` with no error variable and no logging. The CLAUDE.md Engineering Philosophy states: "Silent `catch {}` blocks are forbidden. Every catch must either log the error or handle a specific, named error type."

**WHY this is borderline:** The function returns `{ degraded: true }` which signals the failure to callers, so the error is not truly silent -- it is communicated via return value. The caller (index.js) logs the degradation. However, the `catch` on line 62 does capture the error variable even though it also doesn't log, establishing an inconsistency within the same file.

**FIX:** Add the error variable for consistency: `catch (_err)` or `catch { /* JSON parse failure -- degraded return signals caller */ }`. This is minor.

---

### 6. [COMPLIANCE] Evolution log incomplete: missing decisions.md, outcome.md, and index entry

**File:** `docs/evolution/0061-content-security-scanning/` -- only contains `prompt.md`
**File:** `docs/evolution/README.md` -- no entry for phase 0061

**CHANGE:** CLAUDE.md requires: (1) `decisions.md` written during the phase, (2) `outcome.md` written after the phase, and (3) the phase added to the evolution log index.

**WHY:** The evolution log is explicitly called "non-negotiable" in CLAUDE.md. This project's stated dual purpose (product + agent showcase) makes the process record load-bearing.

**FIX:** Before merge: create `decisions.md` documenting the Web Risk vs Safe Browsing API choice, the fail-open vs fail-closed decision, the virtual `quarantined` status approach, and the `threat_checks` audit table design. Create `outcome.md` summarizing what was built. Add phase 0061 to the README.md index. Update the backlog in `outcome.md`.

---

## Scope Assessment

No scope creep detected. The implementation stays within the declared scope boundary. Notably:
- No content-level scanning (only URL reputation) -- as specified
- No tenant appeal/unquarantine workflow -- explicitly out of scope
- No real-time threat feed -- correctly uses the Lookup API pattern
- Webhook support for `capture.quarantined` is a natural extension of the existing webhook system, not scope creep

## API Choice: Web Risk vs Safe Browsing

The prompt references "Google Safe Browsing" but the implementation uses Google Web Risk API. These are different products: Web Risk is the enterprise/commercial API; Safe Browsing v4 is the consumer-oriented API with stricter ToS around commercial use. Using Web Risk for a commercial product is the correct choice. This is not drift -- it is a sound technical decision that should be documented in `decisions.md`.
