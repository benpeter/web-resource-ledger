MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
<github-issue>
## Goal
Complete capture lifecycle — submit, poll, retrieve.

## Context
WACZ bundles are signed and stored in R2, metadata in KV (Step 4 complete). This step adds the retrieval endpoint that closes the lifecycle: a caller can now submit, poll, and retrieve a complete capture.

## Work Items
- [ ] `GET /v1/captures/{id}`: KV lookup returns capture metadata plus artifact links
- [ ] Artifacts served from R2 with correct `Content-Type` and `Content-Length` headers
- [ ] RFC 9457 404 returned for unknown capture IDs
- [ ] Response time target: <300ms from KV read to response
- [ ] Integration smoke test: POST capture -> poll status until complete -> GET capture -> assert metadata fields present and artifact URLs reachable

## Acceptance Criteria
- `GET /v1/captures/{id}` returns capture metadata with artifact URLs for a known capture ID
- `GET /v1/captures/{id}` returns RFC 9457 404 for an unknown capture ID
- Response time is under 300ms (KV read is the bottleneck; no computation should be on the hot path)

## Dependencies
- Blocked by: #4
- Blocks: #6, #7

## Technical Notes
- KV read latency is typically <10ms at the edge — the 300ms target should be comfortable; avoid any synchronous computation in the response path
- Artifact links can be direct R2 public URLs or pre-signed URLs depending on bucket access policy — document the choice
- This is the first endpoint with no authentication — the capture ID acts as the access secret; document this in the response schema
</github-issue>

---
Additional context: use sonnet throughout as the model for agents

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-r7Tpjg/mvp-step-5-retrieval-endpoint/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-r7Tpjg/mvp-step-5-retrieval-endpoint/phase2-api-spec-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-r7Tpjg/mvp-step-5-retrieval-endpoint/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-r7Tpjg/mvp-step-5-retrieval-endpoint/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-r7Tpjg/mvp-step-5-retrieval-endpoint/phase2-ux-strategy-minion.md

## Key consensus across specialists:

### api-design-minion
Worker-proxied artifact URLs (`/v1/captures/{id}/artifacts/{name}`) — three constraints converge: Content-Type/Length headers, XSS prevention, capture ID as access secret. 5 tasks proposed. Key risk: XSS if HTML served as text/html.

### api-spec-minion
Flat schema with CaptureDetail/CaptureArtifacts/WaczInfo components; worker-proxied URLs; strip `ip` field; shared Problem404 response. 6 tasks proposed.

### security-minion
text/plain + Content-Disposition: attachment for HTML; 122-bit capture ID entropy sufficient; strip ip/R2 keys; Cache-Control: private, no-store; CORS: *; static 404 messages. Set httpMetadata at write time as belt-and-suspenders. 4 tasks proposed.

### test-minion
New test/capture-retrieval.test.js (8 tests) + lifecycle smoke test in capture-integration; Strategy A (direct KV advance, no timing dependency). 3 tasks proposed.

### ux-strategy-minion
Named artifact keys (not array); surface wacz.bundleHash; no note field in retrieval; only 200 for complete captures; single static 404 for all non-200. 5 tasks proposed.

## Key consensus:
1. Worker-proxied artifact URLs (api-design, api-spec, security all agree)
2. Strip `ip` and raw R2 keys from response (all agree)
3. HTML served as text/plain + Content-Disposition: attachment (security, api-design agree)
4. Single static 404 message for all non-200 cases (security, ux-strategy agree)
5. Cache-Control: private, no-store (security, test agree)
6. Named artifact keys, not arrays (ux-strategy, api-design agree)
7. wacz is optional in response (graceful degradation from Step 4)

## Conflict to resolve:
- ux-strategy says "direct R2 URLs" for simplicity (no expiration), but api-design, api-spec, and security all say worker-proxied for header control and XSS prevention. Technical consensus is worker-proxied. Resolve in favor of worker-proxied.

## External Skills Context
No external skills detected

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. If external skills were discovered, include them in the execution plan:
   - ORCHESTRATION skills: create DEFERRED macro-tasks (see Core Knowledge)
   - LEAF skills: list in the Available Skills section of relevant task prompts
   - Apply precedence rules when skills overlap with internal specialists
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-r7Tpjg/mvp-step-5-retrieval-endpoint/phase3-synthesis.md

IMPORTANT: The user has requested "use sonnet throughout as the model for agents". All execution tasks should use model: sonnet. Planning and governance agents (lucy, margo) use opus per protocol.
