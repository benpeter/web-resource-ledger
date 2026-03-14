GitHub Issue #5: MVP Step 5: Retrieval Endpoint

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

---
Additional context: use sonnet throughout as the model for agents
