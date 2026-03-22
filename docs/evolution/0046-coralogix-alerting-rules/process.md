# Process: Coralogix Alerting Rules

## TL;DR

Three specialists planned, five reviewers approved, and the orchestrator
executed a five-task plan to provision four Coralogix alert rules. The central
conflict — ratio-based vs. absolute-count thresholds — was resolved in favor
of absolute counts after ux-strategy-minion's mathematical argument trumped
observability-minion's platform-conventional approach. The Coralogix Alerts
API v3 required significant trial-and-error due to undocumented schema
differences. All four alerts are live, idempotency verified, and documented
with runbooks.

## Phase 1: Meta-Plan

Nefario identified three specialists for planning:

- **observability-minion** — Coralogix platform expertise, alert type
  selection, API integration approach
- **software-docs-minion** — runbook template design, documentation structure,
  cross-referencing strategy
- **ux-strategy-minion** — operator experience, threshold calibration,
  false-positive risk assessment

## Phase 2: Specialist Planning

### observability-minion

Recommended ratio alerts (Coralogix's standard pattern) with `ignoreInfinity:
true` to handle zero-denominator cases. Proposed the Alerts API v3 REST
endpoint over Terraform, list-then-upsert idempotency via `[WRL]` name prefix,
and email connector created via UI. Flagged risks: Lucene query accuracy on
nested JSON, `ignoreInfinity` behavior, API key permissions.

### software-docs-minion

Designed a lean 5-section runbook template (~40-60 lines each): What fires
this / Check / Likely causes / Fix / False positive? Proposed cross-references
between alerts.md, OPERATIONS.md, and audit-log-schema.md. Flagged that
percentage thresholds on low volume could be problematic.

### ux-strategy-minion

**Strongly** recommended replacing all ratio-based alerts with absolute-count
alerts. The argument: "ratio alerts produce false positives at low traffic —
this is mathematical certainty with single-digit events in a window." Proposed
specific thresholds: >3 capture.fail/5min, >2 tsa_fail/10min, >10
auth_fail/hour, >2 5xx/5min. Distinguished `capture.fail` (terminal) from
`capture.stage.fail` (retryable). Warned that "one week of false positives
destroys operator trust."

## The Central Conflict: Ratios vs. Absolute Counts

This was the defining synthesis decision.

**observability-minion's position:** Ratio alerts are the standard Coralogix
pattern. `ignoreInfinity: true` handles the zero-denominator case. Platform
conventions exist for a reason.

**ux-strategy-minion's position:** `ignoreInfinity` only handles the
zero-denominator case. It does not handle the small-sample case: 1 failure
out of 2 requests is 50%, which fires a >10% threshold alert. This is
mathematically certain to happen during normal single-tenant operation.
"Alert fatigue is the existential risk."

**Resolution:** Absolute counts won. The issue spec says "no false-positive
alerts during normal single-tenant operation" — this requirement is
mathematically incompatible with ratio alerts at WRL's traffic volume. The
spec's percentage thresholds were reinterpreted as the intent (detect failure
trends) rather than the implementation (use ratio math).

## Phase 3.5: Architecture Review

Five mandatory reviewers (security-minion, test-minion, ux-strategy-minion,
lucy, margo) all approved. Key advisories incorporated:

- **security-minion:** `set +x` after sourcing secrets to prevent trace leakage
- **test-minion:** shellcheck must pass before gate; dry-run should emit
  jq-parseable JSON
- **margo:** Approved the single-script approach; no unnecessary abstractions

## Phase 4: Execution

### Task 1: API Validation

Discovered several undocumented v3 API behaviors through trial-and-error:
- Field name is `alertDefProperties` (not `alertProperties`)
- `evaluationWindow` field rejected as unknown
- `override` in rules is required (not optional as docs suggest)
- `minutes` and `notifyOn` must both be present in webhook config
- Connector/webhook management endpoints return 404 — inline email works
- Response array key is `alertDefs` (not `alerts`)

### Task 2: Provisioning Script (Gated)

Wrote `scripts/provision-alerts.sh` — a single self-contained bash script with
all four alert definitions as JSON heredocs. Lucy approved the gate after
verifying requirement traceability, CLAUDE.md compliance, and threshold
justifications.

### Task 3: Live Provisioning

First run created 3 of 4 alerts — Worker Errors failed because Coralogix
rejected `responseStatus:>=500` Lucene syntax. Fixed to `responseStatus:[500
TO *]` (standard Lucene range query). Second run: 3 UNCHANGED + 1 CREATE.
Third run: all 4 UNCHANGED. Idempotency confirmed.

### Task 4: Documentation

Created `docs/operations/alerts.md` with threshold rationale and four runbooks
in `docs/operations/runbooks/`. Added pointer to OPERATIONS.md monitoring
section.

### Task 5: Cross-References and Backlog

Marked R22 as done in backlog. Moved parking lot item to Done section.

## Human Interventions

This was an autonomous execution (no human at the keyboard). Lucy served as
the gate decision-maker. No manual overrides were needed.

## Where to Read More

- Specialist contributions: `docs/history/nefario-reports/` (companion files)
- Alert definitions: `docs/operations/alerts.md`
- Provisioning script: `scripts/provision-alerts.sh`
- Runbooks: `docs/operations/runbooks/`
- Backlog changes: `docs/backlog.md` (R22 entry)
