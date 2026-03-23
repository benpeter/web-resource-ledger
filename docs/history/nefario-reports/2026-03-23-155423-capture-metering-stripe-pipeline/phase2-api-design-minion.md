# API Design Contribution: Usage Endpoint Extension for Tiered Pricing

## Analysis

### Current State

`GET /v1/account/usage` returns a flat JSON object with eight top-level fields: `tenantId`, `period`, `billingStatus`, `hasPaymentMethod`, `gracePeriodEnd`, `captures`, `storageBytes`, `resetsAt`. The `captures` sub-object has `used`, `limit`, `remaining`. For paid tenants (those with a payment method), `limit` and `remaining` are `null` to indicate "unlimited."

The existing test suite (`test/account-usage.test.js`) has an explicit field-presence assertion that checks for exactly these eight keys. Any new top-level fields will break this test, which is intentional -- it forces deliberate schema evolution.

The current handler (`account.js:467-551`) reads everything from D1 via `checkQuota()`. There is no Stripe API call in the hot path. The response is fast and has zero external dependencies beyond D1.

### Key Design Question: Server-Side Calculation vs. Stripe Invoice Preview

There are two viable approaches:

**Option A: Server-side tier calculation from D1 capture count.** The tiers are static, defined in the Stripe sandbox config and documented in the project. The server already has `captureCount` from D1. Computing `currentCharges` and `currentTier` is pure arithmetic against well-known graduated pricing brackets. No external call needed.

**Option B: Stripe Invoice Preview API.** Call `POST /v1/invoices/create_preview` with the customer's subscription to get Stripe's authoritative view of accumulated charges. The project uses Stripe API version `2025-04-30.basil`, which is post-deprecation of `GET /v1/invoices/upcoming` -- so this must use the `create_preview` endpoint. This returns `amount_due`, `subtotal`, `total`, and line items with full tier detail.

### Recommendation: Hybrid -- Server-Side Primary, Stripe as Future Reconciliation

**Use server-side calculation for the dashboard endpoint.** Here is why:

1. **Latency.** The usage endpoint is called on every dashboard page load. Adding a Stripe API round-trip (200-500ms) to every request violates the project's `<300ms` latency principle. D1 arithmetic adds <1ms.

2. **Stripe meter events are not yet wired.** The outcome doc for Phase 0058 explicitly states: "reportMeterEvent() is implemented in stripe.js but not yet called from the capture pipeline." Until meter events flow to Stripe, the Invoice Preview API would return `$0.00` for all tenants -- misleading and useless. The D1 `capture_count` is the source of truth right now.

3. **No Stripe customer for free tenants.** Free-tier tenants have no Stripe customer ID. They cannot be queried via the Invoice Preview API. But they still need to see "0 captures, $0.00 charges, free tier" on their dashboard.

4. **Consistency.** The tiers are graduated and deterministic. Given a capture count, the charges are a pure function. There is no scenario where server-side math disagrees with Stripe (once meters are wired) unless there is a bug in one of them -- and reconciliation logging (R31 requirement) will catch that.

5. **Dependency.** If Stripe is down, the dashboard should still work. No external dependency for read-only display data.

**The Stripe Invoice Preview API should be used later** for a reconciliation endpoint (admin-side) or as an optional `?source=stripe` query parameter for debugging. It should not be in the default dashboard path.

## Design Recommendation

### Response Shape Extension

Add a new top-level `billing` object to the response. Do NOT modify existing fields. Additive change only.

```json
{
  "tenantId": "...",
  "period": "2026-03",
  "billingStatus": "free|active|grace_period|blocked",
  "hasPaymentMethod": true,
  "gracePeriodEnd": null,
  "captures": { "used": 5432, "limit": null, "remaining": null },
  "storageBytes": { "used": 1234567, "limit": null, "remaining": null },
  "resetsAt": "2026-04-01T00:00:00.000Z",
  "billing": {
    "currentCharges": {
      "amount": 276.20,
      "currency": "EUR"
    },
    "tier": {
      "id": "tier_3",
      "name": "10,001-100,000",
      "unitPrice": 0.035,
      "currency": "EUR",
      "startsAt": 10001,
      "endsAt": 100000
    },
    "tiers": [
      { "id": "tier_0", "name": "free", "unitPrice": 0, "from": 1, "to": 200 },
      { "id": "tier_1", "name": "201-10,000", "unitPrice": 0.05, "from": 201, "to": 10000 },
      { "id": "tier_2", "name": "10,001-100,000", "unitPrice": 0.035, "from": 10001, "to": 100000 },
      { "id": "tier_3", "name": "100,001+", "unitPrice": 0.015, "from": 100001, "to": null }
    ],
    "invoiceThreshold": {
      "amount": 5.00,
      "currency": "EUR",
      "currentProgress": 276.20,
      "met": true
    },
    "projectedCharges": {
      "amount": null,
      "currency": "EUR",
      "note": "Projected charges require usage history (available after first full billing period)"
    }
  }
}
```

