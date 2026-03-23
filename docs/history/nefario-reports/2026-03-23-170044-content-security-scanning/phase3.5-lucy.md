# Lucy Review: content-security-scanning Delegation Plan

**Verdict: ADVISE**

The plan is well-aligned with the issue #109 spec and codebase conventions. Six tasks map cleanly to the stated requirements with no significant scope creep. Three issues need correction before or during execution; none are blocking.

---

## Requirement Traceability

| Issue #109 Requirement | Plan Coverage | Status |
|------------------------|---------------|--------|
| Pre-capture URL check via Safe Browsing API | Task 2 (Web Risk client), Task 3 (integration) | COVERED (correctly upgraded to Web Risk for commercial use) |
| Flagged URLs rejected HTTP 422 with threat type | Task 3 lines 326-337 | COVERED |
| Background re-scan via Cron Trigger | Task 4 (rescan.js, daily cron) | COVERED |
| Quarantined captures: metadata accessible, artifact 451 | Task 3 (handler updates) | COVERED |
| `status: "quarantined"` + `quarantineReason` in metadata | Task 1 (DB), Task 3 (API mapping) | COVERED |
| Coralogix alert on quarantine threshold | Task 5 (>5 in 24h alert) | COVERED |
| Graceful degradation: `safeBrowsing: "unavailable"` | Task 2 (degraded result), Task 3 (threatCheck field) | COVERED (renamed to `threatCheck` -- acceptable, provider-agnostic) |
| API key stored as Worker secret | Task 6 (docs for `GOOGLE_WEB_RISK_API_KEY`) | COVERED |

No stated requirements are missing from the plan. No plan tasks lack traceability to a requirement.

---

## Findings

### 1. [CONVENTION] Severity inconsistency for `threatcheck.api_fail`

Task 3 prompt (line 339) emits `threatcheck.api_fail` at **severity 4** (warn). Task 5 event table (line 646) documents it as **severity 5** (error). The alert in Task 5 queries for this event. The implementing agents will produce conflicting code and docs.

**Fix**: Align on severity 4. The issue spec says "degrades gracefully" -- the system self-heals (capture proceeds). Severity 4 (warn) is correct for a degradation, not 5 (error). Update the event table in the Task 5 prompt from `5 (error)` to `4 (warn)`.

### 2. [COMPLIANCE] Silent `.catch(() => {})` in Task 3 violates "fail loudly" principle

Task 3 prompt line 354-355:
```javascript
ctx.waitUntil(
  setCaptureThreatCheck(env.DB, captureId, threat.degraded ? 'unavailable' : 'pass')
    .catch(() => {}) // non-critical
);
```

CLAUDE.md Engineering Philosophy: *"Silent `catch {}` blocks are forbidden. Every catch must either log the error or handle a specific, named error type."*

The existing codebase has no silent `.catch(() => {})` in `src/` proper (only in `vendor/` and `consent.js` browser-page interactions where exceptions are expected). This would be the first silent swallow in core application code.

**Fix**: Replace with `.catch(err => console.warn('wrl:threat_check_record_fail', captureId, err?.message))` -- following the exact pattern used in `scheduler.js` line 213 for non-critical `incrementUsage` failures.

### 3. [CONVENTION] `threatcheck.block` severity 5 is inconsistent with existing patterns

The plan logs `threatcheck.block` (pre-capture rejection of a flagged URL) at severity 5 (error). But this is expected, correct system behavior -- the system is *working as designed* by rejecting a malicious URL. In the existing codebase, severity 5 is reserved for actual errors (failures, broken state). A successful rejection is informational.

Comparisons: rate-limit rejections and quota rejections are NOT logged at severity 5 in the codebase. SSRF rejections (the closest analogue -- `ssrf.reject` in `url-validation.js`) would be the reference pattern.

**Fix**: Consider severity 4 (warn) for `threatcheck.block`. Security-relevant but not an error condition. The alert in Task 5 fires on `threatcheck.quarantine` (re-scan), not `.block`, so this change has no alert impact. However, if the team prefers severity 5 for security events as a policy decision, document the reasoning.

---

## Scope Assessment

**No scope creep detected.** The plan explicitly defers UI changes, auto-un-quarantine, tenant appeal workflow, and content-level scanning -- all correctly identified as out-of-scope per the issue spec. The YAGNI exclusions in each task's "What NOT to Do" are thorough.

The only additive element beyond the issue spec is the `threat_checks` audit table, which is justified: it provides the audit trail needed for false-positive investigation (mentioned in the issue spec's "quarantine" concept). This is proportional.

## CLAUDE.md Compliance

- **JavaScript, not TypeScript**: Correctly enforced in every task prompt.
- **YAGNI/KISS**: Enforced throughout -- no caching layer, no batch API, no cursor resume, no exponential backoff.
- **Fail loudly**: Violated by finding #2 above.
- **Helix Manifesto**: Correctly cited; fail-open rationale is sound.
- **Evolution log**: Not part of this delegation plan (covered by orchestrator wrap-up). Confirmed.
- **Existing patterns followed**: Migration naming (0009), `db.batch()`, injectable deps, `rowToCapture()` extension, `VALID_EVENTS` array, `problemResponse()` usage, `log()` signature -- all match established codebase conventions.

## Architecture Notes (not findings, informational)

- The hybrid DB approach (keep `status='complete'`, add `quarantined` flag, map at API layer) is a pragmatic solution to the CHECK constraint limitation. It adds a representation mismatch between DB and API, but the mapping is localized to response handlers. Acceptable complexity for the constraint.
- Web Risk over Safe Browsing is the correct call for commercial use. Good catch by the specialists.
- Daily cron with 500-URL cap is proportional to current scale.
