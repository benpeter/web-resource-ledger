# Margo -- Complexity & YAGNI Review

## Verdict: APPROVE

This plan is proportional to the problem. Three small header-level changes to a single Cloudflare Worker, implemented in four well-scoped tasks. No new services, no new dependencies, no framework additions, no speculative infrastructure. The complexity budget is minimal.

## Positive Observations

1. **HSTS (R4) is literally a one-line change.** No over-engineering possible. Good.

2. **CORS (R3) is correctly scoped.** OPTIONS handler is path-specific (only `/v1/captures`), not a generic CORS middleware. `getCorsHeaders()` is a plain function, not a class or abstraction layer. Env var parsing at request time avoids startup machinery. Fail-closed default (empty allowlist = no CORS). This is the KISS approach.

3. **Rate limit header (R5) is minimal.** One small config file (`src/rate-limits.js`), one helper function (`getRateLimitGroup`), one header set. No elaborate header middleware, no rate-limit state exposure.

4. **No new dependencies.** All implementation is vanilla JS in the existing worker.

5. **Task count (4) is proportional** to the request (3 issues): one implementation, one test, one spec update, one evolution log. No task inflation.

6. **"What NOT to do" lists are sharp.** The plan explicitly blocks the most common over-engineering temptations: no X-RateLimit-Remaining/Reset, no global OPTIONS catch-all, no wildcard CORS, no env vars for rate limit values, no separate miniflare configs. These are exactly the YAGNI guardrails I would have flagged if missing.

## Minor Observations (non-blocking)

1. **`src/rate-limits.js` as a separate file.** For a 5-line constant, inlining it at the top of `index.js` would be simpler (one fewer file, one fewer import). However, the plan's rationale is sound -- the test files can import the constant for assertion values, avoiding magic numbers in tests. The tradeoff is reasonable. Not blocking.

2. **`getRateLimitGroup()` uses two regex matches** (`pathname.match(/^\/v1\/verify\//)` and `pathname.match(/^\/\.well-known\/signing-key/)`) when `pathname.startsWith()` would be simpler and faster. Trivial, but if the implementer notices, `startsWith` is preferable. Not blocking.

3. **OpenAPI version bump to 0.3.0** for header additions is arguably generous (0.2.1 would suffice for additive, non-breaking changes), but this is a documentation choice, not a complexity concern.

## Complexity Budget Tally

| Item | Cost (Managed/Serverless) |
|---|---|
| New file: `src/rate-limits.js` | 0.5 (trivial config) |
| New file: `test/cors.test.js` | 0 (tests are free) |
| New helper functions (2) | 0.5 |
| Env var: CORS_ORIGINS | 0.5 |
| **Total** | **1.5** |

Well within budget for three features. No concerns.