### Design Decisions and Rationale

**1. New `billing` sub-object rather than flat fields.**
Grouping pricing/invoice data under `billing` keeps the existing flat structure clean and makes it obvious which fields are new. SDK clients can ignore `billing` entirely if they only care about quota enforcement. The `captures`, `storageBytes`, and `billingStatus` fields remain the quota-enforcement contract; `billing` is the financial-information contract.

**2. `tier` (singular) shows the CURRENT tier; `tiers` (plural) shows ALL tiers.**
The dashboard needs both: "you are currently in this tier" (for a highlight/badge) and "here are all tiers" (for a pricing breakdown table). The `tier` object points to whichever bracket the current `captures.used` count falls into. If the tenant has 0 captures, `tier.id` is `"tier_0"` (free tier).

**3. `tier.id` is a stable, opaque identifier.**
Using `"tier_0"`, `"tier_1"`, etc. rather than the price amount or range as identifier gives the dashboard a stable key for styling, analytics, and future SDK discriminator patterns. If tier boundaries change, `tier.id` can stay the same.

**4. `currentCharges.amount` is a number, not a string.**
Monetary amounts as numbers (not strings like `"276.20"`) are idiomatic in this codebase and match how Stripe returns amounts (in cents, but here we use EUR with decimals since these are display amounts, not transactional). The currency is always present so the client knows the unit. Two-decimal precision is sufficient since the minimum unit price is EUR 0.015.

**5. `invoiceThreshold` shows progress toward the EUR 5 minimum.**
This directly answers the R31 success criterion: "EUR 5 threshold progress." `currentProgress` mirrors `currentCharges.amount` (they are the same value within a period since there are no credits or adjustments yet). `met` is a boolean convenience so the dashboard can show "Invoice will be generated" vs. "Balance rolls over." If the threshold changes later, only the server-side constant changes, not the API contract.

**6. `projectedCharges` is nullable and starts null.**
Projecting end-of-period charges requires historical usage data (at minimum one full period of capture velocity). For the first implementation, return `null` with a human-readable `note` explaining why. This field is explicitly part of the R31 spec ("projected charges"). Including it now as null is better than omitting it and adding it later (additive change now vs. discovery later).

**7. `billing` is null for free-tier tenants (billingStatus === "free").**
Free-tier tenants have no charges, no tier progression, and no invoice threshold. Returning `null` rather than a zero-filled billing object makes the semantic clear: billing does not apply yet. The dashboard renders differently for free vs. paid tenants anyway.

Wait -- on reflection, this is wrong. Free tenants should ALSO see billing data. They need to see: "You have used 150 of 200 free captures. Here is what it would cost if you upgrade." Showing tier information to free tenants is a conversion tool. **Revised:** return `billing` for all tenants, but set `currentCharges.amount` to `0` and `invoiceThreshold.met` to `false` for free tenants. The `tier` field shows `tier_0` (free). The `tiers` array is always present so the UI can render "upgrade to pay-as-you-go" with real pricing.

**8. No `?source=stripe` parameter in v1.**
This keeps the implementation simple. A reconciliation/admin endpoint is a separate concern (admin namespace, different auth). Do not complicate the dashboard endpoint with optional Stripe-backed behavior.

### Backward Compatibility

This is a **purely additive change**. All existing fields remain unchanged in type, position, and semantics. The only breakage is the test that asserts exactly eight top-level keys -- this must be updated to include `billing` as a ninth key.

Existing API consumers (if any) that destructure or whitelist fields will simply ignore `billing`. No version bump needed. No deprecation headers needed.

### Tier Calculation Logic

The tier calculation is a pure function:

```
function calculateCharges(captureCount, hasPaymentMethod) {
  // Free tier tenants: no charges, show tier_0
  // Paid tier: graduated pricing
  const TIERS = [
    { id: 'tier_0', from: 1,      to: 200,    unitPrice: 0      },
    { id: 'tier_1', from: 201,    to: 10000,  unitPrice: 0.05   },
    { id: 'tier_2', from: 10001,  to: 100000, unitPrice: 0.035  },
    { id: 'tier_3', from: 100001, to: null,    unitPrice: 0.015  },
  ];

  // Graduated: each unit in each bracket is priced at that bracket's rate
  let totalCharges = 0;
  let currentTier = TIERS[0];
  for (const tier of TIERS) {
    if (captureCount >= tier.from) currentTier = tier;
    const bracketStart = tier.from - 1;
    const bracketEnd = tier.to ?? Infinity;
    const unitsInBracket = Math.max(0,
      Math.min(captureCount, bracketEnd) - bracketStart
    );
    totalCharges += unitsInBracket * tier.unitPrice;
  }
  return { totalCharges, currentTier };
}
```

