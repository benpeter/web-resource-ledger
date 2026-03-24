# Process: Email Notifications (R36)

## TL;DR

Five specialist agents built a complete email notification system in one session: 6 notification types, Resend delivery via Cloudflare Queue, RFC 8058 unsubscribe, notification preferences API + UI tab, and GitHub OAuth email auto-population. Phase 5 code review caught three data-shape bugs (UI key mismatch, billing template field mismatch, missing portalUrl) that were fixed in a single round. 1430 tests pass. 4 Cloudflare Queues provisioned. Total: ~4600 lines added across 18 new files and 10 modified files.

## Phase 1: Meta-Plan

Nefario analyzed issue #111 and identified 5 specialists for planning:
- **api-design-minion**: notification preferences API, trigger integration, dispatch pipeline
- **frontend-minion**: Notifications UI tab
- **observability-minion**: email delivery alerts, PII logging guard
- **security-minion**: unsubscribe token security, HMAC design
- **data-minion**: D1 schema for preferences and dedup

Notable exclusions: test-minion (covered by mandatory Phase 3.5 review), ux-design-minion (simple toggles pattern, no custom design needed).

## Phase 2: Specialist Planning

All 5 specialists contributed domain plans.

**Key agreements across specialists:**
- Column-per-notification-type D1 schema (not JSON blob) — data-minion and api-design-minion aligned independently
- Queue-based dispatch following existing webhook pattern — api-design-minion
- HMAC unsubscribe tokens reusing SESSION_SECRET with domain prefix — security-minion
- Opt-out model with email verification gate — api-design-minion and security-minion

**Where specialists pushed back on the issue spec:**
- The issue spec said 80/100 and 100/100 for free limit thresholds, but the codebase uses FREE_CAPTURE_LIMIT=200. api-design-minion flagged this and the plan used codebase values (160/200).
- security-minion initially suggested a dedicated UNSUB_SECRET, but agreed SESSION_SECRET with domain prefix was sufficient.

## Phase 3: Synthesis

Nefario consolidated into 5 execution tasks:
1. D1 schema + API handlers + unsubscribe (api-design-minion)
2. Email templates + dispatch pipeline + queue config (frontend-minion)
3. Wire notification triggers into capture/billing paths (api-design-minion)
4. Notifications UI tab (frontend-minion)
5. Observability — alerts + PII guard (observability-minion)

One approval gate after Task 1 (DB schema shapes downstream work).

## Phase 3.5: Architecture Review

8 reviewers (5 mandatory + 3 discretionary):
- **security-minion**: APPROVE
- **test-minion**: ADVISE — recommended testing dedup behavior and RFC 8058 headers
- **ux-strategy-minion**: ADVISE — flagged potential for KV cooldown over-engineering
- **lucy**: ADVISE — flagged KV cooldown complexity, suggested dropping it
- **margo**: ADVISE — flagged KV cooldown as YAGNI, recommended notification_sent table dedup instead
- **observability-minion**: APPROVE
- **accessibility-minion**: ADVISE — recommended ARIA attributes on toggle UI
- **user-docs-minion**: APPROVE

**Conflict resolution**: Three reviewers (lucy, margo, ux-strategy) independently flagged KV-based per-tenant cooldown as over-engineering. The plan was revised to use only notification_sent table dedup with YYYY-MM period format. This was the right call — simpler, consistent, and sufficient at current scale.

## Phase 4: Execution

5 tasks executed in two batches:
- **Batch 1**: Task 1 (schema + API + unsubscribe, api-design-minion) — gate
- **Batch 2**: Tasks 2-5 in parallel after gate approval

All tasks completed successfully. 7 git commits produced.

**Notable execution decisions:**
- Task 1 chose two-step INSERT OR IGNORE + UPDATE for UPSERT because SQLite's ON CONFLICT DO UPDATE loses partial-update semantics.
- Task 2 used direct fetch() to Resend API (no SDK) per CLAUDE.md's "prefer lightweight" principle.
- Task 3 discovered the notification_sent CHECK constraint only allows YYYY-MM period format, so hourly dedup was dropped entirely.
- Task 4 followed the exact patterns from ui-billing.js and ui-settings.js for consistency.

## Phase 5: Code Review

Three reviewers (code-review-minion, lucy, margo) all returned BLOCK.

**BLOCK findings (all three found the same issues):**
1. **UI key mismatch**: ui-notifications.js read `data.preferences` (should be `data.notifications`), used camelCase keys (`captureFailures`) while API returns snake_case (`capture_failure`), and sent toggle payload at top level instead of wrapped in `{ notifications: {...} }`.
2. **billing.js invoice data mismatch**: invoice_generated dispatch passed `{ amountDue, currency, invoiceUrl }` but the template expects `{ amountFormatted, currency, period, portalUrl }`.
3. **payment_failure missing portalUrl**: Template expects `{ gracePeriodEnd, portalUrl }` but dispatch only passed `{ gracePeriodEnd }`.

All three were legitimate bugs that would have caused runtime failures. They were introduced by different execution agents (frontend-minion for #1, api-design-minion for #2-3) working from task prompts that didn't include the exact API response shape.

**Fixes applied:**
- UI: `data.preferences` → `data.notifications`, all keys to snake_case, toggle payload wrapped
- billing: `amountDue` → `amountFormatted` (formatted from cents), added `period` from invoice.period_start, `invoiceUrl` → `portalUrl`
- billing: added `portalUrl` to payment_failure dispatch
- Tests updated to match

**Round 2 re-review**: All three reviewers returned APPROVE.

## Phase 6: Test Execution

1430 tests pass, 2 skipped (pre-existing), 0 failures. 202 new tests across 5 test files specifically for notifications.

## Human Interventions

This was an autonomous session (no human at the keyboard). Gate decisions were made by Lucy agents:
- Team approval: approved as proposed
- Reviewer approval: approved with discretionary reviewers (observability, accessibility, user-docs)
- Execution plan approval: approved
- Task 1 gate: approved
- Post-execution: run all
- PR creation: approved

## Where to Read More

- Full specialist discussions: `docs/history/nefario-reports/` (companion directory)
- Phase 3 synthesis (execution plan): scratch files in companion directory
- Phase 5 code review findings: scratch files in companion directory
- Decisions and rationale: `docs/evolution/0072-email-notifications/decisions.md`
- What was produced: `docs/evolution/0072-email-notifications/outcome.md`
