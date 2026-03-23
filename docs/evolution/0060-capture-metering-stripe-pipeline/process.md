# Process: R31 Capture Metering to Stripe Pipeline

## TL;DR

4 planning specialists, 7 architecture reviewers, 3 execution agents. Three
synthesis conflicts resolved (storage model, free-tier handling, idempotency
format). All code passed tests on first run. 1125 tests pass, zero regressions.
Phase 5 code review found one dead export (`computeBillableDelta`) across all 3
reviewers — accepted as harmless. 811 lines added across 9 files. PR #154.

## Planning: Who Was Consulted and Why

The meta-plan selected 4 specialists:
- **data-minion** — D1 schema design and pricing model implementation
- **iac-minion** — Cloudflare cron integration and Stripe API wiring
- **api-design-minion** — Dashboard billing response shape
- **test-minion** — Coverage strategy and mock patterns

Not consulted: frontend-minion (no UI changes), security-minion (reserved for
review), observability-minion (reserved for review).

## Where Specialists Disagreed

### Storage model (data-minion vs iac-minion)
data-minion proposed adding columns to the existing `usage_counters` table.
iac-minion proposed a separate `meter_reporting_log` table with foreign key
to usage_counters. Synthesis chose data-minion's approach: same composite PK
means no JOIN, no consistency boundary, and D1/SQLite serializes writes anyway
so contention is moot.

### Free-tier handling (iac-minion vs test-minion)
iac-minion wanted to deduct the first 200 captures before reporting to Stripe.
test-minion (and the synthesis) argued for reporting ALL captures to Stripe and
letting graduated pricing handle the free tier at EUR 0.00. This puts pricing
truth in one place (Stripe Dashboard) and simplifies reconciliation to a single
equality check. The issue spec technically says "first 200 not reported as
billable" but the economic outcome is identical.

### Idempotency key format (iac-minion vs data-minion)
iac-minion proposed time-windowed keys: `wrl:{tenantId}:{period}:{hour}:{from}-{to}`.
data-minion proposed state-derived keys: `{tenantId}:{period}:{captureCount}`.
Synthesis chose state-derived (with `wrl-meter:` prefix per security review):
deterministic across retry windows, human-readable in Stripe Dashboard, no
timestamp dependency.

## Architecture Review Findings

7 reviewers, all ADVISE (no BLOCK):

- **security-minion**: Prefix idempotency keys to avoid collision with other
  Stripe integrations. Incorporated.
- **test-minion**: Stripe returns 200 for duplicate meter events (not 409).
  This was a gap in the original spec. Incorporated — test updated.
- **ux-strategy-minion**: `projectedCharges` and `currentProgress` add schema
  noise for a feature that doesn't exist yet. Drop both. Incorporated.
- **margo**: Month-boundary handling can be simplified from time-based
  conditionals to a two-period IN clause. Incorporated — cleaner SQL.
- **observability-minion**: Failure logs should include HTTP status and Stripe
  error type for triage. Incorporated.
- **lucy**: Invoice threshold enforcement is Stripe Dashboard config, not
  application code. Document this, don't code it. Incorporated as comment.
- **gru**: Confirmed Stripe meter event dedup returns 200 (corroborates
  test-minion). No additional changes.

## Execution: What Happened

Three tasks executed sequentially, each building on the prior:

**Task 1 (data-minion)**: pricing.js + migration 0008 + 16 pricing tests.
Straightforward. No surprises. Tests passed first run.

**Task 2 (api-design-minion)**: Added billing sub-object to account/usage
endpoint. 6 new tests covering free tier, paid tiers, threshold status.
The agent correctly handled billing for ALL tenants (not just paid). Tests
passed first run.

**Task 3 (iac-minion)**: meter-reporter.js + cron wiring + 10 tests. The
most complex task: queries two periods, handles per-tenant errors independently,
logs with proper severity levels. The agent correctly used `ctx.waitUntil()`
for the cron hook (non-blocking) and snapshot-based watermark updates. Tests
passed first run.

## Code Review: What Was Found

All 3 Phase 5 reviewers returned ADVISE (no BLOCK). The unanimous finding:
`computeBillableDelta()` in pricing.js is exported and tested but never
imported by production code — meter-reporter.js computes the delta inline.

Decision: accepted as-is. The function serves as a documented contract for how
the delta is calculated. It costs nothing at runtime (tree-shakeable) and its
test validates the math. If a future module needs the delta function, it exists.

Other minor findings:
- Previous-period test coverage gap (meter-reporting tests don't exercise
  month-boundary scenarios with Stripe calls) — noted for future hardening
- `calculateCharges(0)` returns `{ amount: 0, currentTier: tier_0 }` which
  is technically "capture 0 is in tier_0" — the sentinel is fine

## Human Interventions

This was an autonomous orchestration (no human in the loop). Lucy agent made
all gate decisions. No adjustments were made at any gate — the plan was
approved as-is at all checkpoints.

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/2026-03-23-155423-capture-metering-stripe-pipeline/phase2-*.md`
- Architecture review verdicts: `docs/history/nefario-reports/2026-03-23-155423-capture-metering-stripe-pipeline/phase3.5-*.md`
- Code review findings: `docs/history/nefario-reports/2026-03-23-155423-capture-metering-stripe-pipeline/phase5-*.md`
- Synthesis (execution plan): `docs/history/nefario-reports/2026-03-23-155423-capture-metering-stripe-pipeline/phase3-synthesis.md`
- Decisions log: `docs/evolution/0060-capture-metering-stripe-pipeline/decisions.md`
