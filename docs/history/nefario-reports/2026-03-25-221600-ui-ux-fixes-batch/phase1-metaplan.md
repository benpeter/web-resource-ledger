# Meta-Plan: UI/UX Fixes Batch

## Task Summary

Four small fixes bundled into one phase: (1) fix low-contrast Sign In button, (2) fix duplicate billing status display, (3) add docs link to authenticated nav, (4) add operator notification on API key creation. Items 1-3 are pure frontend (CSS/JS in `src/ui/`). Item 4 is backend (add a fire-and-forget notification in `src/admin.js`).

## Planning Consultations

### Consultation 1: Contrast Fix and Design System Impact

- **Agent**: frontend-minion
- **Planning question**: The `.btn--github` Sign In button uses `background: var(--color-primary)` (#2a3444 dark blue-gray) with `color: var(--color-primary-text)` (#f8f8fa near-white). The contrast ratio is approximately 10.5:1 which easily passes WCAG AA. However, issue #211 reports low contrast. Should we investigate whether the issue is about a different button state (e.g., the ghost-style "Connect" button `btn--ghost` which uses `color: var(--color-primary)` on a white/light background), or could this be about the GitHub button specifically? What is the correct fix approach -- adjust the design token, override the specific class, or add a new variant?
- **Context to provide**: `src/ui/ui-css.js` lines 452-464 (`.btn--github` styles), `src/design-system.js` lines 15-21 (color tokens), `src/ui/ui-login.js` (login screen DOM construction)
- **Why this agent**: Frontend-minion understands CSS design systems and can identify the actual contrast failure point, ensuring the fix uses tokens correctly without breaking other components.

### Consultation 2: Billing Status Duplication Root Cause

- **Agent**: frontend-minion
- **Planning question**: In `src/ui/ui-billing.js`, `buildRefreshRow()` (line 766) renders `'Status: ' + billingStatusLabel(usageData.billingStatus)` as a persistent text element. Meanwhile, `buildPaymentSection()` renders status-specific UI: a "Payment method active" badge for `status === 'active'`, setup prompts for `status === 'free'`, etc. When `billingStatus` is `'active'` with a payment method, the user sees both "Status: Active" (from the refresh row) AND "Payment method active" badge (from the payment section). The fix should remove the explicit status text from the refresh row since the payment section already communicates status through its UI. Is removing `leftEl` from `buildRefreshRow()` the right approach, or should we keep a status indicator somewhere for screen reader accessibility?
- **Context to provide**: `src/ui/ui-billing.js` -- specifically `buildRefreshRow()` and `buildPaymentSection()`
- **Why this agent**: Frontend-minion can evaluate how to remove the redundancy without losing accessibility signals (the `aria-live` region, the status banner for grace_period/blocked states).

### Consultation 3: Notification Strategy for Admin Key Creation

- **Agent**: frontend-minion
- **Planning question**: Item 4 asks for operator notification when admin API keys are created. The existing `email-dispatch.js` infrastructure uses Resend via a queue (EMAIL_QUEUE). However, admin key creation is an infrastructure-level event, not a per-tenant notification -- the operator (system admin) should be notified, not the tenant. Should we: (a) use the existing email-dispatch queue with a hardcoded operator email from env, (b) fire a Coralogix log at severity 3 (INFO) with a distinctive event name that can trigger a Coralogix alert, or (c) both? The issue says "fire-and-forget" and "must not block key creation" -- the existing `ctx.waitUntil(log(...))` pattern already satisfies this for option (b). Which approach fits the project's existing patterns best?
- **Context to provide**: `src/admin.js` (the `handleAdminCreateKey` function and its existing logging), `src/email-dispatch.js` (existing email infrastructure), `src/log.js` (Coralogix logging)
- **Why this agent**: Frontend-minion is wrong for this -- this should go to the infrastructure/backend specialist. Reassigning below.

### Consultation 3 (revised): Notification Strategy for Admin Key Creation

- **Agent**: iac-minion
- **Planning question**: Item 4 asks for operator notification on admin API key creation. Two viable approaches: (a) enhance the existing `admin.key_create` Coralogix log event and create a Coralogix alert rule, or (b) send an email via the existing Resend/EMAIL_QUEUE pipeline to a hardcoded operator address from env. The `ctx.waitUntil(log(...))` pattern is already fire-and-forget. Which approach minimizes new code and operational complexity? Does Coralogix alerting via their API need new infrastructure, or is it configurable through the dashboard?
- **Context to provide**: `src/admin.js` handleAdminCreateKey, `src/email-dispatch.js`, `src/log.js`, wrangler.toml (for queue bindings)
- **Why this agent**: iac-minion understands the operational infrastructure (Coralogix, queues, Workers bindings) and can advise on the simplest path.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. Items 1-3 touch UI files that have corresponding test files (`test/ui-billing.test.js`, `test/ui-dashboard.test.js`). Item 4 touches `admin.js` which has `test/admin-keys.test.js`. Planning question: what test coverage is needed for these small fixes -- are the existing test patterns sufficient, or do new test cases need design?
- **Security**: Exclude security-minion from planning. Items 1-3 are cosmetic CSS/DOM changes with no new attack surface. Item 4 adds a notification but the admin endpoint already has auth (ADMIN_KEY), rate limiting, and input validation. The notification payload uses data already validated and logged. No new security surface.
- **Usability -- Strategy**: ALWAYS include. Planning question for ux-strategy-minion: For item 3 (docs link), where should the link go in the authenticated UI -- nav bar, footer, or settings page? The current nav has: Captures, Schedules, Billing, Notifications, Settings. Adding "Docs" as a nav link opens a new tab (external navigation) which breaks the SPA pattern. Is a nav-level link appropriate, or should it be in a help/info section? What about the API-key auth path (no session nav)?
- **Usability -- Design**: Exclude ux-design-minion from planning. These are small fixes within an existing design system, not new UI design. The contrast fix is a token adjustment. The docs link follows existing nav patterns.
- **Documentation**: Include software-docs-minion minimally. Planning question: do any of these fixes warrant a changelog entry or docs update? Item 3 adds a docs link -- should `docs.webresourceledger.com` content be updated to mention it's accessible from the app UI?
- **Observability**: Exclude observability-minion from planning. Item 4's notification is the only observability-adjacent concern, and the existing Coralogix logging already covers admin key events. The iac-minion consultation covers the operational notification question.

### Notable Exclusions

- **accessibility-minion**: Item 1 is a contrast fix (accessibility-adjacent), but the actual fix is a CSS token change. The planning question for ux-strategy-minion covers the contrast investigation. accessibility-minion would be relevant for architecture review (Phase 3.5) but not for planning this batch.
- **api-design-minion**: Item 4 adds a side-effect to an existing endpoint, not a new API surface. No API design decisions needed.
- **security-minion**: Items are cosmetic fixes plus a notification that uses already-validated data through existing authenticated endpoints. No new auth flows, user input handling, or attack surface.

### Anticipated Approval Gates

None. All four items are low blast radius, easy to reverse (CSS changes, DOM additions, a fire-and-forget notification). No schema changes, no API contract changes, no architectural decisions. The entire batch can proceed without mid-execution gates.

### Rationale

This is a batch of small, independent fixes. Three are pure frontend (CSS/DOM) and one is a backend enhancement to an existing admin endpoint. The primary planning need is frontend-minion for the UI items (contrast investigation, billing status fix, docs link placement) and iac-minion for the notification infrastructure question. ux-strategy-minion provides the user journey perspective on where the docs link belongs. test-minion confirms test strategy. The fixes are independent enough to parallelize in execution.

### Scope

**In scope**: Fix contrast on Sign In button, remove duplicate billing status display, add docs link to authenticated nav, add operator notification on key creation.

**Out of scope**: Redesigning the login page, restructuring billing UI, adding new notification types beyond admin key creation, changes to the docs site itself.

### External Skill Integration

#### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/` | LEAF | WRL operational procedures | Not relevant -- these are code changes, not operational tasks |

#### Precedence Decisions

No conflicts. The ops-runbook skill is for runtime operations (tenant management, deploys) and does not overlap with any specialist needed for this UI/UX fix batch.
