# Outcome: Retrieval Endpoint

## What Was Built

Two new route handlers completing the capture lifecycle (POST -> poll -> retrieve):

- `GET /v1/captures/{id}` -- returns JSON metadata with worker-proxied artifact
  URLs for complete captures
- `GET /v1/captures/{id}/artifacts/{name}` -- proxies R2 artifact bytes with
  correct Content-Type, Content-Disposition, and Cache-Control headers

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/index.js` | +2 route entries, +2 handler functions | +102 |
| `src/capture.js` | httpMetadata on rendered.html R2 put | +7/-1 |
| `openapi.yaml` | CaptureRecord, CaptureArtifacts, WaczInfo, Problem404 schemas; 2 GET paths | +274/-11 |
| `test/capture-retrieval.test.js` | New: 14 retrieval tests (8 metadata + 6 artifact) | +157 |
| `test/capture-integration.test.js` | +1 lifecycle smoke test | +49 |

Total: 5 files, +578/-11 lines, 3 commits.

## Test Results

230/230 tests pass (215 existing + 15 new). No regressions.

## Security Properties

- HTML artifacts served as `text/plain` with `Content-Disposition: attachment`
  (stored-XSS prevention)
- No KV record spreading into responses (explicit field mapping only)
- `ip` field never exposed in any response
- R2 keys never exposed in any response
- Static 404 message for all non-200 cases (anti-enumeration)
- `Cache-Control: no-store` on all error responses
- Timing side-channel accepted and documented (capture-ID-as-access-secret model)

## What Deviated from Plan

1. **arrayBuffer() instead of streaming**: The plan called for `obj.body`
   (ReadableStream) from R2. The test agent discovered this doesn't work in
   the workerd test runner. Switched to `await obj.arrayBuffer()`. The code
   works correctly in production (streaming would also work there), but tests
   require buffering. Flagged for backlog.

2. **No Phase 8 documentation**: The documentation phase was skipped because
   the OpenAPI spec (Task 3) IS the API documentation, and the README already
   points to it. No additional docs were needed.

## Code Review Findings (NITs, not blocking)

- Weak test assertions (`toBeTruthy` vs exact values on `url` and `completedAt`)
- Missing CORS header assertions on new endpoints
- Missing `Cache-Control` assertion on artifact 200 responses
- Missing pending-capture 404 test on metadata endpoint (artifact endpoint has one)
- `arrayBuffer()` should become `obj.body` streaming for large artifacts

All documented as non-blocking NITs by reviewers. No code changes made for
NITs -- they represent test coverage improvements for a future iteration.

## Backlog Changes

- **Updated**: "Captured HTML XSS prevention" -- now partially addressed.
  HTML artifacts served as `text/plain` with `Content-Disposition: attachment`
  at both write time (R2 httpMetadata) and serve time (Worker headers).
- **Updated**: "CORS configuration" -- retrieval GET endpoints use `*`, consistent
  with the "verification endpoint should allow `*`" backlog note.
- **Added**: "R2 artifact streaming" -- switch `arrayBuffer()` to `obj.body`
  ReadableStream when workerd test runner supports it or when large WACZ
  bundles (>10MB) become common.
