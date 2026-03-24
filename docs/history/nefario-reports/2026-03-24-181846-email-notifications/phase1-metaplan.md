# Meta-Plan: R36 Email Notifications (Operational + Billing)

## Context Summary

WRL is a Cloudflare Workers application (D1 + R2 + KV + Queues) that captures web pages as evidence-grade archives. The system already has per-tenant identity via GitHub OAuth (Phase 0055), Stripe billing (Phase 0058), scheduled captures (Phase 0059), and outbound webhooks with queue-based dispatch (Phase 0054). Email notifications add a new delivery channel alongside the existing webhook system.

### Key Codebase Findings

1. **No email field on tenants**: The current schema stores `github_id` and `github_login` in `github_users` but does NOT fetch or store email addresses during OAuth. The notification preferences API (`GET/PUT /v1/tenant/notifications`) will need a new D1 table and the OAuth flow may need to request the `user:email` scope from GitHub to seed the email address.

2. **No threshold events exist**: `quotas.js` only blocks at 100% (`payment_required`). There is no event emission at 80% or 100% -- these threshold checks need to be added to the capture pipeline.

3. **Existing dispatch pattern**: The webhook dispatch system (`webhook-dispatch.js`) provides a proven pattern: build payload, enqueue to Cloudflare Queue, deliver via queue consumer with retry. Email notifications can follow this same architecture.

4. **Trigger points are well-defined**: Capture failures dispatch at `index.js:247` and `index.js:290`. Billing events dispatch at `billing.js` (Stripe webhook handler). Scheduled capture completion is in `scheduler.js`. These are the integration points for notification dispatch.

5. **No email sending infrastructure**: No Resend API client, no email templates, no queue for email delivery exist yet.

---

## Planning Consultations

### Consultation 1: Email Delivery Infrastructure on Cloudflare Workers
- **Agent**: iac-minion
- **Planning question**: What is the recommended architecture for email sending from a Cloudflare Worker? Specifically: (a) Resend vs Cloudflare Email Workers -- which integrates better with the existing queue-based dispatch pattern? (b) Should email delivery use the existing `WEBHOOK_QUEUE` or a dedicated email queue? (c) How should the Resend API key be provisioned (wrangler secret)? (d) What are the Resend free tier limits (100 emails/day) and how do they interact with the Cloudflare Workers execution model?
- **Context to provide**: `wrangler.toml` (existing queue architecture), `webhook-dispatch.js` (dispatch pattern), the fact that this is a single Cloudflare Worker with D1/R2/KV/Queues
- **Why this agent**: Infrastructure decisions (queue architecture, secret provisioning, service selection) are iac-minion's domain. The choice between Resend and Cloudflare Email Workers has deployment implications.

### Consultation 2: Notification Data Model and API Design
- **Agent**: api-design-minion
- **Planning question**: Design the notification preferences API surface. Specifically: (a) What should the `GET/PUT /v1/tenant/notifications` request/response shapes look like? (b) How should the notification_preferences D1 table be structured (separate table vs JSON column on tenants)? (c) How should the unsubscribe endpoint work -- signed token in URL vs session auth? (d) Should notification event types be an allowlist or denylist model? (e) How does the email address relate to the GitHub OAuth identity -- should it auto-populate from GitHub or require explicit entry?
- **Context to provide**: `account.js` (existing account API patterns), `migrations/0004_github_oauth.sql` (current schema), `migrations/0001_initial_schema.sql` (tenants table), `openapi.yaml`
- **Why this agent**: API contract design (endpoint shape, response format, error handling) and data model decisions need api-design-minion's expertise. The preferences table schema will be consumed by multiple notification triggers.

