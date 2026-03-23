# Phase 0061: Content Security Scanning -- Process

## TL;DR

Eight specialist agents planned content security scanning in parallel, a
synthesis resolved the Safe Browsing → Web Risk substitution and D1 schema
constraints, seven architecture reviewers approved with minor advisories,
and a single execution agent (security-minion) delivered all three tasks.
Code review caught 7 issues (all auto-fixed in one commit). 19 files
changed, +1632/-195 lines, 1141 tests passing, PR #155.

## Planning: who was consulted and why

Nefario's meta-plan selected 8 specialists -- unusually broad for a
single-domain feature, but content security touches API design (new
response codes), data layer (schema changes), infrastructure (cron
triggers), observability (alerts), and documentation.

**security-minion** was the obvious lead. Their first contribution flagged
the critical Safe Browsing v4 licensing issue: the ToS explicitly prohibits
commercial use, and WRL has Stripe billing. This redirected the entire
implementation from Safe Browsing to Web Risk before any code was written.
They also advocated strongly for one-way quarantine (no auto-un-quarantine)
to prevent oscillation attacks.

**data-minion** identified the D1 CHECK constraint limitation that shaped
the quarantine storage design. SQLite's ALTER TABLE cannot modify CHECK
constraints, so the existing `status IN ('pending','rendering','complete',
'failed')` constraint is immutable. data-minion proposed the `quarantined
INTEGER` flag column with API-layer status mapping -- a clean separation
that keeps the database schema honest while presenting `status:
"quarantined"` to API consumers.

**iac-minion** contributed the cron CPU budget insight: sub-hour crons on
Cloudflare Workers get only 30 seconds of CPU, while daily crons (>=1 hour
interval) get 15 minutes. This informed the decision to use a dedicated
daily cron trigger for re-scanning rather than piggybacking on the existing
per-minute schedule cron.

**observability-minion** designed the two-alert strategy: a P3 alert for
quarantine volume (>5 in 24h, indicating potential campaign targeting the
platform) and a P2 alert for API failures (>2 in 10min, indicating the
safety gate is non-functional). The rescan-context exclusion from the
pre-capture alert was their suggestion -- rescan failures don't block
user-facing operations.

**api-design-minion** settled the HTTP status code question: 451
(Unavailable For Legal Reasons, RFC 7725) for quarantined artifact access,
422 for pre-capture rejection. They also pushed for provider-agnostic
naming (`threatCheck` not `webRisk` or `safeBrowsing`) to decouple the
API contract from the specific provider.

**test-minion** requested the injectable lookup dependency pattern,
following the precedent from `src/url-validation.js`. This yielded 16 unit
tests with zero network calls.

**ux-strategy-minion** focused on error message clarity: the 422 rejection
must tell the caller what threat types were detected, and quarantined
capture metadata must remain accessible so callers know why access is
restricted.

**software-docs-minion** structured the runbooks and audit log taxonomy.

## Synthesis: where agents disagreed

The primary conflict was **fail-open vs fail-closed** on Web Risk API
degradation. security-minion initially leaned toward fail-closed (reject
captures when the API is unavailable). ux-strategy-minion and margo argued
that WRL is a capture tool, not a security gateway -- blocking all captures
because of a third-party API outage would be disproportionate. The
resolution was fail-open with daily re-scan as safety net, which security-
minion accepted given the re-scan mechanism.

A secondary disagreement was **serial vs parallel** rescan processing.
test-minion suggested Promise.allSettled with batching for throughput.
margo countered with YAGNI -- at current scale, serial processing completes
well within the 15-minute CPU budget, and parallel processing adds rate
limiting complexity for no practical benefit. Serial won.

No conflicts on the quarantine storage approach -- data-minion's flag
column design was universally accepted once the CHECK constraint limitation
was explained.

## Architecture review: 7 reviewers, 0 blocks

All seven reviewers (5 mandatory + 2 discretionary: observability-minion,
gru) returned APPROVE or ADVISE. Notable advisories:

- **margo** flagged YAGNI on parallel rescan (reinforcing the synthesis
  decision)
- **lucy** confirmed fail-open alignment with the project's Engineering
  Philosophy section in CLAUDE.md
- **observability-minion** refined alert thresholds based on expected
  traffic patterns
- **test-minion** validated the injectable dependency testing approach

## Execution: single agent, three tasks

All three execution tasks went to security-minion -- unusual for nefario
which typically distributes across specialists, but the domain was
cohesive enough that splitting would have created more integration overhead
than parallel speedup.

Task 1 (schema + API client) produced the migration, threat-check.js, and
tests. Task 2 (pipeline integration) wired threat checking into all
capture and retrieval endpoints. Task 3 (observability + docs) added
alerts, runbooks, and documentation updates.

No approval gates -- the plan was straightforward enough that gates would
have been rubber stamps.

## Code review: 7 findings, all fixed

Post-execution code review (code-review-minion, lucy, margo) found 7
issues, all severity ADVISE:

1. **Fail-closed documentation** -- alerts.md and the API failures runbook
   described the system as rejecting captures when the API is down, but the
   code is fail-open. Classic case of documentation written to spec rather
   than to implementation.

2. **Non-deterministic GROUP BY** -- `listCapturesNeedingThreatCheck`
   selected `tenant_id` without an aggregate in a GROUP BY query. SQLite
   permits this but returns an arbitrary row's value. Fixed with
   `MIN(tenant_id)`.

3. **Staging cron dispatch** -- the scheduled handler only matched the
   production cron expression (`0 3 * * *`), missing staging's `0 4 * * *`.

4. **Queue idempotency guard** -- the existing guard for re-queued captures
   checked `complete` and `failed` but not `quarantined`.

5. **Type mismatch in rescan** -- `quarantineCapturesByUrl` expects a
   string for the threat types parameter (D1 TEXT column), but an array
   was passed.

6. **Missing webhook payload fields** -- the minimal captureRecord built
   for webhook dispatch in rescan.js lacked `quarantineReason` and
   `quarantinedAt`.

7. **Missing webhook event branch** -- `buildWebhookPayload` in
   webhook-dispatch.js had no handler for `capture.quarantined`.

All 7 fixed in one commit. The staging cron bug (#3) would have been caught
by the first staging rescan attempt, but fixing it before merge is cleaner.

## Human intervention

This phase ran in autonomous mode (Lucy as gate proxy). No human
interventions during execution. The autonomous mode approved the team,
reviewers, and execution plan without modifications.

## Where to read more

- Full specialist contributions: `docs/history/nefario-reports/2026-03-23-170044-content-security-scanning/`
- Architecture review verdicts: `phase3.5-*.md` in companion directory
- Code review findings: `phase5-*.md` in companion directory
- Synthesis plan: `phase3-synthesis.md` in companion directory
- Key decisions with alternatives: `docs/evolution/0061-content-security-scanning/decisions.md`
