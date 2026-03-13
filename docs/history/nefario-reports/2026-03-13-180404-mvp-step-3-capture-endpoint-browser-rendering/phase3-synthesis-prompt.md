MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task

Build a capture endpoint with isolated browser rendering and KV-backed status tracking for a Cloudflare Worker. GitHub Issue #3.

Key requirements:
- POST /v1/captures: validate URL, check API key, return 202
- Browser Rendering: screenshot (PNG) and rendered HTML
- Browser isolation: incognito context, 30s timeout, 50MB page limit, 200 subresource cap
- HTTP response headers via separate fetch
- KV status: pending -> complete/failed
- GET /v1/captures/{id}/status
- Platform rate limiting (~10/min)
- Capture ID: cap_ + crypto.randomUUID() hyphens stripped

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-edge-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-data-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-software-docs-minion.md

## Key consensus across specialists:

### security-minion
- DNS-pinned fetch NOT feasible (TLS-SNI mismatch) -- use validated URL with redirect:'manual'
- Timing-safe key comparison via crypto.subtle.timingSafeEqual
- try/finally for browser context destruction
- Request interception to block private-IP redirects (partial TOCTOU closure)
- Security headers: Referrer-Policy, Cache-Control on status responses
- Flag: captured HTML as XSS vector when served (Step 5 concern, document now)

### api-design-minion
- Absolute status URL in 202 body; fields: id, statusUrl, note
- Status response: minimal { status } with state-conditional fields (captureUrl on complete, detail on failed)
- Direct pass-through of validateUrl errors (no transformation)
- Retry-After on 429 only, skip X-RateLimit-* for MVP

### edge-minion
- puppeteer.launch(env.BROWSER), createBrowserContext(), newPage()
- Enforce limits via request interception counters (50MB/200 subresources)
- ctx.waitUntil has 30s HARD LIMIT -- structure code for easy Queue migration
- Rate limiting via [[ratelimits]] in wrangler.toml; concurrency limiting not available
- Workers cannot fetch bare IPs

### data-minion
- Namespaced KV keys: capture:{captureId}
- Full metadata object: { status, url, ip, createdAt, captureId }, enriched on completion
- 24h TTL on pending records (self-cleaning stuck captures)
- Write KV synchronously BEFORE returning 202 (fail with 500 if KV write fails)
- Store artifacts in R2 under captures/{captureId}/ during Step 3

### test-minion
- Browser binding is real Chrome, not mock -- must make renderer injectable
- Use createExecutionContext + waitOnExecutionContext for async testing
- Follow existing patterns: SELF.fetch for integration, direct imports for unit
- Use fetchMock from cloudflare:test for outbound requests
- 6 test files recommended

### ux-strategy-minion
- note field + Retry-After:5 header on 202
- Failed status needs error string + retryable boolean
- No ID recovery mechanism (YAGNI) -- list endpoint is the right fix

### software-docs-minion
- Contract-first OpenAPI spec (write before implementation)
- Model RFC 9457 as shared schema component
- Capture ID regex: ^cap_[a-f0-9]{32}$
- Evolution log + backlog update mandatory

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase3-synthesis.md`

## Execution Context

Codebase details for task prompts:
- Working directory: /Users/ben/github/benpeter/web-resource-ledger
- src/index.js: route table pattern with [method, regex, handler] tuples
- src/url-validation.js: validateUrl(rawUrl, resolvers) -> { ok, url, ip } | { ok, status, detail }
- src/responses.js: problemResponse(status, detail), jsonResponse(body, status, headers)
- wrangler.toml: bindings BUCKET (R2), KV, BROWSER
- vitest.config.js: defineWorkersConfig with miniflare browserRendering
- test/: existing tests use SELF.fetch for integration, direct imports for unit
- package.json: vanilla JS, vitest, @cloudflare/vitest-pool-workers, wrangler
- CLAUDE.md: Helix Manifesto (YAGNI, KISS), vanilla JS preferred, evolution log mandatory