### Consultation 3: Notification Trigger Integration Points
- **Agent**: api-design-minion (supporting: iac-minion)
- **Planning question**: How should each of the six notification types integrate with existing code paths? Specifically: (a) Capture failure -- hook into the existing `dispatchWebhooks` call sites in `index.js` or add a parallel `dispatchNotifications` call? (b) Free limit approaching (80%) and reached (100%) -- where in `quotas.js`/`index.js` should threshold checks fire, and how to avoid duplicate notifications within the same billing period? (c) Invoice generated and payment failed -- extend `billing.js` `dispatchWebhookEvent` switch cases or add notification dispatch alongside? (d) Weekly schedule digest -- new cron trigger or piggyback on the existing `*/1 * * * *` tick with a weekly check?
- **Context to provide**: `index.js` (queue consumer, capture complete/fail paths), `quotas.js` (checkQuota), `billing.js` (Stripe webhook handler, dispatchWebhookEvent), `scheduler.js` (handleScheduledTick), `webhook-dispatch.js` (existing dispatch pattern)
- **Why this agent**: The trigger integration points are API design decisions -- where events originate, how they flow, and how they avoid duplication.

### Consultation 4: Email Template Architecture
- **Agent**: frontend-minion
- **Planning question**: What is the right approach for HTML email templates in a Cloudflare Worker context (no filesystem, no template engine)? Specifically: (a) Template strings in JS modules vs pre-compiled HTML? (b) How to structure templates for 6 notification types with shared header/footer while keeping inline CSS for email client compatibility? (c) How to generate both HTML and plain text versions from the same data? (d) Should templates use the existing WRL design system (`design-system.css`) or standalone inline styles? (e) How to include the unsubscribe link (RFC 8058 List-Unsubscribe-Post header) in every email?
- **Context to provide**: `src/design-system.css`, `src/verify-page.js` (existing HTML template pattern), the constraint that this runs on Workers (no filesystem access)
- **Why this agent**: frontend-minion handles HTML/CSS template design, including email client compatibility constraints. The template architecture choice (template literals vs template engine) affects maintainability.

### Consultation 5: Security Review of Email Notification System
- **Agent**: security-minion
- **Planning question**: What are the security considerations for the email notification system? Specifically: (a) How should the unsubscribe link be secured to prevent enumeration/abuse (signed token vs session auth vs HMAC-signed URL)? (b) What PII risks does storing email addresses introduce, and what GDPR implications exist? (c) How to prevent email injection (header injection, BCC injection) in the Resend API integration? (d) Rate limiting on notification dispatch to prevent email flooding on rapid capture failures? (e) Should notification emails include capture URLs (potential information leakage to email providers)?
- **Context to provide**: The fact that email addresses are PII, `webhook-signing.js` (existing HMAC pattern that could be reused for unsubscribe tokens), GDPR/CAN-SPAM requirements from the task spec
- **Why this agent**: Email introduces new attack surface (PII storage, injection vectors, enumeration via unsubscribe). Security-minion must review before the plan is finalized.

---

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The notification system spans multiple integration points (quota checks, billing webhooks, scheduled captures). test-minion should advise on: (a) how to test email sending without actually sending (Resend test mode?), (b) integration test strategy for threshold notification dedup, (c) whether the existing test patterns (`vitest.config.js`, `vitest.integration.config.js`) need adaptation.

- **Security**: Include security-minion for planning (Consultation 5 above). Email addresses are PII. The unsubscribe mechanism creates a new unauthenticated endpoint. GDPR compliance (opt-in, right to erasure) applies.

- **Usability -- Strategy**: ALWAYS include. Planning question for ux-strategy-minion: (a) What is the right default opt-in state for each notification type -- should tenants be opted in to all by default or require explicit opt-in for GDPR? (b) How should the notification preferences UX flow work -- settings page in the web UI vs first-time prompt? (c) Is there a risk of notification fatigue with 6 event types, and should some be bundled or suppressed? (d) How should the weekly digest be timed relative to the billing period?

- **Usability -- Design**: Include ux-design-minion for planning. The email templates are a user-facing interface. Questions: (a) Brand consistency between email templates and the existing landing page / docs site design system. (b) Visual hierarchy for different notification types (alert vs informational). (c) Mobile responsiveness of HTML email templates.

