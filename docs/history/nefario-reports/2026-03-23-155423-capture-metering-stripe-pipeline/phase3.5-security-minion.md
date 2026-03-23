# Security Review: Capture Metering to Stripe Pipeline

**Verdict**: ADVISE

Two findings. Neither is a blocker, but both need to be addressed in the
implementation prompts before execution.

---

## Findings

### [security-1]: Idempotency key is predictable and length-unbounded

**SCOPE**: Task 3, `src/meter-reporter.js`, idempotency key construction.

**CHANGE**: The plan specifies `${tenantId}:${period}:${captureCount}` as the
Stripe `Idempotency-Key` header value. Two problems:

1. **Predictability**: Stripe idempotency keys are not secret, but they are
   also not documented as collision-safe across accounts. Any party who knows a
   tenant's ID, billing period, and approximate capture count (e.g., from the
   public-facing dashboard endpoint that now returns `captureCount`) can craft
   a request to Stripe with the same idempotency key. If the attacker holds a
   compromised Stripe API key (e.g., via a supply chain event), they could
   poison the idempotency cache to cause WRL's legitimate meter event to be
   treated as a duplicate and silently dropped. This is low-probability but
   non-zero, and the cost is unbilled usage (financial loss).

2. **Length**: Stripe idempotency keys are bounded at 255 characters. Tenant
   IDs are up to 64 characters, period is 7 characters, capture counts can
   reach 7+ digits. In practice this is fine for current scale, but the
   implementation should assert the key does not exceed 255 characters and
   truncate or hash if it would. Without this guard, an edge-case key could
   silently fail or be truncated by Stripe's API in a non-obvious way.

**WHY**: Stripe's Idempotency-Key documentation is explicit: the key must be
unique per logical operation and is deduplicated for 24 hours. A key collision
from a legitimate retry is the intended use case. A collision injected by a
third party using a predictable key pattern could suppress a legitimate billing
event. Stripe meter events cannot be retracted once submitted, and billing
discrepancies erode tenant trust and operator revenue.

**TASK**: In the Task 3 implementation prompt, add: (a) a namespace prefix
specific to this application (e.g., `wrl-meter:` prefix) to reduce collision
surface with any other Stripe users on the same key, and (b) an assertion that
`idempotencyKey.length <= 255`. The wrl prefix also makes keys easier to
identify in the Stripe Dashboard audit log.

Revised format: `` `wrl-meter:${tenantId}:${period}:${captureCount}` ``

---

### [security-2]: Dashboard endpoint exposes billing tier pricing to all authenticated tenants

**SCOPE**: Task 2, `src/account.js`, `GET /v1/account/usage` response, `billing.tiers` field.

**CHANGE**: The plan returns `tiers: VOLUME_TIERS` — the full tier array
including unit prices for all brackets — in the response to every
authenticated tenant, including free tenants. This is by design for conversion
UX.

The concern is not the prices themselves (those are non-secret), but the
`tiers` array as implemented exposes the internal tier constant structure
(including `id`, `name`, `unitPrice`, `from`, `to` fields) directly as an
API contract. Two risks:

1. **Accidental contract lock-in**: If Stripe pricing changes (e.g., a new
   tier bracket is added), the shape of `tiers` in the response changes.
   Downstream consumers (a future dashboard UI, third-party integrations) will
   break silently if they depend on array indices or the `id` field values
   (`tier_0`, `tier_1`, etc.). This is an A06 (Insecure Design) concern: the
   internal pricing model leaks directly into the external API contract without
   a versioning boundary.

2. **Information asymmetry risk**: The `currentTier` field (which tier the
   tenant's usage falls in) is genuinely useful for UX. The full `tiers` array
   is less clearly necessary — it exposes the complete pricing ladder including
   high-volume tiers irrelevant to free tenants. If pricing is ever
   confidential or differentiated by tenant (custom enterprise plans), this
   becomes a disclosure path.

**WHY**: The plan already acknowledges that pricing tiers in `pricing.js` can
drift from Stripe Dashboard configuration. Embedding the full tier structure
in the API response creates a second coupling point: now any change to
`VOLUME_TIERS` is also a breaking API change. The clean separation between
"what Stripe charges" and "what the API reports" is worth preserving.

**TASK**: In the Task 2 implementation prompt, add a note that the `tiers`
array in the response should be treated as advisory/informational and
explicitly documented as subject to change without versioning guarantees. More
concretely: confirm that the implementation sanitizes the `tiers` output to
only include fields intended for external consumers (`unitPrice`, `from`, `to`,
`name`) and strips internal fields like `id` that are implementation artifacts
of the `VOLUME_TIERS` constant. If `id` is needed by a future UI, document it
as unstable.

No change to the plan's execution order or task assignments is required. Both
items are implementation-level guards that belong in the agent prompts.
