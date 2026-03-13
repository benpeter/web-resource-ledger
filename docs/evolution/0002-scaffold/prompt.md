# 0002: Project Scaffold and Cloudflare Worker

The first implementation step. Everything before this was planning and
documentation. This is where code starts.

## Prompt

```
/nefario #1
```

Which resolved to GitHub Issue #1:

> **MVP Step 1 — Project Scaffold and Cloudflare Worker**
>
> A Worker that responds to HTTP requests with health check passing in
> wrangler dev and deployed. This is the foundation — nothing exists yet.
> Establishes the project scaffold, test infrastructure, and shared error
> utilities that all subsequent steps build on.
>
> Work Items:
> - wrangler.toml with Worker name, R2 bucket binding, KV namespace binding,
>   and Browser Rendering binding
> - Vanilla JS Worker entry point with minimal route dispatch (method + path
>   matching)
> - GET /health returns { "status": "ok" } with HTTP 200
> - RFC 9457 application/problem+json error response pattern established as
>   shared utility
> - Vitest + @cloudflare/vitest-pool-workers configured so tests run inside
>   the Miniflare runtime
> - Verify wrangler dev starts without errors
> - Verify vitest run passes
>
> Acceptance Criteria:
> - curl http://localhost:8787/health returns HTTP 200 with {"status":"ok"}
> - vitest run passes with at least one test for the health endpoint
> - wrangler dev starts without errors
