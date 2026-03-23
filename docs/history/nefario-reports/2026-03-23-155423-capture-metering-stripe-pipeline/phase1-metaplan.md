# Meta-Plan: Capture Metering to Stripe Pipeline

## Context Summary

WRL has a complete usage metering infrastructure (R25, Phase 0053) with D1 `usage_counters` tracking per-tenant capture counts, storage bytes, and API calls per calendar month. Stripe billing integration (R29, Phase 0058) established customer management, checkout, portal, webhooks, and billing lifecycle (active/grace_period/blocked). A `reportMeterEvent()` function exists in `src/stripe.js` but is **not yet called from the capture pipeline**. The backlog explicitly tracks this: "[should] Wire Stripe meter event reporting into capture pipeline."

The task is to bridge these two systems: feed D1 usage counters into Stripe's meter, build a consumption dashboard with tiered pricing visibility, enforce the invoice threshold, and ensure idempotent/reconcilable reporting.

### Key architectural facts

- **Post-capture success path** (`src/index.js:201-217`): After `performCapture()` succeeds, `incrementUsage()` fires via `ctx.waitUntil()`. This is where Stripe meter events should be wired -- same deferred path, not the hot path.
- **Cron trigger** (`src/scheduler.js`): Fires every minute for scheduled captures. Could also run hourly batch reporting.
- **Stripe API version**: `2025-04-30.basil`, meter events via `POST /v1/billing/meter_events`.
- **Free tier**: First 200 captures/month free (quotas.js:9). Paid tenants have `payment_method_added_at` set.
- **D1 usage_counters schema**: `(tenant_id, period, capture_count, storage_bytes, api_call_count)` with UPSERT.
- **Existing dashboard**: `GET /v1/account/usage` returns captures used/limit/remaining, storage, billing status. Needs enhancement with pricing tier info and threshold progress.
- **wrangler.toml**: Cron triggers already configured (`*/1 * * * *`). No hourly trigger yet.

## Planning Consultations

### Consultation 1: Stripe Meter Event Reporting Architecture
- **Agent**: iac-minion
- **Planning question**: What is the best mechanism for hourly batch reporting of D1 usage counters to Stripe's meter events API within the Cloudflare Workers constraints? Options include: (a) a second cron trigger at hourly frequency, (b) piggybacking on the existing per-minute cron with modular hour detection, (c) per-capture real-time reporting via ctx.waitUntil in the queue consumer. Consider: idempotency key generation strategy (must prevent double-billing across Worker restarts), retry/failure handling for Stripe API calls, and whether a new KV or D1 table is needed to track last-reported counts. The existing cron trigger fires every minute for scheduled captures -- can we share the trigger or need a separate one?
- **Context to provide**: `wrangler.toml` (cron triggers, queue config), `src/index.js:201-217` (post-capture waitUntil), `src/scheduler.js` (existing cron handler), `src/stripe.js` (reportMeterEvent function), `src/db.js` (incrementUsage, getUsage)
- **Why this agent**: Infrastructure binding expertise for Cloudflare Workers cron triggers, queue architecture, and D1/KV coordination patterns.

### Consultation 2: Idempotent Usage Reporting and Reconciliation Data Model
- **Agent**: data-minion
- **Planning question**: What data model additions are needed to support idempotent Stripe meter event reporting with reconciliation? Key design decisions: (1) Should we track "last reported capture count" per tenant per period in a new D1 table or column, or use a KV marker? (2) How should idempotency keys be structured -- `{tenantId}:{period}:{captureCount}` or `{tenantId}:{period}:{reportTimestamp}`? (3) What reconciliation query would compare D1 usage_counters.capture_count against Stripe's reported total? (4) The free tier (first 200 captures) must be subtracted before reporting -- should this be computed at reporting time or tracked separately? Consider the constraint that D1 UPSERT must remain atomic for counter increments.
- **Context to provide**: `migrations/0002_usage_counters.sql` (schema), `src/db.js:748-801` (incrementUsage, getUsage), `src/quotas.js` (FREE_CAPTURE_LIMIT = 200)
- **Why this agent**: Database schema design and data integrity patterns for billing-critical reconciliation.

### Consultation 3: Dashboard Endpoint Design with Tiered Pricing
- **Agent**: api-design-minion
- **Planning question**: How should the existing `GET /v1/account/usage` response be extended (or should a new endpoint be created) to include: current charges based on volume discount tiers, applicable price tier indicator, invoice threshold progress (current charges vs threshold), and projected period-end charges? The tiered pricing is: free (1-200), EUR 0.05 (201-10k), EUR 0.035 (10k-100k), EUR 0.015 (100k+). Should tier calculation live in the Worker (derived from capture count) or be fetched from Stripe's upcoming invoice API? Consider: the existing endpoint returns `captures.used/limit/remaining` and `billingStatus` -- what fields to add vs restructure. Also consider whether charges should be computed server-side or left to the dashboard UI.
- **Context to provide**: `src/account.js:446-551` (handleAccountGetUsage), existing response shape, Stripe pricing configuration from CLAUDE.local.md
- **Why this agent**: API response design, backward compatibility, and pricing data exposure patterns.

