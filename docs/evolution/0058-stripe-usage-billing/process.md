# Phase 0058: Process

## TL;DR

Stripe billing integration completed in a single session. A previous session
wrote the core Stripe client (`stripe.js`), webhook verification
(`stripe-webhook.js`), D1 migration, and billing DB functions. This session
reviewed that work, wrote the endpoint handlers (`billing.js`), wired routes
into the router, updated the quota model from tier-based to payment-method-based,
wrote 48 new tests, fixed 18 pre-existing test failures from the model change,
and shipped with 1038 tests passing.

## What happened

### Phase 1: Review and gap analysis

A previous nefario session wrote the foundational code but stalled before
completing the integration. The existing code included:

- `src/stripe.js` -- complete and well-structured, no changes needed
- `src/stripe-webhook.js` -- complete, with proper timing-safe comparison
- `migrations/0006_billing.sql` -- four new columns, partial index, good defaults
- `src/db.js` billing functions -- complete set (get, set, lookup by customer ID)
- `src/quotas.js` -- already refactored from tier-based to payment-method-based
- `src/account.js` -- usage endpoint already updated for new response shape
- `wrangler.toml` / `wrangler.test.toml` / `vitest.config.js` -- Stripe bindings added

Missing: endpoint handlers, route wiring, tests, and test updates for the
model change.

### Phase 2: Endpoint implementation

Created `src/billing.js` with three handlers:

1. **`handleBillingCheckout`** -- Creates Stripe Checkout session in subscription
   mode. Auto-creates Stripe customer if the tenant doesn't have one yet.
   Returns the Checkout URL for client redirect. Guards against tenants who
   already have a payment method (409).

2. **`handleBillingPortal`** -- Creates Stripe Customer Portal session. Requires
   existing Stripe customer (400 if not). Returns portal URL.

3. **`handleStripeWebhook`** -- Public endpoint (no session auth). Verifies
   Stripe-Signature header, deduplicates via KV, dispatches to four event
   handlers:
   - `checkout.session.completed` → set payment method, reactivate if needed
   - `invoice.payment_failed` → start 7-day grace period
   - `invoice.paid` → clear grace period, reactivate
   - `customer.subscription.deleted` → block immediately

### Phase 3: Route wiring

Routes added to `src/index.js`:
- `POST /v1/billing/checkout` -- session-gated (extended `isAccountRoute` check)
- `POST /v1/billing/portal` -- session-gated
- `POST /v1/stripe/webhook` -- public (signature-verified internally)

The session auth gate was extended to cover `/v1/billing/` alongside
`/v1/account/`. The rate limit group mapping was similarly extended.

### Phase 4: Quota handler updates

The capture and batch handlers in `index.js` checked `quotaCheck.reason ===
'capture_limit'` for messaging, but the new model uses `payment_required` for
free-tier tenants. Updated both handlers to recognize `payment_required` as a
capture-type limit with distinct messaging ("Free tier limit reached... Add a
payment method").

### Phase 5: Test updates

Three categories of test work:

1. **New tests** (48 total):
   - `test/stripe.test.js` (14): flattenParams edge cases, stripeRequest with
     fetch stubs
   - `test/stripe-webhook.test.js` (17): signature parsing, verification with
     real HMAC computation, event dedup with mock KV
   - `test/billing.test.js` (17): integration tests via SELF.fetch through
     the worker, covering auth gates, Stripe API stubs, DB state verification

2. **Updated tests** (3 files):
   - `test/quotas.test.js` -- signature change from `(tier, config)` to
     `(hasPaymentMethod, config)`, new assertions for unlimited paid tier
   - `test/quota-enforcement.test.js` -- `capture_limit` → `payment_required`,
     updated detail message assertions
   - `test/account-usage.test.js` -- response shape from `tierDisplay` to
     `billingStatus`/`hasPaymentMethod`/`gracePeriodEnd`

3. **Final test count**: 40 files, 1038 passing, 2 skipped (pre-existing).

## Key decisions

- **Checkout mode: subscription, not setup** -- Stripe Checkout in `subscription`
  mode with a usage-based price creates both the payment method and the
  subscription in one flow. `setup` mode would require a separate subscription
  creation step.

- **Grace period: 7 days, lazy expiry** -- Instead of a cron checking grace
  period expiry, the `checkQuota` function evaluates grace period end in JS
  (not SQL) and lazily transitions to `blocked`. This avoids an extra binding
  and keeps the system simple.

- **Subscription deletion blocks immediately** -- Unlike payment failure (which
  gets a grace period), subscription cancellation is treated as deliberate. The
  handler transitions through `grace_period` → `blocked` because `setBillingStatus`
  requires that path.

## Where to read more

- Issue #106: full requirements and success criteria
- `docs/evolution/0058-stripe-usage-billing/decisions.md`: all decision records
- `docs/evolution/0058-stripe-usage-billing/outcome.md`: what was built and deferred
