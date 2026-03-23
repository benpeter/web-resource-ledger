# UX Strategy Review: capture-metering-stripe-pipeline

**Verdict: ADVISE**

---

## Concern 1: `projectedCharges: null` is a permanent placeholder in the API contract

[usability]: The `projectedCharges` sub-object (`{ amount: null, currency: 'EUR', note: '...' }`) is returned on every usage response with no current value, only a note explaining why it is empty.

- **SCOPE**: Task 2 -- `GET /v1/account/usage` billing sub-object
- **CHANGE**: Remove `projectedCharges` from the response entirely. A field that always returns null and a note string is schema noise. It tells the API consumer "we considered this but didn't build it" -- which is internal information, not user information. When projected charges are actually implemented, add the field then.
- **WHY**: Every field in an API response is a permanent cognitive tax on developers integrating against it. A null field with an explanatory note string creates confusion about whether the field is optional, erroneous, or deliberately deferred. "Nielsen heuristic 8: irrelevant information diminishes relevant information." The note itself implies this is a known gap -- which is not information a tenant needs to accomplish their job (understand their current usage and charges). Add fields when they carry value, not when they reserve a namespace.
- **TASK**: Task 2 (api-design-minion) -- remove `projectedCharges` from the billing sub-object and its test assertions. Re-add in a future task when projection logic is implemented.

---

## Concern 2: `invoiceThreshold.currentProgress` duplicates `currentCharges.amount`

[usability]: The billing sub-object includes both `billing.currentCharges.amount` and `billing.invoiceThreshold.currentProgress`, which will always be the same value (both are `charges.amount`).

- **SCOPE**: Task 2 -- `GET /v1/account/usage` billing sub-object
- **CHANGE**: Remove `invoiceThreshold.currentProgress`. The consumer already has `billing.currentCharges.amount` one level up in the same response. Keeping both requires the consumer to reason about whether they are ever different -- they are not, which means every time a developer asks "why are there two fields with the same value?" that is wasted cognitive effort.
- **WHY**: Duplicate data in an API response violates the principle of minimal design (Nielsen heuristic 8) and creates a consistency maintenance burden: if the calculation ever changes, there are two fields to keep in sync. The `met` boolean (`invoiceThreshold.met`) is genuinely useful as a convenience flag -- keep that. But `currentProgress` adds no information.
- **TASK**: Task 2 (api-design-minion) -- remove `currentProgress` from `invoiceThreshold`. Update tests accordingly.

---

## Concern 3: `billing.tiers` (full pricing table) on every response is a design choice that needs justification

[usability]: The full `VOLUME_TIERS` array (4 objects, each with `id`, `name`, `unitPrice`, `from`, `to`) is returned on every `GET /v1/account/usage` call for every tenant.

- **SCOPE**: Task 2 -- `GET /v1/account/usage` billing sub-object
- **CHANGE**: This is an ADVISE, not a removal request. The plan notes this is for "conversion UX" and "dashboard UX." If a dashboard UI is the intended consumer and it needs the full tier table to render a tier comparison widget, the placement is fine. However, if the primary consumer is programmatic (billing logic, reconciliation scripts), the full tier table is noise on a high-frequency endpoint. Consider: (a) move `tiers` to a separate static endpoint (`GET /v1/pricing` or similar) that a dashboard can fetch once and cache, rather than embedding it in every usage poll; or (b) keep it but explicitly acknowledge the tradeoff in the API design rationale so the future UI task knows this field was placed here intentionally for their use.
- **WHY**: A usage endpoint is typically polled frequently (dashboard refresh, programmatic quota checks). Returning a static 4-element pricing table on every call mixes two different data lifecycles: dynamic (current usage, current tier) and static (the pricing table, which changes only when Stripe pricing changes). This is a minor payload concern at WRL's current scale, but it is an API design smell worth flagging before the contract is set.
- **TASK**: Task 2 (api-design-minion) -- either add a brief rationale comment in the code noting that `tiers` is included for dashboard rendering, OR restructure to a separate pricing endpoint. The implementation team should make this call explicitly, not by default.

---

## Non-concerns (within scope but acceptable)

- **Billing data for free tenants**: Returning `billing` for all tenants is correct. A free tenant seeing `amount: 0, tier: tier_0` is accurate and genuinely useful for conversion flows. No concern.
- **`invoiceThreshold.met` boolean**: Useful convenience field. Appropriate.
- **No dashboard UI in this phase**: The plan correctly defers UI to a future task. The API contract being built now is the right foundation -- no UX concern with the deferral.
- **`reportAllCaptures` decision**: No user-facing UX impact. The billing math produces the same displayed amounts either way.
