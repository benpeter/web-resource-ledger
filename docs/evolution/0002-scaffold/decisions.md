# 0002: Scaffold Decisions

Decisions made during the first implementation step. Each entry: what was decided, why, and what was rejected.

## Error API: `problemResponse(status, detail, headers?)`

- **Decision**: Two-parameter signature with optional headers. Type is always `about:blank`. Title is auto-derived from a status code lookup table.
- **Why**: Callers only provide the two things that vary per call site (status + detail). Auto-derived titles prevent inconsistency across 8 implementation steps. The `headers` parameter handles 405 `Allow` and 503 `Retry-After` cleanly.
- **Rejected**: Four-parameter `problemResponse(status, type, title, detail)` (api-design-minion) -- forces every call site to pass the "correct" type slug and title, creating two consistency hazards with no enforcement. Also rejected `about:blank#not-found` fragments -- adds a namespace nobody consumes.

## Static 404 Detail Message

- **Decision**: Fallback 404 returns `'The requested resource does not exist.'` -- a static string.
- **Why**: Security review flagged CWE-209 (information disclosure). The original plan reflected `request.method` and `url.pathname` into the error body. More importantly, this is Step 1 of 8 -- every subsequent step would copy the pattern. Fixing the convention now costs one line; fixing it later means auditing every error call site.
- **Rejected**: `No route matches ${request.method} ${url.pathname}` -- leaks internal routing details, contradicts the "never leak internals" convention documented in responses.js.

## Version Pinning: Exact for All Dependencies

- **Decision**: All three devDependencies pinned to exact versions (no caret, no tilde). `vitest: "3.2.4"`, `@cloudflare/vitest-pool-workers: "0.12.21"`, `wrangler: "4.73.0"`.
- **Why**: Security review noted that wrangler has Cloudflare account write access and `.dev.vars` read access -- it deserves the same supply chain protection as test tools. The synthesis originally used `^4.73.0` for wrangler while pinning vitest exactly; security-minion called out the inconsistency.
- **Rejected**: Caret ranges for wrangler (`^4.73.0`) -- inconsistent with the stated rationale for pinning vitest.

## Version Fallback: vitest 3.2.4 over 4.1.0

- **Decision**: Fell back from vitest@4.1.0 + pool-workers@0.13.0 to vitest@3.2.4 + pool-workers@0.12.21.
- **Why**: The primary versions (day-zero releases) failed with an export resolution error -- `@cloudflare/vitest-pool-workers@0.13.0` does not export `./config` when paired with vitest@4.1.0. The fallback was documented in the plan and took 30 seconds to apply.
- **Rejected**: Debugging the export resolution issue (unknown timeline, zero benefit for a greenfield project with a working fallback).

## Response Helpers: Single `src/responses.js`

- **Decision**: Both `problemResponse` and `jsonResponse` in one module.
- **Why**: Two functions, one concern (response construction). Two separate files for two small functions is over-decomposition.
- **Rejected**: Separate `src/errors.js` and `src/response.js` (api-design-minion proposed splitting them).

## Route Dispatch: Array-of-Tuples with Regex

- **Decision**: `const routes = [['GET', /^\/health$/, handleHealth]]` -- one line per route, first match wins.
- **Why**: Scales linearly with zero structural changes as Steps 2-8 add routes. No router library needed. The regex approach handles path parameters via capture groups (`match[1]`).
- **Rejected**: Router library (YAGNI -- 8 routes total), `if/else` chain (works for 1 route but doesn't scale as cleanly), URL pattern API (not available in workerd).
