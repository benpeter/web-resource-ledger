# Domain Plan Contribution: ux-strategy-minion

## Planning Question
How should the CORS origin allowlist be documented for operators deploying WRL? Is `CORS_ALLOWED_ORIGINS` the right env var name? Should the rate limit header include documentation references?

---

## Recommendations

### 1. CORS_ALLOWED_ORIGINS env var naming

**Use `CORS_ORIGINS` instead of `CORS_ALLOWED_ORIGINS`.**

Rationale (applying Krug's "don't make me think"):
- The existing env vars in `wrangler.toml` favor terse, scannable names: `CAPTURE_API_KEY`, `SIGNING_KEY`, `CORALOGIX_ENDPOINT`, `APPLICATION_NAME`. None use adjectives.
- `CORS_ALLOWED_ORIGINS` has redundant semantics -- CORS *is* an allowlist by definition. The word "allowed" adds zero information and 8 characters.
- `CORS_ORIGINS` scans instantly, matches the project's naming brevity, and is unambiguous.

That said, `CORS_ALLOWED_ORIGINS` is the more common convention in the wider ecosystem (Fastly, Django, many Node frameworks). The recognition advantage (Nielsen #4: consistency with the system) slightly favors it. Either works. The key recommendation: **pick one and document it clearly with an example value, not just a description.**

### 2. CORS env var should be a `[vars]` entry, not a secret

CORS origins are not credentials. They should live in `wrangler.toml` under `[vars]` alongside `CORALOGIX_ENDPOINT` and `APPLICATION_NAME`, not in `.dev.vars` or `wrangler secret`. This matches the existing pattern and makes the configuration visible, auditable, and diffable in version control.

Default value recommendation: **no default (empty/absent = CORS disabled)**. This is the safe, YAGNI default. Operators who don't need browser access don't encounter CORS at all. Operators who do need it get a clear error state (browser shows a CORS error) that is easily diagnosed by checking the README.

### 3. Documentation location and format

**The target user is a developer setting up WRL who wants browser extensions to call the API.** Their JTBD: "When I'm integrating WRL into my browser extension, I want to configure CORS so the browser doesn't block my requests, so I can ship my extension without a proxy server."

The friction log for this user currently looks like:
1. They write a `fetch()` call from their extension
2. The browser blocks it (no CORS headers on POST)
3. They search the README for "CORS" -- **no results today**
4. They search the code or open an issue
5. They discover they need an env var, guess the format, deploy, hope

To eliminate steps 3-5, document CORS in two places:

**a) README.md, in the Setup section (between step 5 and step 6):**

A numbered step, parallel to CAPTURE_API_KEY and SIGNING_KEY, following the exact same pattern (generate value, set production var, set local dev var). Example:

```
### 5b. Configure CORS (optional)

If browser-based clients (extensions, web apps) will call the API, set
the allowed origins. Without this, only server-to-server calls work.

In `wrangler.toml` under `[vars]`:

    CORS_ORIGINS = "https://my-extension-id.chromiumapp.org,https://my-app.example.com"

Comma-separated, no trailing slashes, no wildcards. Each entry is matched
exactly against the request's Origin header.
```

**b) In the `[vars]` block of `wrangler.toml` itself, as a comment:**

```toml
[vars]
# Comma-separated origins allowed for CORS preflight (browser clients).
# Omit or leave empty to disable CORS. No wildcards.
# CORS_ORIGINS = "https://my-extension.example.com"
```

This is the real documentation -- `wrangler.toml` is the config file operators edit. A commented-out example with a one-line explanation is the highest-signal, lowest-friction documentation possible. The README amplifies; the config file is the source.

### 4. No wildcard `*` support in the allowlist

The current code already uses `Access-Control-Allow-Origin: *` on read-only endpoints (verification, signing keys, artifacts). The new CORS configuration is specifically for the capture POST endpoint, which requires authentication. Wildcard origins on authenticated endpoints are a footgun -- they enable credential leaks in misconfigured browsers. The env var should accept only explicit origins. If an operator sets `*`, reject it at startup (or first request) with a clear log message.

### 5. Rate limit header: `X-RateLimit-Limit` -- keep it simple, no Link header

**Do not add a Link header pointing to API docs.** Reasons:

- **Nielsen #8 (aesthetic and minimalist design)**: every header byte is a permanent tax on every response. A Link header to docs serves the 1% of developers who are debugging rate limits for the first time, at the cost of bandwidth on 100% of responses.
- **JTBD mismatch**: when a developer hits a rate limit, they want to know the ceiling and when they can retry. `X-RateLimit-Limit: 10` + `Retry-After: 60` tells them everything. A Link header to docs answers a question they're not asking in that moment -- they can find docs on their own.
- **Progressive disclosure**: the README already documents rate limits (`Captures are rate-limited to 10 per minute per IP`). The OpenAPI spec documents them formally. The header is the third layer -- it should be the simplest (a number), not the most comprehensive.
- **Established convention**: `X-RateLimit-Limit` as a bare integer is the de facto standard (GitHub API, Stripe, Twitter/X). Adding non-standard companion headers (Link, X-RateLimit-Policy, etc.) breaks developer expectations and adds cognitive load.

