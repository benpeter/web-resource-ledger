## Task: Extend GET /v1/account/usage with billing data

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl

The pricing module (src/pricing.js) has been created. It exports calculateCharges(captureCount), VOLUME_TIERS, and INVOICE_THRESHOLD_EUR.

### What to do

1. Modify src/account.js handleAccountGetUsage function (~lines 467-551):

Import calculateCharges, INVOICE_THRESHOLD_EUR from './pricing.js'.

After computing captureCount and hasPaymentMethod, add a billing sub-object:

```js
const charges = calculateCharges(captureCount);
const billing = {
  currentCharges: {
    amount: charges.amount,
    currency: charges.currency,
  },
  tier: charges.currentTier,
  tiers: charges.tiers,
  invoiceThreshold: {
    amount: INVOICE_THRESHOLD_EUR,
    currency: 'EUR',
    met: charges.amount >= INVOICE_THRESHOLD_EUR,
  },
};
```

Add billing to the jsonResponse object.

IMPORTANT per architecture review:
- Do NOT include projectedCharges (removed per UX review -- add when feature exists)
- Do NOT include invoiceThreshold.currentProgress (removed per UX review -- duplicates currentCharges.amount)

2. Update test/account-usage.test.js:

- Update the field-presence assertion (around line 102 where Object.keys(body).sort() is checked) to include 'billing' in expected keys
- Add new tests in a describe('billing data') block:
  - Free tenant 0 captures: billing.currentCharges.amount === 0, billing.tier.id === 'tier_0', billing.invoiceThreshold.met === false
  - Free tenant 150 captures: billing.currentCharges.amount === 0, tier_0
  - Paid tenant 250 captures: billing.currentCharges.amount === 2.50, tier_1, invoiceThreshold.met === false
  - Paid tenant 10500 captures: billing.currentCharges.amount === 507.50, tier_2, invoiceThreshold.met === true
  - billing.tiers always array of 4 tiers
  - billing.invoiceThreshold.amount === 5.00

For paid tenant tests, set payment_method_added_at and stripe_customer_id on the tenant with direct DB update (pattern from test/billing.test.js).

### What NOT to do
- Do NOT call Stripe API. Dashboard reads from D1 only.
- Do NOT modify existing response fields. Only ADD billing field.
- Do NOT add projectedCharges.
- Do NOT touch src/pricing.js.

### After writing code
Run: npx vitest run test/account-usage.test.js
Fix any failures. All tests must pass.

When done, report: file paths with change scope and line counts, 1-2 sentence summary.