# Phase 0058: Outcome

## What was built

Stripe usage-based billing integration for WRL. Tenants get 200 free captures
per month; paid tenants have unlimited captures metered by Stripe.

### New files

- **src/stripe.js** -- Stripe API client: `stripeRequest()`, `flattenParams()`,
  and convenience wrappers for Checkout sessions, Portal sessions, customers,
  subscriptions, and meter events. Pinned API version. No npm dependencies.
- **src/stripe-webhook.js** -- Webhook signature verification (`verifyStripeSignature`),
  event dedup via KV (`isEventProcessed`, `markEventProcessed`). Timing-safe
  comparison for signature matching.
- **src/billing.js** -- Three endpoint handlers:
  - `POST /v1/billing/checkout` -- creates Stripe Checkout session (subscription
    mode with usage price). Auto-creates Stripe customer if needed.
  - `POST /v1/billing/portal` -- creates Stripe Customer Portal session.
  - `POST /v1/stripe/webhook` -- verifies Stripe signature, deduplicates events,
    dispatches to handlers for `checkout.session.completed`, `invoice.payment_failed`,
    `invoice.paid`, `customer.subscription.deleted`.
- **migrations/0006_billing.sql** -- Adds `stripe_customer_id`, `billing_status`,
  `grace_period_end`, `payment_method_added_at` columns to `tenants` table.
  Partial index on non-active billing statuses.

### Modified files

- **src/db.js** -- New billing functions: `setStripeCustomerId`,
  `setBillingStatus`, `setPaymentMethodAdded`, `getTenantBilling`,
  `getTenantByStripeCustomerId`.
- **src/quotas.js** -- Refactored from tier-based to payment-method-based model.
  `getEffectiveQuota(hasPaymentMethod, config)` replaces `getEffectiveQuota(tier, config)`.
  `checkQuota` now reads `payment_method_added_at` and `billing_status` from D1.
  New reason `payment_required` for free-tier capture limit. Grace period expiry
  with lazy transition to `blocked`.
- **src/account.js** -- `handleAccountGetUsage` returns `billingStatus`,
  `hasPaymentMethod`, `gracePeriodEnd` instead of `tierDisplay`.
- **src/index.js** -- Billing routes wired into router. Session auth gate extended
  to cover `/v1/billing/*`. Capture quota handler updated for `payment_required`
  reason with appropriate messaging.
- **wrangler.toml** -- Stripe env vars (`STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_CAPTURE_PRICE_ID`) and secret comments (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`).
- **wrangler.test.toml** -- Test Stripe bindings added.
- **vitest.config.js** -- Stripe test bindings added to miniflare config.

### Test files

- **test/stripe.test.js** -- 14 tests: `flattenParams` (8), `stripeRequest` (5),
  `STRIPE_API_VERSION` (1).
- **test/stripe-webhook.test.js** -- 17 tests: `parseStripeSignature` (5),
  `verifyStripeSignature` (8), event dedup (3).
- **test/billing.test.js** -- 17 tests: checkout (5), portal (3), webhook (9).
- **test/quotas.test.js** -- Updated from tier-based to payment-method-based model.
- **test/quota-enforcement.test.js** -- Updated for `payment_required` reason.
- **test/account-usage.test.js** -- Updated response shape assertions.

## Test results

40 test files, 1038 tests passing, 2 skipped.

## What was deferred

- **Stripe meter event reporting** -- `reportMeterEvent()` is implemented in
  `stripe.js` but not yet called from the capture pipeline. This requires wiring
  into the post-capture success path and confirming meter event_name matches
  Stripe configuration. Tracked as follow-up work.
- **Stripe Tax configuration** -- Configured in Stripe Dashboard, not in code.
- **Invoice threshold (€5)** -- Configured in Stripe Dashboard billing settings.
- **Email notifications on payment failure** -- Handled by Stripe's built-in
  email notifications, not custom code.

## Backlog changes

- R29 (Stripe usage-based billing) marked done.
- Stripe meter event wiring deferred to parking lot.
