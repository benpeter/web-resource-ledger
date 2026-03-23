# Phase 0058: Decisions

## D1: No Stripe SDK -- fetch-only client

**Chosen:** Hand-rolled `stripeRequest()` using `fetch()` with form-encoded params
and bracket-notation flattening.

**Rejected:** @stripe/stripe-node SDK.

**Rationale:** Project constraint -- no npm dependencies. The SDK is 200+ KB and
pulls in Node-specific modules. Stripe's API is HTTP + form-encoding, so a thin
wrapper is all we need. The `flattenParams()` helper handles nested objects and
arrays in ~30 lines.

## D2: Stripe API version pinned in code

**Chosen:** `STRIPE_API_VERSION = '2025-04-30.basil'` exported from `stripe.js`,
sent as `Stripe-Version` header on every request.

**Rationale:** Prevents silent breakage when Stripe updates their default API
version. If we upgrade, it's a deliberate code change with a test run.

## D3: Webhook signature verification using Web Crypto

**Chosen:** HMAC-SHA256 via `crypto.subtle` with the full `whsec_*` string as the
raw UTF-8 key (prefix included, not stripped or decoded).

**Rejected:** Strip `whsec_` prefix and base64-decode like WRL's outbound webhook
signing does with `wrlsec_`.

**Rationale:** Stripe's signing convention differs from WRL's: the entire
`whsec_*` value is the HMAC key, used raw. Confirmed by testing against Stripe
sandbox signatures.

## D4: Event dedup via KV with 7-day TTL

**Chosen:** KV key `stripe_evt:{eventId}` with 604800s TTL.

**Rejected:** D1 table for processed events.

**Rationale:** KV is ideal for idempotency checks: fast reads, low write cost,
automatic TTL cleanup. 7 days covers Stripe's retry window with margin.

## D5: Billing routes under session auth gate

**Chosen:** `/v1/billing/checkout` and `/v1/billing/portal` are behind the same
session auth gate as `/v1/account/*` routes, with CSRF and ToS enforcement.

**Chosen:** `/v1/stripe/webhook` is public (no session auth) -- signature
verification is the security boundary.

**Rationale:** Billing actions are self-serve operations that require an
authenticated user context. The webhook is called by Stripe's infrastructure
and must accept requests without cookies.

## D6: Usage-based pricing replaces tier model

**Chosen:** `getEffectiveQuota(hasPaymentMethod, config)` -- boolean, not tier name.
Free tier: 200 captures/month. Paid: unlimited (Stripe meters usage).

**Rejected:** Keep `tier` column and `TIER_QUOTAS` lookup.

**Rationale:** There are no tiers. The pricing model is pure usage-based: first 200
free, then pay-per-capture with volume discounts handled entirely by Stripe. The
`tier` column in the `tenants` table is now vestigial but not removed to avoid a
migration. Tests updated from tier-based to payment-method-based assertions.

## D7: Grace period on payment failure

**Chosen:** 7-day grace period via `billing_status = 'grace_period'` +
`grace_period_end` timestamp. Lazy transition to `blocked` on next quota check
after expiry.

**Rationale:** Gives tenants time to fix payment issues without immediately
disrupting service. The lazy check avoids needing a cron trigger.

## D8: Subscription cancellation blocks immediately

**Chosen:** `customer.subscription.deleted` transitions tenant to `blocked`
status immediately (via `grace_period` → `blocked` path).

**Rationale:** Unlike payment failure (temporary issue), subscription deletion
is a deliberate action. Immediate block prevents continued usage.
