# Domain Plan Contribution: ux-strategy-minion

## Planning Question

> What are the 2-3 most common operator investigation scenarios and how should events be structured to make those Coralogix queries simple?

## Recommendations

### The Three Investigation Scenarios

I identified three operator investigation scenarios by applying JTBD analysis to the audit logging feature. These emerge from the stated success criteria (abuse investigation, compliance reporting, multi-tenant operation) and the system's actual trust boundaries.

**Scenario 1: "Show me everything tenant X did last Tuesday"**

*JTBD: When I receive an abuse complaint or a tenant asks about their usage, I want to see all activity for that tenant in a time window, so I can reconstruct what happened without guessing.*

This is the highest-frequency investigation. The operator's mental model is: tenant + time window = complete picture. Every audit event must carry `tenantId` as a top-level field (not nested) so a single Coralogix filter (`json.tenantId == "acme" AND timestamp BETWEEN ...`) returns the full story. No joins, no second query, no mental assembly required.

Current state: `tenantId` is already present on post-auth log events (`capture.start`, `capture.success`, `list.success`, etc.). The gap is that there is no unified "audit" subsystem -- events are scattered across subsystems `capture`, `security`, `list`. An operator investigating tenant activity must query three subsystems and mentally merge the results. That is unnecessary cognitive load on the person doing the investigation.

**Scenario 2: "Which key was used, and is it still active?"**

*JTBD: When I suspect a key has been compromised or a tenant reports unauthorized captures, I want to trace which specific API key was used for each action, so I can revoke the right key without disrupting other tenants.*

This scenario is triggered by security incidents. The operator needs to go from "suspicious capture" to "the key that authorized it" in one query. Today, `auth.js` returns only `tenantId` -- there is no `keyId` in the auth result because all tenants currently share a single `CAPTURE_API_KEY`. When R12 (per-tenant keys) ships, each key will have its own identity. Audit events must include `keyId` (the API key identifier, not the signing key) so the operator can filter by key and see exactly which key authorized which actions.

Key lifecycle events (provisioning, revocation) are the other half of this scenario. When an operator revokes a key, they need to confirm: "after revocation time T, zero events used this keyId." If key lifecycle events live in the same event stream with the same `keyId` field, this is a single query. If they live in a different system or use different field names, the operator has to cross-reference manually.

**Scenario 3: "Why is this tenant's error rate spiking?"**

*JTBD: When Coralogix alerts show elevated errors for a tenant, I want to see all their failed requests alongside successful ones, so I can identify the pattern (bad URLs, rate limiting, auth issues) without switching between dashboards.*

This is an operational triage scenario. The operator starts from a symptom (high error rate) and needs to drill into cause. The key requirement: audit events must include `outcome` (success/failure/denied) and `httpStatus` as top-level fields. This lets the operator filter `json.tenantId == "acme" AND json.outcome == "error"` and immediately see whether failures are auth rejections, rate limits, SSRF blocks, or capture pipeline errors -- all in one stream.

### Event Structure Recommendation

Every audit event should share a common envelope that makes all three scenarios queryable with simple field equality or range filters:

```
{
  "event": "audit.capture.create",     // namespaced, hierarchical
  "tenantId": "acme",                  // top-level, always present on authenticated events
  "keyId": "k_abc123",                 // API key that authorized this request (from R12)
  "action": "capture.create",          // verb, dot-separated: {resource}.{operation}
  "resource": "cap_9f8e7d...",         // the thing acted upon (captureId, keyId for lifecycle)
  "outcome": "success",                // "success" | "denied" | "error"
  "httpStatus": 202,                   // response status code
  "cip": "a3f2...",                    // hashed client IP (existing field)
  "timestamp": 1710000000000           // milliseconds (Coralogix-native)
}
```

Critical design choices:

1. **Flat structure, no nesting.** Coralogix queries on nested fields (`json.auth.tenantId`) are slower and more error-prone than top-level fields (`json.tenantId`). Flat fields also mean the operator can build Coralogix dashboards with simple aggregations.

2. **`action` as a human-readable verb.** The `event` field follows the existing taxonomy (`audit.capture.create`). The `action` field is the operator-facing label: `capture.create`, `capture.list`, `key.create`, `key.revoke`. These are the words operators think in. The event taxonomy is for programmatic routing; the action is for human scanning.

3. **`outcome` as a three-value enum.** Not boolean. "denied" (auth failure, rate limit, SSRF block) is categorically different from "error" (pipeline crash, KV failure). The operator's response to each is different: denied means the system worked correctly; error means something broke. Collapsing these into success/failure forces the operator to re-derive the distinction from other fields.

4. **`resource` identifies the object.** For captures, this is the captureId. For key lifecycle events, this is the keyId being created/revoked. This lets the operator trace a single resource across its lifecycle: creation, completion, access, verification.

### Relationship to Existing Events

Audit events should supplement, not replace, existing log events. The existing `capture.success`, `capture.fail`, `security.auth_fail` events serve operational debugging (detailed timing, error categories, render quality). Audit events serve a different audience (the operator investigating tenant behavior) and a different query pattern (tenant + time window).

The implementation should be: add a new `audit` subsystem. Emit audit events alongside existing events at the same call sites. The audit events are lean (common envelope only, no render timing or WACZ details). The existing events remain as-is for operational debugging.

This means some information is logged twice. That is the correct trade-off: audit events optimized for investigation queries, operational events optimized for debugging. Merging them would serve neither audience well.

### Coralogix Query Patterns

Here is how each scenario maps to a single Coralogix query:

**Scenario 1** -- tenant activity in time window:
```
subsystemName:"audit" AND json.tenantId:"acme"
```
(Coralogix time picker handles the time range)

**Scenario 2** -- all actions by a specific key:
```
subsystemName:"audit" AND json.keyId:"k_abc123"
```

**Scenario 2b** -- confirm no activity after key revocation:
```
subsystemName:"audit" AND json.keyId:"k_abc123" AND json.action != "key.revoke"
```
(set time range to after revocation timestamp)

**Scenario 3** -- tenant errors:
```
subsystemName:"audit" AND json.tenantId:"acme" AND json.outcome:"error"
```

All single-line queries. No joins. No sub-queries. No "also check the security subsystem." This is the design goal: one subsystem, one query, complete answer.

## Proposed Tasks

### Task 1: Define the audit event schema and taxonomy

**What**: Document the audit event envelope (fields, types, allowed values) and the complete list of audit events (one per authenticated action + key lifecycle events). Produce a table matching the format of the existing log event taxonomy in `docs/evolution/0015-coralogix-logging/outcome.md`.

**Deliverables**: Schema definition in the phase's `decisions.md`. Event taxonomy table.

**Dependencies**: None. This is a design task that precedes implementation.

**UX-critical details**:
- The `action` field vocabulary must use operator-natural language: `capture.create`, `capture.list`, `capture.read`, `key.create`, `key.revoke`. Not internal function names.
- The `outcome` field must be exactly three values: `success`, `denied`, `error`. No other values. Operators will build alerts and dashboards on these; expanding the enum later is a breaking change to their mental model.
- Pre-auth events (auth failures where tenantId is unknown) need a clear convention. Recommendation: emit them with `tenantId: null` and `outcome: "denied"`. The operator can still filter `json.outcome:"denied"` to see all rejections across all tenants.

### Task 2: Validate audit event completeness against investigation scenarios

**What**: Before implementation, walk through each of the three investigation scenarios with the proposed event list and confirm every scenario can be answered with a single Coralogix query. This is a friction log exercise: step through each scenario as an operator would, using only the proposed fields, and verify there are no gaps.