The `X-RateLimit-Limit` value should come from the same config that defines the limit (currently hardcoded in `wrangler.toml` rate limiter bindings). Since the rate limits are set in `wrangler.toml` as `simple = { limit = 10, period = 60 }`, the header value can be derived at deploy time as a `[vars]` entry or hardcoded in the handler since it mirrors the binding config. Recommendation: hardcode in the handler, co-located with the rate limit check, with a comment referencing the `wrangler.toml` binding. This is simpler than adding another env var (YAGNI), and the values are already hardcoded in the binding config anyway.

### 6. HSTS preload: invisible and correct

Adding `preload` to the existing `Strict-Transport-Security` header is a zero-UI-impact change. The current header is:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

It becomes:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

No documentation change needed for this -- operators don't configure HSTS; it's always on. The only operator-facing action is submitting the domain to `hstspreload.org` after deployment, which belongs in the evolution log outcome, not the README.

### 7. OPTIONS preflight response shape

The OPTIONS preflight handler should return:
- `204 No Content` (not 200 -- it's not a successful resource fetch)
- `Access-Control-Allow-Origin: <the matched origin>` (echo the specific origin, not `*`, since credentials may be involved)
- `Access-Control-Allow-Methods: POST`
- `Access-Control-Allow-Headers: Authorization, Content-Type`
- `Access-Control-Max-Age: 86400` (cache preflight for 24 hours -- reduces per-request friction for extensions making repeated captures)
- The same global security headers (HSTS, X-Content-Type-Options, etc.) that every other response gets

The preflight must NOT trigger rate limiting or auth checks. Browsers send OPTIONS automatically; rate-limiting them would create silent, confusing failures (the POST never fires, no error is visible to the developer's application code).

---

## Proposed Tasks

1. **Add `CORS_ORIGINS` to `wrangler.toml` `[vars]` as a commented-out example** -- with one-line explanation. Mirror in `[env.staging.vars]`.

2. **Add CORS setup step to README.md** -- numbered step 5b between signing key and deploy, following the exact pattern of existing steps (production command + local dev equivalent + security note).

3. **Implement OPTIONS handler for `/v1/captures`** -- 204, no rate limit, no auth, proper CORS headers. Route it before the POST handler in the routes table.

4. **Add `Access-Control-Allow-Origin` to POST `/v1/captures` responses** -- echo the matched origin from the allowlist (not `*`). Apply to both success (202) and error responses when the request Origin matches.

5. **Append `; preload` to the HSTS header** -- one-line change in `index.js`.

6. **Add `X-RateLimit-Limit` header to all 429 responses** -- hardcoded values matching `wrangler.toml` bindings, with a code comment noting the coupling.

7. **Consider adding `X-RateLimit-Limit` to *all* responses from rate-limited endpoints** -- not just 429s. This lets developers see the ceiling before they hit it. GitHub, Stripe, and most major APIs do this. Adds one header per response; negligible cost, high diagnostic value.

8. **Update `openapi.yaml`** -- document the OPTIONS route, CORS response headers, `X-RateLimit-Limit` header, and updated HSTS value.

---

## Risks and Concerns

### Low risk: CORS env var format confusion
Comma-separated strings are fragile -- a trailing comma, a space after the comma, or a trailing slash on an origin will silently fail to match. **Mitigation**: trim each value, strip trailing slashes, and log a warning at startup (or first request) if any entry looks malformed (contains a path, has a trailing slash, etc.).

### Low risk: Rate limit header / binding config drift
If someone changes the rate limit in `wrangler.toml` but forgets to update the `X-RateLimit-Limit` value in the handler, the header will lie. **Mitigation**: either derive the value from the binding config programmatically (if the Cloudflare rate limiter exposes its config -- it may not), or add a code comment making the coupling explicit. This is an acceptable tradeoff for a single-operator project. The alternative (another env var) adds configuration surface for marginal benefit.

### Zero risk: HSTS preload
This is a one-way commitment -- once a domain is on the preload list, removing it takes months. This is fine for WRL (HTTPS-only is a permanent requirement for a cryptographic evidence service). Just make sure the domain is ready before submitting to `hstspreload.org`.

### Medium risk: Not applying CORS headers to error responses
A common CORS implementation bug: CORS headers are added to success responses but not to error responses (401, 400, 429). When the browser gets a 401 without CORS headers, it reports a CORS error, not a 401 -- the developer sees the wrong error. **Mitigation**: CORS headers must be applied in the global response pipeline (where HSTS and other headers are set), not inside individual handlers.

---

## Additional Agents Needed

None specifically for the UX strategy aspects. The implementation is straightforward and the security-minion should validate the CORS allowlist enforcement and the decision not to allow wildcard origins on the authenticated endpoint.