This function should live in a new module (e.g., `src/pricing.js`) or in `quotas.js`. It must NOT duplicate the tier definitions -- define them once and export. The same tier array should power the `billing.tiers` response field.

### Where the Tier Definitions Should Live

Define tiers as a constant array in `src/pricing.js`:

```js
export const VOLUME_TIERS = [
  { id: 'tier_0', name: 'free',            unitPrice: 0,     from: 1,      to: 200    },
  { id: 'tier_1', name: '201-10,000',      unitPrice: 0.05,  from: 201,    to: 10000  },
  { id: 'tier_2', name: '10,001-100,000',  unitPrice: 0.035, from: 10001,  to: 100000 },
  { id: 'tier_3', name: '100,001+',        unitPrice: 0.015, from: 100001, to: null   },
];

export const INVOICE_THRESHOLD_EUR = 5.00;
```

These are display/calculation constants that mirror the Stripe Dashboard configuration. They are NOT fetched from Stripe at runtime. If Stripe pricing changes, these must be updated in code. This is acceptable because pricing changes are rare and deliberate -- they require a code deployment anyway for the dashboard to reflect them correctly.

### Handler Changes

The existing `handleAccountGetUsage` function in `account.js` needs minimal changes:

1. After computing `captureCount`, call `calculateCharges(captureCount, hasPaymentMethod)`.
2. Build the `billing` sub-object from the result.
3. Add `billing` to the response object.

No new D1 queries. No new external API calls. The only new dependency is the `pricing.js` module.

### operationId Convention

The existing endpoint maps to `getAccountUsage`. No change needed. If a separate billing-detail endpoint is added later, it would be `getAccountBilling` at `/v1/account/billing`.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tier definitions in code drift from Stripe Dashboard config | Low | High (wrong charges displayed) | Reconciliation logging (R31 scope) catches drift. Add a comment block in `pricing.js` referencing the Stripe product lookup key. |
| Floating-point arithmetic produces charges off by 0.01 | Medium | Low (display only, not billing) | Round to 2 decimal places explicitly. Use `Math.round(amount * 100) / 100`. Stripe handles actual billing math. |
| Free-tier tenants confused by seeing pricing tiers | Low | Low | Dashboard UI concern, not API concern. The API provides the data; the UI decides how to present it. |
| `projectedCharges` field is always null initially | Certain | Low | The `note` field explains why. Projection can be implemented later using period-over-period velocity from D1 `usage_counters` historical data. |
| Response size increase (~500 bytes) | Certain | Negligible | The endpoint already returns ~400 bytes. Doubling to ~900 bytes is fine for a no-store, per-request endpoint. |

## Dependencies

- **R31 (this issue):** This design addresses the dashboard portion of R31.
- **R29 (Stripe integration):** Already done. Provides `stripe_customer_id`, `billing_status`, and the Stripe API client.
- **R25 (usage metering):** Already done. Provides `capture_count` in D1 `usage_counters`.
- **Meter event wiring:** NOT a dependency for this endpoint. The dashboard reads from D1, not from Stripe meters. Meter events are a separate concern (reporting to Stripe for actual invoicing).

## Additional Specialist Input

No additional specialists are needed beyond those already involved. The key implementation concerns are:

- **Data minion:** Should validate that the `VOLUME_TIERS` constant array matches the Stripe sandbox configuration (no schema change needed in D1).
- **Test minion:** Should plan tests for `calculateCharges()` edge cases: 0 captures, exactly 200, 201, 10000, 10001, 100000, 100001, and large numbers. Also test the response shape assertion update.
- **IAC minion:** No infrastructure changes needed. No new Stripe secrets, no new D1 tables, no new KV namespaces.

## Summary of Recommendations

1. **Server-side tier calculation, not Stripe Invoice Preview.** Stripe has no meter data yet and would add unacceptable latency.
2. **Additive `billing` sub-object** on the existing response. No breaking changes, no version bump.
3. **New `src/pricing.js` module** with exported `VOLUME_TIERS` constant and `calculateCharges()` pure function.
4. **Include `billing` for ALL tenants** (free and paid). Free tenants see `tier_0` with `currentCharges.amount: 0`. This supports upgrade-conversion UX.
5. **`projectedCharges` starts as null** with explanatory note. Implement projection in a later phase once historical data is available.
6. **`invoiceThreshold` object** shows EUR 5 minimum progress. `met: true/false` is a convenience boolean.
7. **No Stripe API call** in the usage endpoint hot path. Keep it D1-only.
