MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
## Goal
A working capture endpoint with isolated browser rendering and status tracking.

## Context
URL validation module exists (Step 2 complete). This step adds the capture endpoint, headless browser rendering, and KV-backed status tracking. The capture lifecycle begins here.

## Work Items
- [ ] `POST /v1/captures`: validate URL via Step 2 module, check `Authorization: Bearer <key>` header (401 if missing or wrong), return 202 Accepted
- [ ] API key read from `CAPTURE_API_KEY` environment variable (set as wrangler secret)
- [ ] Capture ID generated as `cap_` + `crypto.randomUUID()` with hyphens stripped
- [ ] Browser Rendering: navigate to DNS-pinned IP from pre-resolution, capture full-page screenshot (PNG) and rendered HTML
- [ ] Browser isolation: fresh incognito context per capture, 30s timeout, 50MB page limit, 200 subresource cap, context destroyed after completion
- [ ] HTTP response headers captured via a separate Workers `fetch` call to the same DNS-pinned URL
- [ ] Capture status written to KV as `pending` on accept, updated to `complete` or `failed` on resolution
- [ ] `GET /v1/captures/{id}/status` reads KV and returns `{ "status": "pending"|"complete"|"failed" }`
- [ ] RFC 9457 404 returned from status endpoint for unknown capture IDs
- [ ] 202 response body includes capture ID and status URL; body must state caller is responsible for preserving the capture ID
- [ ] Platform rate limiting configured (~10 captures/min, ~3 concurrent per IP) via wrangler.toml or Cloudflare dashboard

## Acceptance Criteria
- `POST /v1/captures` with valid API key returns 202 with capture ID and status URL
- `POST /v1/captures` with missing or invalid API key returns 401
- `GET /v1/captures/{id}/status` returns `{ "status": "pending" }` immediately after submission
- `GET /v1/captures/{id}/status` eventually returns `{ "status": "complete" }` after processing
- `GET /v1/captures/{id}/status` returns RFC 9457 404 for unknown IDs

## Dependencies
- Blocked by: #2
- Blocks: #4

## Technical Notes
- Rate limiting MUST be implemented via the Cloudflare platform (wrangler.toml rules or Cloudflare dashboard), NOT custom application code
- Capture ID MUST use `crypto.randomUUID()`, NOT `Math.random()` or timestamps
- The 202 response must explicitly note that the caller is responsible for preserving the capture ID
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## Codebase Context
This is a Cloudflare Worker project ("wrl") using vanilla JS (no framework). Key existing files:
- `src/index.js` -- main Worker entry point with route table pattern
- `src/url-validation.js` -- SSRF prevention module with `validateUrl()` export
- `src/responses.js` -- `problemResponse()` (RFC 9457) and `jsonResponse()` helpers
- `wrangler.toml` -- already has R2 bucket (BUCKET), KV namespace (KV), and Browser binding (BROWSER) configured
- `test/` -- Vitest tests using @cloudflare/vitest-pool-workers
- `package.json` -- minimal deps: wrangler, vitest, @cloudflare/vitest-pool-workers

The project follows the Helix Manifesto (YAGNI, KISS, lean). Vanilla JS preferred over frameworks.

## External Skill Discovery
No project-local skills (.claude/skills/ or .skills/) were found in the working directory.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase1-metaplan.md`
