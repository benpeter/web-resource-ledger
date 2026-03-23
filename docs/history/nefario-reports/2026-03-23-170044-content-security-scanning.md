---
task: Content security scanning with Google Web Risk (Issue #109)
date: 2026-03-23
slug: content-security-scanning
mode: execution
source-issue: 109
task-count: 3
gate-count: 0
compaction-events: 1
---

## Summary

Implemented content security scanning for WRL: pre-capture URL screening against Google Web Risk API, daily re-scan of existing captures via Cron Trigger, and quarantine enforcement across all API endpoints. Malicious URLs are rejected with HTTP 422 before capture; previously captured URLs that become flagged are quarantined (metadata accessible, artifacts return 451). Fail-open design ensures captures proceed when the Web Risk API is unavailable, with daily re-scan as safety net. Two Coralogix alerts and operational runbooks provide monitoring. 19 files changed, +1632/-195 lines, 1141 tests passing.

## Original Prompt

GitHub Issue #109: R32: Content security scanning. WRL checks URLs against Google Safe Browsing before capture and periodically re-scans existing captures, preventing the platform from being used to archive or serve known-malicious content. Flagged captures are quarantined with metadata preserved but artifact access restricted.

## Key Design Decisions

1. **Google Web Risk over Safe Browsing v4** -- Safe Browsing v4 ToS prohibits commercial use; WRL has Stripe billing. Web Risk is the commercial equivalent with 100K free lookups/month.
2. **Quarantine via flag column** -- D1/SQLite CHECK constraints can't be ALTERed. Used `quarantined INTEGER` flag with API-layer status mapping in `rowToCapture()`.
3. **Fail-open on API degradation** -- Captures proceed with `threatCheck: "unavailable"`. Daily re-scan cron provides safety net for unscreened captures.
4. **Provider-agnostic naming** -- `threatCheck` in API, `threat-check.js` in code. Decouples public API from specific threat intelligence provider.
5. **HTTP 451 for quarantined artifacts** -- RFC 7725 status for content restricted for legal reasons. Metadata remains accessible via normal GET.
6. **Dedicated daily cron** -- Sub-hour crons get 30s CPU; daily cron gets 15min. Sufficient for 500-URL re-scan budget.
7. **Injectable lookup dependency** -- `checkUrl(url, env, { lookup })` pattern from url-validation.js. 16 tests with zero network calls.
8. **One-way quarantine** -- No auto-un-quarantine to prevent oscillation attacks.
9. **Serial rescan processing** -- 6000 req/min Web Risk rate limit; serial processing is sufficient at current scale. YAGNI on parallelization.

## Phases

### Phase 1: Meta-Plan
Identified 8 specialists for planning: security-minion, data-minion, iac-minion, observability-minion, api-design-minion, test-minion, ux-strategy-minion, software-docs-minion. Security-minion flagged the Safe Browsing commercial use restriction. iac-minion identified the cron CPU budget constraint.

### Phase 2: Specialist Planning
All 8 specialists contributed domain plans in parallel. Key consensus: Web Risk Lookup API, fail-open design, quarantine-as-flag for D1 compatibility, provider-agnostic naming. No additional agents recommended.

### Phase 3: Synthesis
Nefario synthesized into a 3-task execution plan with 0 approval gates. Resolved the Safe Browsing → Web Risk substitution, quarantine storage strategy, and cron timing. All tasks assigned to security-minion (primary domain).

### Phase 3.5: Architecture Review
7 reviewers (5 mandatory + 2 discretionary). All returned APPROVE or ADVISE (0 BLOCK). Notable advisories: margo flagged YAGNI on parallel rescan; test-minion requested injectable dependency pattern; observability-minion refined alert thresholds; lucy confirmed fail-open alignment with project philosophy.

### Phase 4: Execution
3 tasks executed sequentially:

| Task | Agent | Deliverable |
|------|-------|-------------|
| 1. Schema + API client | security-minion | migration, threat-check.js, tests (8 files) |
| 2. Pipeline integration | security-minion | index.js, rescan.js, db.js, webhook changes (7 files) |
| 3. Observability + docs | security-minion | alerts, runbooks, OpenAPI, README (8 files) |

### Phase 5: Code Review
3 reviewers (code-review-minion, lucy, margo). 0 BLOCK, 3 ADVISE verdicts. 7 findings total:
- Fail-closed documentation (alerts.md, runbook) -- should describe fail-open behavior
- Non-deterministic tenant_id in GROUP BY -- needs MIN() aggregate
- Staging rescan cron dispatch -- only matched production schedule
- Queue idempotency guard -- missing quarantined status
- Type mismatch in rescan quarantine -- array passed where string expected
- Missing webhook payload fields -- quarantineReason and quarantinedAt
- webhook-dispatch.js missing capture.quarantined branch

All 7 findings resolved in one fix commit.

### Phase 6: Test Execution
48 test files, 1141 passed, 0 failed, 2 skipped. All tests pass after fixes.

### Phase 8: Documentation
Phase 8a assessment: 0 MUST items remaining. All documentation updated during execution (OpenAPI, README, CONTRIBUTING, alerts, runbooks, audit log schema).

## Verification

Verification: code review passed (7 findings auto-fixed), all 1141 tests pass. Doc assessment: 0 items.

## Agent Contributions

### Planning (Phase 2)
- **security-minion**: Web Risk API selection, fail-open design, one-way quarantine, API key header placement
- **data-minion**: D1 CHECK constraint limitation, quarantine flag column design, partial index strategy
- **iac-minion**: Cron CPU budget (30s vs 15min), wrangler.toml cron syntax, env-specific scheduling
- **observability-minion**: Alert threshold calibration, rescan-context exclusion from pre-capture alert
- **api-design-minion**: HTTP 451 for quarantined artifacts, 422 for pre-capture rejection, provider-agnostic field naming
- **test-minion**: Injectable dependency pattern, zero-network-call testing strategy
- **ux-strategy-minion**: Quarantine metadata visibility, clear error messages for rejected URLs
- **software-docs-minion**: Runbook structure, audit log taxonomy, README content security section

### Review (Phase 3.5)
- **security-minion**: APPROVE
- **test-minion**: ADVISE -- injectable lookup pattern
- **ux-strategy-minion**: APPROVE
- **lucy**: ADVISE -- fail-open alignment with project philosophy
- **margo**: ADVISE -- YAGNI on parallel rescan, serial is sufficient
- **observability-minion**: ADVISE -- refined alert thresholds
- **gru**: APPROVE

## Decisions

1. Web Risk over Safe Browsing v4 (commercial license requirement)
2. Quarantine flag column (D1 CHECK constraint immutability)
3. Fail-open on API degradation (capture tool, not security gateway)
4. Provider-agnostic naming (future-proofing API contract)
5. HTTP 451 for quarantined artifacts (RFC 7725 compliance)
6. Dedicated daily cron (CPU budget constraint)
7. Serial rescan processing (YAGNI on parallelization)
8. One-way quarantine (oscillation attack prevention)
9. Injectable lookup dependency (testability pattern)

## Test Plan

- [x] 16 unit tests for threat-check.js (clean, malware, multi-threat, allowlist, errors, timeout, missing key, URL encoding, batch)
- [x] Pre-existing 1141 tests continue to pass
- [x] No integration test for Web Risk API (external dependency, covered by injectable stub)

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- primary orchestration skill

</details>

<details>
<summary>Compaction Events</summary>

1 compaction event during Phase 4 execution.

</details>

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-23-170044-content-security-scanning/`

23 files including: phase1-metaplan.md, phase2 specialist contributions (8), phase3-synthesis.md, phase3.5 review verdicts (7), phase5 code review findings (3), prompt.md.
