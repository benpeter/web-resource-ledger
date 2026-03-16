Implement three issues combined into one PR:

## Issue #33: R3: CORS for capture POST endpoint

**Outcome**: Browser extensions and web applications can call the capture API via proper CORS preflight handling, unblocking browser-based integrations.

**Success criteria**:
- OPTIONS preflight requests return correct CORS headers for configured origins
- Origin allowlist is configurable via environment variable
- Default is empty (no cross-origin access) -- NOT wildcard
- `Access-Control-Allow-Headers` and `Access-Control-Allow-Methods` set correctly
- Existing retrieval GET endpoints (already using `*`) are unaffected
- Tests cover: allowed origin, disallowed origin, missing origin, preflight caching

**Scope**:
- In: OPTIONS handler for capture POST, configurable origin allowlist (env var), CORS headers on POST responses, tests
- Out: CORS on other endpoints (already handled), OAuth/cookie-based auth, browser UI

## Issue #34: R4: HSTS preload submission

**Outcome**: SSL-stripping attacks on first visit are mitigated for all browsers that ship the HSTS preload list, completing the HTTPS enforcement chain.

**Success criteria**:
- HSTS header includes `preload` directive: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- Domain submitted and accepted at hstspreload.org
- No mixed-content issues on any served page

**Scope**:
- In: One header change, hstspreload.org submission
- Out: Other security headers, CSP changes

## Issue #35: R5: X-RateLimit-Limit response header

**Outcome**: API clients can discover their rate limit budget from response headers without reading documentation.

**Success criteria**:
- All rate-limited endpoints return `X-RateLimit-Limit` header with the static ceiling value
- Header value sourced from config (not hardcoded)
- No `X-RateLimit-Remaining` or `X-RateLimit-Reset` headers (Cloudflare rate limiter binding does not expose remaining tokens -- inaccurate headers are worse than none)

**Scope**:
- In: Add one header to three rate-limited handlers, static value from config
- Out: Remaining/reset headers (blocked by rate limiter binding API), custom token-bucket implementation

---
Additional context: Combine all three in one PR. Skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. Skip compaction checkpoints. Auto-create the PR at wrap-up without halting. Write process.md in evolution log directory. Evolution entry: 0019-cors-hsts-ratelimit.
