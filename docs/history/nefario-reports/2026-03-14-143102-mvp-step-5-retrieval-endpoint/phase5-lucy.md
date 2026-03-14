# Lucy -- MVP Step 5 Code Review

## Intent Verification

**Original request**: Issue #5 -- retrieval endpoint. Add `GET /v1/captures/{id}` (metadata + artifact links) and `GET /v1/captures/{id}/artifacts/{name}` (raw artifact download).

**Plan alignment**: The code delivers exactly these two endpoints, plus the `httpMetadata` fix on `rendered.html` R2 put and the lifecycle smoke test. OpenAPI spec extended to match. No scope creep detected -- every changed file traces to the stated requirement.

### Traceability

| Requirement | Plan element(s) |
|---|---|
| GET metadata endpoint | `src/index.js:handleGetCapture` (L121-162), route table L16, `openapi.yaml` L499-568 |
| GET artifact download | `src/index.js:handleGetCaptureArtifact` (L164-215), route table L17, `openapi.yaml` L570-633 |
| CaptureRecord schema | `openapi.yaml` L171-215 |
| Problem404 response | `openapi.yaml` L241-264 |
| XSS prevention (text/plain for HTML) | `src/index.js:191`, `src/capture.js:74-77` (httpMetadata), `openapi.yaml` CaptureArtifacts description |
| Tests for new endpoints | `test/capture-retrieval.test.js` (14 tests), `test/capture-integration.test.js` lifecycle test |

No stated requirement is missing from the plan. No plan element lacks a requirement trace.

---

## VERDICT: ADVISE

### FINDINGS

- [NIT] `src/index.js`:203 -- `obj.arrayBuffer()` reads the entire artifact into Worker memory before responding. For large screenshots or WACZ bundles this is fine within current limits (50MB page cap, typical WACZ ~200KB), but `obj.body` (a ReadableStream) would avoid the copy and stream directly. Not a bug at current scale -- flagging for awareness.
  AGENT: implementation-minion
  FIX: Replace `const buffer = await obj.arrayBuffer(); return new Response(buffer, ...)` with `return new Response(obj.body, ...)`. The `Content-Length` can still come from `obj.size`.

- [ADVISE] `test/capture-retrieval.test.js` -- No test verifies `Access-Control-Allow-Origin: *` on either new endpoint. Both `handleGetCapture` (L159-161) and `handleGetCaptureArtifact` (L212) set this header. The metadata endpoint also sets `Cache-Control: private, no-store` which is tested, but the CORS header is not. Artifact responses lack a CORS header assertion entirely.
  AGENT: implementation-minion
  FIX: Add assertions like `expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')` in the existing "200 with correct shape" test and one of the artifact tests.

- [NIT] `test/capture-retrieval.test.js` -- No test for the `Cache-Control: public, max-age=31536000, immutable` header on artifact responses. This is a security-relevant caching decision (artifacts are immutable, but the cache header is aggressive). Worth verifying.
  AGENT: implementation-minion
  FIX: Add `expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')` to one of the artifact tests.

- [NIT] `src/index.js`:126 -- `handleGetCapture` returns 404 for both non-existent captures and pending/failed captures (`record.status !== 'complete'`). This is a deliberate design choice (documented in the OpenAPI spec: "Returns 404 if the capture does not exist or has not yet completed"). The behavior is correct but callers cannot distinguish "does not exist" from "still in progress" at this endpoint -- they must use the `/status` endpoint for that. The OpenAPI description is accurate. No action needed, noting for completeness.
  AGENT: N/A (design observation)
  FIX: None required.

- [NIT] `openapi.yaml`:248-250 -- `Problem404` response includes a `Cache-Control: no-store` header in the spec, but the actual 404 responses from `handleGetCapture` and `handleGetCaptureArtifact` pass `{ 'Cache-Control': 'no-store' }` to `problemResponse` which becomes a response header. The global 404 fallback in the router (L41) does NOT set `Cache-Control`. This is acceptable since the global 404 is for unknown routes (static, not enumerable), while the retrieval 404s protect capture ID guessing. Consistent.
  AGENT: N/A (design observation)
  FIX: None required.

### CLAUDE.md Compliance

- **Engineering philosophy**: YAGNI, KISS, Lean and Mean -- all respected. No unnecessary abstractions, no speculative features. The two handlers are flat functions, no class hierarchy, no middleware framework.
- **Helix Manifesto**: Code is simple, fast, and minimal. The route table pattern is consistent with existing code.
- **JavaScript preferred over TypeScript**: Confirmed -- all code is vanilla JS.
- **No unnecessary dependencies**: No new dependencies introduced.
- **Module system**: ESM throughout, consistent with `"type": "module"` in package.json.

### Backlog Cross-Reference

The `[should]` item "Captured HTML XSS prevention" (Security section) is addressed by this work: HTML artifacts are served as `text/plain` with `Content-Disposition: attachment`. The backlog item should be updated to reflect this. The `[should]` item "CORS configuration" is partially addressed (`Access-Control-Allow-Origin: *` on retrieval endpoints) but the backlog note says "verification endpoint should allow `*`, capture endpoint restrict origins" -- the current implementation uses `*` on both retrieval GET endpoints which aligns with the "verification" side. This is fine for MVP.

### Convention Compliance

- File naming: `capture-retrieval.test.js` follows existing kebab-case convention in `test/`.
- Test organization: Tests are in `test/` directory, consistent with existing pattern.
- Route table: New routes follow the existing one-line tuple convention.
- Security comments: Present and accurate (SECURITY annotations on L117-119, L170, L191).
- Error responses: RFC 9457 problem responses, consistent with existing endpoints.
