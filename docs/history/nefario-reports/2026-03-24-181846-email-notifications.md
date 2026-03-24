---
task: "Email notifications (operational + billing)"
date: 2026-03-24
source-issue: 111
status: complete
task-count: 5
gate-count: 1
agents: [api-design-minion, frontend-minion, observability-minion]
reviewers: [security-minion, test-minion, ux-strategy-minion, lucy, margo, observability-minion, accessibility-minion, user-docs-minion, code-review-minion]
mode: execution
---

## Summary

Built a complete transactional email notification system for WRL: 6 notification types (capture failure, approaching/reached free limit, invoice generated, payment failure, weekly schedule digest), Resend email delivery via Cloudflare Queue, RFC 8058 one-click unsubscribe, notification preferences API (GET/PUT), Notifications UI tab, and GitHub OAuth email auto-population. Phase 5 code review caught 3 data-shape bugs that were fixed in one round. 1430 tests pass (202 new). 4 Cloudflare Queues provisioned.

## Original Prompt

WRL sends transactional email notifications to tenants for key operational and billing events. Tenants receive timely alerts for capture failures, billing milestones, and schedule digests. Each tenant configures their notification preferences (email address, event types). All emails include an unsubscribe link and use clean, brand-consistent templates.

## Key Design Decisions

### D1: Resend over Cloudflare Email Workers
Cloudflare's email sending options are either private beta (Email Workers) or limited to pre-verified addresses (Email Routing send_email binding). Resend was the only viable transactional email provider -- simple REST API, one fetch() call, no npm dependency.

### D2: Queue-based dispatch
Followed existing webhook dispatch pattern (wrl-webhooks queue). Decouples send latency from request handling. Enables retry with backoff on 429/5xx.

### D3: Column-per-type schema over JSON blob
Individual D1 columns (notify_capture_failure, etc.) enable efficient fan-out queries with CHECK constraints. D1 has no native JSON query support.

### D4: HMAC unsubscribe tokens reusing SESSION_SECRET
Domain prefix (`unsub.`) prevents cross-use with session cookies. No new secret to provision. Stateless verification.

### D5: KV cooldown dropped in favor of notification_sent table dedup
Three reviewers independently flagged KV-based per-tenant cooldown as over-engineering. Simplified to monthly period dedup.

## Phases

### Phase 1-2: Planning
5 specialists consulted: api-design-minion (API, triggers, dispatch), frontend-minion (UI, templates), observability-minion (alerts, PII), security-minion (unsubscribe tokens), data-minion (D1 schema).

### Phase 3: Synthesis
5 execution tasks, 1 approval gate. KV cooldown dropped per reviewer feedback.

### Phase 3.5: Architecture Review
8 reviewers. All APPROVE or ADVISE. Key advisory: drop KV cooldown (lucy, margo, ux-strategy -- consensus).

### Phase 4: Execution
5 tasks in 2 batches. 7 commits. All completed successfully.

### Phase 5: Code Review
Round 1: 3 BLOCK findings (all 3 reviewers found same issues). UI key mismatch (camelCase vs snake_case, wrong data path), billing template field mismatch, missing portalUrl. All fixed.
Round 2: 3 APPROVE.

### Phase 6: Tests
1430 pass, 2 skipped, 0 failures. 202 new tests.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
8a assessment: evolution log, backlog, pricing docs updated. 8b: skipped (covered during execution).

## Agent Contributions

| Agent | Phase | Role |
|-------|-------|------|
| api-design-minion | planning, execution | API design, trigger integration, dispatch pipeline |
| frontend-minion | planning, execution | Email templates, UI tab |
| observability-minion | planning, execution, review | Coralogix alerts, PII guard |
| security-minion | planning, review | Unsubscribe token design |
| data-minion | planning | D1 schema design |
| test-minion | review | Test coverage advisory |
| ux-strategy-minion | review | KV cooldown over-engineering flag |
| lucy | review | Convention adherence, KV cooldown flag |
| margo | review | YAGNI enforcement, KV cooldown flag |
| accessibility-minion | review | ARIA attributes advisory |
| user-docs-minion | review | Documentation coverage |
| code-review-minion | review | Data-shape bug detection |

## Execution

### Task 1: Schema + API + Unsubscribe (api-design-minion)
- migrations/0014_notification_preferences.sql (44 lines)
- src/db.js (+226 lines): 6 DB functions, email validation
- src/notifications.js (303 lines): GET/PUT handlers
- src/unsubscribe.js (476 lines): HMAC tokens, confirmation page, one-click POST
- test/notifications.test.js (569 lines, 40 tests)

### Task 2: Templates + Dispatch + Queue (frontend-minion)
- src/email/email-tokens.js (53 lines): brand constants
- src/email/email-layout.js (117 lines): shared HTML layout
- 6 template files (~674 lines total)
- src/email-dispatch.js (464 lines): dispatch pipeline, queue consumer
- wrangler.toml (+37 lines): queue bindings, cron trigger
- test/email-dispatch.test.js (470 lines, 19 tests)
- test/email-templates.test.js (465 lines, 81 tests)

### Task 3: Notification Triggers (api-design-minion)
- src/index.js (+80 lines): capture failure, approaching/reached limit triggers
- src/billing.js (+60 lines): invoice_generated, payment_failure triggers
- src/oauth.js (+45 lines): user:email scope, email auto-population
- test/notification-triggers.test.js (~500 lines, 22 tests)

### Task 4: Notifications UI Tab (frontend-minion)
- src/ui/ui-notifications.js (492 lines): email section, toggle groups
- test/ui-notifications.test.js (269 lines, 40 tests)

### Task 5: Observability (observability-minion)
- src/log.js (+2 lines): email in NEVER LOG list
- scripts/provision-alerts.sh (+82 lines): 2 Coralogix alerts
- docs/operations/alerts.md (+46 lines): alert documentation

## Verification

Verification: 3 code review findings auto-fixed (round 2 all APPROVE), all 1430 tests pass.

## Infrastructure Provisioned

- `wrl-emails` queue (production)
- `wrl-emails-dlq` queue (production)
- `wrl-emails-staging` queue (staging)
- `wrl-emails-dlq-staging` queue (staging)
- RESEND_API_KEY: not yet provisioned (requires Resend account — tracked in backlog parking lot)

## Documentation Debt

- RESEND_API_KEY secret provisioning (staging + production) — tracked in backlog

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-24-181846-email-notifications/`

<details><summary>Session Resources</summary>

### Skills Invoked
- /nefario (this orchestration)

### Compaction Events
2 compaction events during session.

</details>
