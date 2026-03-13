## Goal
A Worker that responds to HTTP requests with health check passing in wrangler dev and deployed.

## Context
This is the foundation. Nothing exists yet. This step establishes the project scaffold, test infrastructure, and shared error utilities that all subsequent steps build on.

## Work Items
- [ ] `wrangler.toml` with Worker name, R2 bucket binding, KV namespace binding, and Browser Rendering binding
- [ ] Vanilla JS Worker entry point with minimal route dispatch (method + path matching)
- [ ] `GET /health` returns `{ "status": "ok" }` with HTTP 200
- [ ] RFC 9457 `application/problem+json` error response pattern established as shared utility
- [ ] Vitest + `@cloudflare/vitest-pool-workers` configured so tests run inside the Miniflare runtime
- [ ] Verify `wrangler dev` starts without errors
- [ ] Verify `vitest run` passes

## Acceptance Criteria
- `curl http://localhost:8787/health` returns HTTP 200 with `{"status":"ok"}`
- `vitest run` passes with at least one test for the health endpoint
- `wrangler dev` starts without errors

## Dependencies
- Blocked by: none
- Blocks: #2

## Technical Notes
- Use plain JavaScript, not TypeScript
- Tests must run inside the Miniflare runtime (via `@cloudflare/vitest-pool-workers`), not in Node
- RFC 9457 error shape: `{ type, title, status, detail }` with `Content-Type: application/problem+json` — establish this as a shared utility now so all subsequent steps use it consistently
