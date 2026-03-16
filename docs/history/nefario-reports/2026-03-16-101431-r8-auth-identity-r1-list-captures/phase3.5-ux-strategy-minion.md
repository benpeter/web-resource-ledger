## UX Strategy Review

**Verdict: APPROVE**

### Assessment

This plan is almost entirely backend and API work. My review focuses on the small but real user-facing surface: the API contract as a developer UX, and the documentation changes in Task 3.

---

### Journey Coherence

The user journey being resolved here is concrete and well-understood:

> "When I submit a capture, I want to be able to find it later, so I can retrieve evidence I may not have stored the ID for."

The current experience has a sharp failure mode: lose the ID, lose the capture. The plan closes that gap completely. The three-task sequence (R8 internal plumbing -> R1 endpoint -> Task 3 docs cleanup) is the right order. There are no gaps in the flow.

The dual-access model the plan introduces ("finding captures" via `GET /v1/captures` with API key, "sharing captures" via capture ID without auth) is coherent and the distinction is clean. Task 3 surfaces this framing in the README. That framing is good -- it tells users the mental model, not just the mechanics.

---

### Cognitive Load

**API contract (Task 2):** The response envelope is simple and predictable:

```json
{ "data": [...], "pagination": { "cursor", "hasMore", "limit" } }
```

Always-array `data`, never null -- correct. No `totalCount` -- correct (KV can't support it cheaply, and YAGNI applies). The CaptureSummary field projection is well-scoped: status-conditional fields are reasonable because the conditions map directly to the user's conceptual model of capture lifecycle.

**Cursor design:** Wrapping KV's native cursor in a custom envelope (`{"kv":"<native>"}`) is the right call. Clients see an opaque string. The envelope adds migration insulation without exposing internals. Cognitive load on API consumers is zero -- they just pass the cursor back.

**Status filtering with over-fetch:** The over-fetch strategy (fetch `limit * 3`, max 3 iterations, scan cap of 500) is a known limitation traded for simplicity. The plan documents this and commits to returning `hasMore: true` if the scan budget exhausts. This is acceptable for MVP and the behavior is honest -- users won't be silently shortchanged without indication.

**Note field (Task 3):** Changing the note from a warning ("Store the capture ID -- it is the only way to access this capture") to a capability pointer ("Use GET /v1/captures to list and search your captures") is exactly right. The old note created anxiety. The new note is actionable and forward-pointing. The field stays required in the schema, which is correct -- removing it would be a breaking change.

---

### Simplification

The plan has already made the right simplification calls:

- No `totalCount` (YAGNI, KV doesn't support it cheaply)
- No reverse-timestamp encoding (ascending is fine, complexity cost not worth it)
- No separate cursor module (keep encode/decode in `kv.js`)
- No dedicated rate limiter for the list endpoint (reuse existing)
- No `requireAuth()` wrapper yet (inline is fine at 2 endpoints)
- No per-status secondary indexes (in-memory filtering is good enough)
- No `404` for empty results -- `200` with empty array is the right call for collection endpoints

Each of these is defensible and each matches the Helix manifesto's KISS/YAGNI bias. I would have made the same calls.

One observation, not a blocker: the status filter over-fetch behavior (scan depth limit of 500, max 3 iterations) introduces some complexity in `listCaptures`. The plan justifies it as bounded cost. At current scale this is fine. If this becomes a support burden later, the right fix is D1 (already in the roadmap as R12), not papering over KV's limitations.

---

### Jobs-to-be-Done

Every user-facing deliverable serves a real job:

| Deliverable | Job served |
|---|---|
| `GET /v1/captures` | Find captures I created, recover IDs I didn't save |
| Status filter | Check what's still processing vs. done vs. failed |
| Cursor pagination | Browse a large capture history without loading everything |
| Updated 202 note | Immediately know how to find this capture later |
| README dual-access framing | Understand when to use the API key vs. the capture ID |
| OpenAPI spec update | Integrate the endpoint without guessing the contract |

Nothing in the plan is speculative. Every feature maps to a documented limitation being resolved.

---

### Minor Observations (no action required)

1. **Ascending sort order:** The plan acknowledges oldest-first is "acceptable for MVP" and notes it can change with D1. From a user perspective, newest-first is the more natural default for a "browse my captures" interface -- most users want their recent captures first. This is worth flagging for R12, but KISS wins for now and the plan is honest about it.

2. **Pre-R1 captures invisible in listings:** The README and OpenAPI spec are instructed to document this. Make sure the language is explicit enough that users who created captures before this feature deployed don't assume they're lost. Something like "captures created before [feature date] are still accessible by ID but do not appear in list results" is clearer than "older captures remain accessible via direct ID."

3. **README example (Task 3):** The plan asks for a curl example with a sample paginated response. Keep the sample response minimal -- show one item in `data`, not a full capture record. The goal is to show the envelope shape, not enumerate every field.

These are editorial notes for Task 3 execution, not blockers.

---

### Summary

The plan is well-reasoned, correctly scoped, and respects KISS throughout. The API contract is clean. The documentation changes in Task 3 close the known user pain point (lost captures) and introduce a clear mental model for the dual-access pattern. No UX concerns warrant holding this plan.

**APPROVE**
