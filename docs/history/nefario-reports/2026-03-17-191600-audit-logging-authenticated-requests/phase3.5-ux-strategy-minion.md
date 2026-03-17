# UX Strategy Review — Audit Logging for Authenticated Requests

**Verdict: APPROVE**

---

## Assessment

This plan lands in a good place. The synthesis already incorporates the key UX considerations I would have raised as first principles, so my role here is to confirm the reasoning holds and flag one refinement.

### Journey Coherence

The operator experience is coherent. The decision to enrich existing events rather than create a parallel audit subsystem is the right call from a querying mental model perspective: operators think in terms of what happened (a capture, a key revoke, an auth failure), not in terms of audit as a separate system they must join to operational logs. Single-event-per-action eliminates the cognitive overhead of "did I query both places?"

The `capture.list*` rename closes a real gap. An operator writing `event:capture.*` to find all capture-domain activity would silently miss list events under the old `list.*` naming. That's a mismatch between the event taxonomy and the operator's mental model of the domain. The rename is correct.

### Cognitive Load: Event Naming

The post-rename taxonomy is clean. The three subsystems — `capture.*`, `admin.*`, `security.*` — map to operator questions:

- "What did this tenant do?" → `capture.*`
- "What was done to this tenant's keys?" → `admin.*`
- "Were there any security events for this tenant?" → `security.*`

The `cip` field name warrants a note. It is an internal abbreviation (client IP, hashed). In the operator-facing `docs/audit-log-schema.md`, the field dictionary (Task 4, section c) must explain that `cip` is an HMAC-derived token representing the client IP — not a raw IP address. Operators searching for "where did this request come from?" need to understand they are correlating tokens, not inspecting addresses. The schema doc Task 4 already specifies this section; ensure the description is unambiguous on this point.

### Cognitive Load: Field Consistency

The mandatory audit envelope (tenantId, keyName, keyHashPrefix, authMethod, cip, responseStatus) on every authenticated request event is the right call. Consistent field presence across events means operators can build Coralogix queries once and rely on them — no conditional "this field only exists on some events" mental overhead. The explicit `null` on fields that are structurally absent (e.g., keyHashPrefix for admin-key auth, tenantId on key_revoke_fail) is correct: null-present is better than field-absent for query reliability.

### Simplification: Task Structure

The four-task sequence is well-scoped. The Task 1 approval gate is appropriate — it's the only place where the external contract (verifyApiKey return type) and a breaking change (event rename) are both in play. Gating there and flowing Tasks 2-4 as non-gated parallel work is the right shape.

No tasks can be meaningfully collapsed. Task 3 (INVARIANT documentation) is small but distinct in character from Task 2 (code changes); keeping them separate lets Task 2 stay focused on implementation. The parallel execution of Tasks 3 and 4 is correct.

### Jobs-to-be-Done: Do the Tasks Serve Real Operator Needs?

The original request named four success criteria. Mapping them:

| Original criterion | Served by |
|---|---|
| All authenticated requests logged with tenant context | Task 2 |
| Key provisioning/revocation events logged | Task 2 (admin.js enrichment) |
| Integrates with existing Coralogix structured logging | Task 1 (envelope plumbing) |
| Queryable by tenant and time range | Task 4 (example queries in schema doc) |

All four criteria are covered. The sixth example Coralogix query in Task 4 ("All admin operations in last 7 days") addresses a need not explicitly in the original request but clearly relevant to multi-tenant operation — a reasonable addition, not scope creep.

### One Finding: Schema Doc Operator Journey Section

Task 4 specifies an "operator journey" section (section f): "filter-then-scan-then-drill pattern." This is worth expanding slightly. Operators coming to `docs/audit-log-schema.md` for the first time have three distinct jobs: abuse investigation (start from a security event, find the tenant), compliance reporting (start from a tenant, find all activity), and key lifecycle auditing (start from a key operation, find who did it). The example queries address these implicitly, but a one-paragraph framing at the top of the schema doc that names these three operator jobs will help readers self-select to the right query without reading every example. This is a minor addition — the software-docs-minion can handle it inline during Task 4 without changing the task scope.

---

## Summary

The plan is sound. The key decisions — enrich not duplicate, rename for taxonomy consistency, mandatory field envelope, operator-facing schema reference — all reduce operator cognitive load and serve the real jobs. Execute as planned. Ensure the `cip` field description in the schema doc clearly explains it is a correlation token, not a raw IP.
