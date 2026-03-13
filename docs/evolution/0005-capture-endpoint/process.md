# 0005: Capture Endpoint Process

## TL;DR

Seven specialist agents planned the capture endpoint across security, API
design, edge computing, data modeling, testing, UX, and documentation domains.
Six architecture reviewers produced 18 advisories (0 blocks). The biggest
conflict -- DNS-pinned fetch for SSRF defense -- resolved itself when
security-minion discovered Workers can't fetch bare IPs. Three reviewers
independently killed the `setRenderer`/`getRenderer` module-scoped state
pattern before it reached implementation. The human overrode one recommendation
(keeping `captureUrl` in complete status) and approved everything else without
changes. Seven execution tasks across five batches produced 6 new files, 4 test
files with 73 new tests (191 total), and one post-execution infrastructure fix.
Single compaction event during the 3+ hour session.

## How the team was assembled

Nefario identified 7 specialists for planning:

- **security-minion**: SSRF defense, auth, browser isolation, request interception
- **api-design-minion**: Response shapes, error taxonomy, status codes
- **edge-minion**: Puppeteer lifecycle, ctx.waitUntil limits, rate limiting config
- **data-minion**: KV schema, TTL strategy, R2 storage patterns
- **test-minion**: Injectable renderer requirement, async testing with cloudflare:test
- **ux-strategy-minion**: 202 acceptance UX, failure status design, ID recovery
- **software-docs-minion**: OpenAPI timing, evolution log requirements

The human approved the team without changes.

For architecture review (Phase 3.5), 5 mandatory reviewers (security-minion,
test-minion, ux-strategy-minion, lucy, margo) plus 1 discretionary
(software-docs-minion, selected because the plan included a contract-first
OpenAPI spec as Task 1). The human approved reviewers without changes.

## What the specialists argued

### The DNS-pinned fetch debate

The most interesting planning conflict was about SSRF defense-in-depth for the
header capture step. Security-minion initially proposed DNS-pinned fetch: resolve
the URL to an IP during validation, then fetch against that IP with a spoofed
Host header. This prevents TOCTOU attacks where DNS re-resolution could point to
a different (internal) host.

Edge-minion shut this down with platform knowledge: Cloudflare Workers cannot
fetch bare IPs (Error 1003), and constructing a URL with the IP as hostname
breaks TLS because the SNI name mismatches the certificate. Security-minion
self-corrected and agreed to use `redirect:'manual'` against the original URL
instead. The consensus was unanimous -- there was no viable DNS-pinning
implementation path on the Workers platform.

This is documented in the backlog as the TOCTOU gap: both the browser rendering
leg and the `captureHeaders` fetch leg re-resolve DNS independently. The risk is
accepted for MVP.

### Injectable renderer vs. module-scoped state

The synthesis plan initially included `setRenderer(fn)`/`getRenderer()` as the
testing injection mechanism for the capture module. Three architecture reviewers
independently flagged this:

- **lucy**: Module-scoped mutable state violates the injectable dependency pattern
  already established by `validateUrl`'s `resolvers` parameter
- **margo**: `setRenderer`/`getRenderer` is over-engineering when a parameter does
  the same thing with less code
- **test-minion**: Workers share V8 isolates across invocations within a deployment;
  test mutations to module state could leak across test runs

The fix was simple: `performCapture(env, url, ip, captureId, renderer = defaultRenderer)`.
The `renderer` parameter defaults to the real Puppeteer renderer and tests inject
a stub. This was incorporated into the task prompts before any code was written.

### captureUrl in complete status

Three reviewers (ux-strategy-minion, margo, software-docs-minion) recommended
removing the `captureUrl` field from the complete status response because it
points to `/v1/captures/{id}` -- an endpoint that doesn't exist yet (Step 5).
Their argument: exposing a non-functional URL erodes API trust.

### ctx.waitUntil() vs. Queue

Edge-minion presented both options with clear trade-offs. `ctx.waitUntil()` gives
30 seconds (25s for navigation + 5s buffer) with zero infrastructure. Queue gives
15 minutes with a consumer Worker, retry policy, and DLQ. Data-minion supported
Queue for reliability. Edge-minion recommended `ctx.waitUntil()` for MVP.