### Consultation 4: Test Strategy for Billing Pipeline
- **Agent**: test-minion
- **Planning question**: What test strategy covers the billing pipeline without hitting Stripe's API? Key test boundaries: (1) Idempotent meter event reporting -- unit tests for the reporting function with mocked stripeRequest, verifying idempotency key generation and free-tier deduction. (2) Reconciliation logic -- unit tests comparing D1 counters against expected Stripe-reported totals. (3) Dashboard endpoint -- integration tests for the extended usage response including pricing tier calculations. (4) Cron-triggered batch reporting -- how to test the hourly reporting path given the existing vitest/miniflare setup? The existing test suite (1038 tests) uses miniflare with mocked D1 and KV bindings. Stripe tests mock `stripeRequest` at the function level.
- **Context to provide**: `test/stripe.test.js`, `test/billing.test.js`, `test/usage-counters.test.js`, `test/account-usage.test.js`, `vitest.config.js`
- **Why this agent**: Test strategy design, boundary identification, and integration with existing test infrastructure.

## Cross-Cutting Checklist

- **Testing**: INCLUDE -- test-minion consulted above. Billing pipeline is code-producing with financial implications; requires thorough test coverage for idempotency, free-tier deduction, reconciliation, and retry logic.
- **Security**: INCLUDE for planning -- Stripe API calls carry the secret key. Idempotency keys must be unpredictable to prevent injection. The dashboard endpoint exposes financial data. security-minion should review the plan for: API key handling in the reporting path, idempotency key security, and whether the charges endpoint requires additional auth hardening.
- **Usability -- Strategy**: ALWAYS include -- The consumption dashboard is a core tenant-facing feature. ux-strategy-minion should assess: Is the existing `GET /v1/account/usage` response adequate for a dashboard, or does the task warrant a dedicated billing dashboard endpoint? How should threshold progress be communicated (percentage, absolute, both)? What cognitive load does tiered pricing create?
- **Usability -- Design**: EXCLUDE from planning -- No new UI components are being built. The task specifies "dashboard endpoint (or web UI panel)" -- the data endpoint is primary. If a web UI panel is needed, it would extend the existing `src/ui/` vanilla JS UI, which ux-design-minion reviewed in Phase 0056 already. Include only if synthesis determines a UI panel is in scope.
- **Documentation**: ALWAYS include -- software-docs-minion should plan for: OpenAPI spec updates for the extended usage endpoint, architecture documentation for the metering-to-Stripe pipeline, and any new env vars or configuration.
- **Observability**: INCLUDE for planning -- The task explicitly requires "Failed usage report submissions retried and logged to Coralogix" and "reconciliation logging." observability-minion should assess: What log events are needed for the reporting pipeline (report_submitted, report_failed, reconciliation_mismatch), what alerting rules, and whether the existing Coralogix integration needs new alert definitions.

## Notable Exclusions

- **frontend-minion**: The task focuses on a data endpoint, not UI implementation. The existing web UI at `/ui` has a usage dashboard from Phase 0056 that reads `GET /v1/account/usage`. If the response shape changes, the UI update is minimal vanilla JS and can be handled by the executing agent without frontend-specific planning.
- **oauth-minion**: No new auth flows. Dashboard uses existing session auth. Stripe webhook endpoint uses existing signature verification.
- **edge-minion**: No CDN or edge caching changes. Usage data is private, no-store, served from origin.

## Anticipated Approval Gates

1. **Data model for idempotent reporting** (MUST gate) -- The D1 schema addition for tracking reported-vs-actual counts is hard to reverse once migrated and blocks all downstream tasks (reporting logic, reconciliation, dashboard). Multiple valid approaches exist (new table vs columns vs KV markers).

2. **Dashboard response shape** (MUST gate) -- The API contract for the extended usage endpoint affects both the web UI and any external consumers. Backward compatibility decisions gate the implementation.

## Rationale

This task bridges two existing systems (D1 metering and Stripe billing) that were deliberately decoupled during earlier phases. The primary complexity is in the **reporting mechanism** (how and when D1 counters feed Stripe) and the **data integrity guarantees** (idempotency, reconciliation, free-tier deduction). Four specialists cover these domains:

- **iac-minion**: Cloudflare Worker infrastructure (cron triggers, queue patterns) for the reporting mechanism
- **data-minion**: Schema design for the reconciliation/reporting state
- **api-design-minion**: Dashboard endpoint shape and pricing data exposure
- **test-minion**: Test strategy for billing-critical code paths

Cross-cutting agents (security, ux-strategy, observability, docs) provide review dimensions that are essential for a billing pipeline but don't need to drive the plan structure.

## Scope

**In scope**:
- Wire `reportMeterEvent()` into the capture pipeline (batch or per-event, to be determined)
- Idempotency key generation and deduplication
- Free-tier deduction (first 200 captures not reported as billable)
- Extended usage dashboard endpoint with pricing tier info and threshold progress
- Retry and failure logging for Stripe API calls
- Reconciliation logging (D1 vs Stripe within 1% tolerance)
- Hourly minimum reporting frequency

**Out of scope**:
- Storage or API call metering to Stripe (observability only, not billed)
- Real-time billing
- Custom invoice templates
- Credit system
- eIDAS timestamp metering (separate meter, future work)
- Stripe Dashboard configuration (threshold, tax) -- assumed pre-configured
- New web UI panels (data endpoint only; UI updates are minimal if needed)

## External Skill Integration

No external skills detected in project. Neither `.claude/skills/` nor `.skills/` directories exist in the working directory. User-global skills in `~/.claude/skills/` are all despicable-agents agents or unrelated utilities (calendar, transcribe, etc.).