**Deliverables**: Scenario walkthrough documented in `decisions.md` showing the exact Coralogix query for each scenario and confirming all needed fields are present.

**Dependencies**: Task 1 (schema definition).

**UX-critical details**:
- Pay special attention to the boundary between "denied" and "error" outcomes. Every authenticated request that returns a 4xx or 5xx must map to exactly one of these. Ambiguous mappings will confuse operators.
- Verify that key lifecycle events carry enough context: when a key is revoked, the audit event must include the `tenantId` the key belonged to (not just the admin who revoked it), so Scenario 2 queries work.

### Task 3: Implement audit log emission at authenticated request boundaries

**What**: Add audit event emission (using existing `log()` helper with subsystem `"audit"`) at each authenticated endpoint and key lifecycle endpoint. Use `ctx.waitUntil()` pattern consistent with existing security events.

**Deliverables**: Modified `src/index.js` (and admin endpoint file if it exists for R12). Tests confirming audit events are emitted with correct fields.

**Dependencies**: Task 1 (schema), R12 (per-tenant keys) for `keyId` field. However, implementation can proceed with `keyId: null` for the current single-key setup, same as `tenantId: 'default'` was done for R8.

## Risks and Concerns

### Risk 1: Audit events that duplicate existing events without clear differentiation

If audit events are too similar to existing `capture.success` / `security.auth_fail` events, operators will be confused about which subsystem to query. The `audit` subsystem must have a clearly documented purpose ("who did what, when") distinct from the `capture` / `security` / `list` subsystems ("what happened technically and why").

**Mitigation**: The audit events should be lean (common envelope only). Operational events stay detailed. Never add render timing, WACZ details, or error categories to audit events. The subsystem name `audit` is the query discriminator.

### Risk 2: Pre-auth events create a queryability gap

When an API key is invalid, there is no `tenantId` or `keyId` to log. Scenario 1 ("everything tenant X did") will miss failed auth attempts because they cannot be attributed to a tenant. This is correct behavior (you cannot attribute a failed auth to a tenant), but operators may not realize the gap exists.

**Mitigation**: Document this explicitly in operational docs. The operator investigating "did someone try to use tenant X's key?" must query `subsystemName:"security" AND json.event:"security.auth_fail"` filtered by `cip` (hashed IP), not by `tenantId`. This is a different query pattern and should be called out in a "common investigation queries" reference.

### Risk 3: Field naming inconsistency between audit and existing events

The existing events use `event` as the primary identifier (`capture.success`, `security.auth_fail`). The audit events should use `event` in the same spirit (`audit.capture.create`) but also add `action` as the operator-facing label. If the `action` field vocabulary drifts from the `event` naming, operators will have two mental models for the same system.

**Mitigation**: Derive `action` mechanically from `event`: `audit.{action}` where action is `capture.create`, `capture.list`, etc. Document the derivation rule so it is always consistent.

### Risk 4: R12 dependency may delay the highest-value investigation scenario

Scenario 2 (key tracing) requires `keyId` in audit events, which requires R12 (per-tenant keys). If audit logging ships before R12, the `keyId` field will be null on all events, making Scenario 2 non-functional.

**Mitigation**: This is acceptable. Ship audit logging with `keyId: null` now (same pattern as `tenantId: 'default'` in R8). The schema is correct, the field exists, and it will be populated when R12 ships. Document this as a known limitation.

## Additional Agents Needed

None. The current team is sufficient. The implementation is straightforward structured logging using existing infrastructure (`log()` helper, Coralogix, `ctx.waitUntil()`). The UX-critical decisions are about field naming and event taxonomy, not about code architecture.

One note: if the team includes an observability or ops specialist, they should validate that the proposed Coralogix query patterns actually work efficiently at the expected event volume. Coralogix query performance depends on field indexing, and `subsystemName` filtering is the primary discriminator. This is an operational concern, not a UX concern, but it directly affects whether the "single query" promise holds in practice.