Synthesis resolved in favor of `ctx.waitUntil()` with the code structured for
Queue migration. The Queue path is documented in the backlog.

### Contract-first OpenAPI

Software-docs-minion argued for writing the spec before implementation (Step 3
rather than Step 8). API-design-minion supported this. Margo flagged it as
potential scope creep (adding an approval gate for the spec). The synthesis
included it as Task 1 with a gate, and the human approved.

## How conflicts were resolved in synthesis

Nefario documented 8 conflict resolutions in the synthesis:

1. DNS-pinned fetch: Abandoned (platform constraint)
2. Queue vs. waitUntil: waitUntil for MVP, Queue in backlog
3. Concurrency limiting: Skipped (platform handles it)
4. Rate limiting implementation: Platform-level via wrangler.toml (edge-minion),
   not application-level (data-minion)
5. Error field naming: `error` not `detail` (api-design-minion won over
   test-minion's suggestion of `detail`)
6. ID recovery endpoint: YAGNI (ux-strategy-minion)
7. OpenAPI timing: Step 3 with gate (software-docs-minion won)
8. Security headers scope: Centralized in fetch handler, Cache-Control per-route

## What the human changed at approval gates

### Team gate (Phase 1)
Approved without changes.

### Reviewer gate (Phase 3.5)
Approved without changes.

### Execution plan gate
One override: keep `captureUrl` in complete status response despite 3 reviewers
recommending removal. Rationale: "we're mid-way MVP and there's no risk of trust
erosion with no present users." The reviewers' concern (pointing to a
non-existent endpoint) was valid for a production API but irrelevant at this
stage of the build.

Everything else approved as proposed.

### Task 1 gate (OpenAPI spec)
Approved without changes. The spec was 379 lines covering all 3 endpoints, 6
error responses, and 4 shared schemas.

### Task 4 gate (Capture module)
Approved without changes. All reviewer advisories had been incorporated into the
task prompt.

### Post-execution gates
Both post-execution gates: no phases skipped (all post-execution phases ran).

## What the human chose NOT to intervene on

- The injectable renderer pattern (parameter injection over module-scoped state)
  -- let the reviewer consensus stand
- Rate limiting via wrangler.toml `[[unsafe.bindings]]` rather than application
  code -- trusted edge-minion's platform knowledge
- 24h TTL on pending records -- reasonable self-cleaning mechanism
- Static 404 message (not echoing path parameter) -- straightforward security
  advisory
- `Cache-Control: private, no-store` scoped to status endpoint only (not health)
  -- per software-docs-minion's advisory about the spec/implementation mismatch

## Post-execution: the wrangler.toml fix

After all 7 tasks completed, the test run revealed one infrastructure issue.
The rate limiter config used `[[ratelimits]]` with a `binding` field. Wrangler
expected `[[unsafe.bindings]]` with a `name` field and `type = "ratelimit"`.
The fix was a 4-line change to `wrangler.toml`. After the fix, all 191 tests
passed.

This is a recurring pattern: platform-specific configuration syntax isn't well
covered in specialist knowledge. The fix was caught by Phase 6 (test execution),
which is exactly what post-execution phases are for.

## Session characteristics

- 1 compaction event (between Phase 3 synthesis and Phase 3.5 architecture review)
- 7 execution tasks across 5 batches (2 parallel batches)
- 2 approval gates during execution
- All 6 architecture reviewers returned ADVISE (0 BLOCK)
- 191 tests passing across 7 test files

## Where to read more

- Full specialist discussions: `docs/history/nefario-reports/2026-03-13-180404-mvp-step-3-capture-endpoint-browser-rendering/`
- Phase 2 specialist contributions: `phase2-*.md` files in companion directory
- Phase 3 synthesis with conflict resolutions: `phase3-synthesis.md`
- Phase 3.5 architecture review verdicts: `phase3.5-*.md` files
- Execution task prompts: `phase4-*-prompt.md` files
- Execution report: `docs/history/nefario-reports/2026-03-13-180404-mvp-step-3-capture-endpoint-browser-rendering.md`