- **Documentation**: ALWAYS include. Planning question for software-docs-minion: (a) Which existing docs need updating (OpenAPI spec, README, docs site)? (b) Should a new "Notifications" guide page be added to the docs site? (c) How should the notification preferences API be documented in the OpenAPI spec? For user-docs-minion: (a) Do end users need a guide on configuring notifications? (b) Should email templates include a link to documentation?

- **Observability**: Include observability-minion for planning. The notification system is a new runtime component with failure modes (Resend API errors, email bounces, delivery failures). Questions: (a) What Coralogix log events should be emitted (send success, send failure, bounce, unsubscribe)? (b) Should there be a Coralogix alert for email delivery failure rates? (c) How should email delivery metrics integrate with the existing `log()` structured logging pattern?

---

## Notable Exclusions

- **data-minion**: The data model is straightforward (one new table for notification preferences, possibly an email column on github_users). api-design-minion covers the schema design adequately. data-minion's deep database architecture expertise is not needed for a single-table addition to an existing D1 schema.

- **oauth-minion**: While the GitHub OAuth flow might need a scope change to fetch email addresses, this is a minor configuration change (`user:email` scope) rather than a protocol design question. The existing OAuth implementation in `oauth.js` handles scope configuration.

- **edge-minion**: Email delivery is an outbound API call, not a CDN/caching/load-balancing concern. No edge worker configuration needed.

---

## Anticipated Approval Gates

1. **Notification data model and API contract** (MUST gate): The notification preferences table schema and API shape (`GET/PUT /v1/tenant/notifications`, unsubscribe endpoint) are hard to reverse once downstream code depends on them. Multiple tasks will build on this contract -- email templates, trigger integration, API handler implementation.

2. **Email delivery infrastructure choice** (MUST gate): Resend vs Cloudflare Email Workers and queue architecture (dedicated queue vs shared) are infrastructure decisions that affect deployment, secret provisioning, and cost. Hard to change once wired in.

3. **Threshold notification dedup strategy** (OPTIONAL gate): How the 80% and 100% free-limit notifications avoid duplicate sends within a billing period. The approach (D1 watermark vs KV flag vs idempotency key) affects multiple integration points but is reversible.

---

## Rationale

This task spans five distinct domains: infrastructure (email delivery service, queue architecture), API design (preferences endpoint, data model), frontend (HTML email templates), security (PII handling, unsubscribe mechanism, GDPR), and integration (six trigger points across four existing modules). No single specialist can plan all five competently.

The strongest planning value comes from:
- **iac-minion**: Resend vs Cloudflare Email Workers decision needs infrastructure expertise
- **api-design-minion**: Preferences API and data model shape everything downstream
- **security-minion**: Email introduces PII + new unauthenticated surface
- **frontend-minion**: Email template architecture on Workers is non-trivial (no filesystem, inline CSS constraints)
- **ux-strategy-minion**: Opt-in defaults, notification fatigue, and user journey design

The cross-cutting agents (test-minion, observability-minion, software-docs-minion, ux-design-minion) add focused planning questions but their primary contribution is at the execution/review level.

---

## Scope

**In scope**: Email sending infrastructure (Resend or CF Email Workers), notification preferences API (CRUD + unsubscribe), six notification types (capture failure, approaching free limit, free limit reached, invoice generated, payment failure, weekly schedule digest), HTML + plain text templates for each type, D1 schema for preferences, integration with existing capture/billing/scheduling pipelines, RFC 8058 unsubscribe headers, GDPR/CAN-SPAM compliance.

**Out of scope**: SMS/push notifications, real-time in-app notifications, email analytics/tracking pixels, custom notification rules, digest frequency configuration beyond weekly, notification history/log API, email template editor UI, bulk email campaigns.

---

## External Skill Integration

No external skills detected in project. No `.claude/skills/` or `.skills/` directories exist in the working directory.
