---
task: "MVP Step 3: Capture Endpoint and Browser Rendering"
date: 2026-03-13
slug: mvp-step-3-capture-endpoint-browser-rendering
mode: execution
source-issue: 3
task-count: 7
gate-count: 2
compaction-events: 1
---

## Summary

Built the capture endpoint with browser rendering, KV status tracking, API key auth, and rate limiting for the Web Resource Ledger Cloudflare Worker. Produced 6 new source/config files (src/auth.js, src/kv.js, src/capture.js, openapi.yaml, wrangler.toml updates, vitest.config.js updates), modified src/index.js with two new route handlers and security headers, and added 4 new test files with 73 new tests (191 total passing across 7 files). The capture pipeline uses an injectable renderer pattern, Puppeteer browser isolation (incognito context, 25s timeout, 50MB/200 subresource limits), R2 artifact storage, and KV status tracking with 24h TTL on pending records. One post-execution fix: wrangler.toml rate limiter syntax corrected from `[[ratelimits]]` to `[[unsafe.bindings]]`.

## Original Prompt

GitHub Issue #3: MVP Step 3 -- Capture Endpoint and Browser Rendering

Build a capture endpoint with isolated browser rendering and KV-backed status tracking for a Cloudflare Worker. POST /v1/captures accepts a URL, validates it, checks API key, returns 202 with capture ID and status URL. Browser Rendering captures screenshot (PNG) and rendered HTML. KV tracks status: pending -> complete/failed. GET /v1/captures/{id}/status returns current status. Platform rate limiting at ~10/min. Capture ID: cap_ + crypto.randomUUID() hyphens stripped.

## Key Design Decisions

1. **DNS-pinned fetch abandoned** -- Workers cannot fetch bare IPs (Error 1003) and TLS-SNI mismatch breaks certificate validation. Used original validated URL with `redirect:'manual'` instead. Unanimous after security-minion self-corrected.

2. **ctx.waitUntil() over Queue** -- 25s navigation timeout fits within 30s hard limit. Code structured for Queue migration when slow pages reliably time out. Queue gives 15min but adds infrastructure complexity.

3. **R2 artifacts in Step 3** -- Screenshot, HTML, and headers stored immediately rather than deferred to Step 4. Prevents data loss if ctx.waitUntil() is killed. Step isolation preserved.

4. **Injectable renderer, no module-scoped state** -- `performCapture` accepts a `renderer` parameter (defaults to `defaultRenderer`). Architecture review (3 reviewers: lucy, margo, test-minion) removed the planned `setRenderer`/`getRenderer` -- module-scoped mutable state is an anti-pattern in Workers shared scope. Follows `validateUrl`'s `resolvers` parameter precedent.

5. **Contract-first OpenAPI spec** -- Written before implementation, not deferred to Step 8. Prevents implementation-first drift. 379 lines covering all 3 endpoints, 6 error responses, 4 shared schemas.

6. **Status response shape: selective exposure** -- `error` (not `detail`) for capture failures, `retryable` boolean for UX. `id` in all status responses. Full KV metadata stays internal; status handler selects what to expose.

7. **captureUrl kept in complete status** -- Architecture review (3 reviewers) recommended removing it (points to non-existent Step 5 endpoint). User overrode: mid-MVP with no present users, no trust erosion risk.

8. **Static 404 message** -- Security advisory: use "Capture not found" instead of echoing path parameter. Eliminates unnecessary input reflection.

## Phases

### Phase 1: Meta-Plan
Identified 7 specialists: security-minion (SSRF, auth, browser isolation), api-design-minion (response shapes, error taxonomy), edge-minion (Puppeteer, ctx.waitUntil, rate limiting), data-minion (KV schema, TTL, R2 storage), test-minion (injectable renderer, async testing), ux-strategy-minion (202 UX, failed status, ID recovery), software-docs-minion (OpenAPI timing, evolution log).

### Phase 2: Specialist Planning
All 7 specialists contributed. Key consensus: timing-safe key comparison, injectable renderer, 24h TTL on pending, namespaced KV keys, contract-first spec. Key conflict: DNS-pinned fetch feasibility (resolved: not feasible on Workers).

### Phase 3: Synthesis
Produced 7-task plan with 2 approval gates. 8 conflict resolutions documented. Highest risk: ctx.waitUntil() 30s hard limit.

### Phase 3.5: Architecture Review
5 mandatory + 1 discretionary reviewer (software-docs-minion). Results: 6 ADVISE, 0 BLOCK. 18 advisories total, 5 surfaced at execution plan gate:
- [simplicity] Remove setRenderer/getRenderer (3 reviewers)
- [usability] Remove captureUrl from complete status (3 reviewers) -- user overrode
- [security] Auth length check timing oracle documentation
- [security] Static 404 message on status endpoint
- [governance] Write prompt.md before execution starts

### Phase 4: Execution
7 tasks in 5 batches:
- **Batch 0**: Evolution prompt.md (orchestrator)
- **Batch 1**: Task 1 -- OpenAPI spec (api-spec-minion). Gate approved.
- **Batch 2**: Tasks 2+3 -- Auth module + KV module (parallel)
- **Batch 3**: Task 4 -- Browser rendering capture module. Gate approved.
- **Batch 4**: Task 5 -- Route handlers + integration tests
- **Batch 5**: Tasks 6+7 -- Rate limiting config + evolution log (parallel)

### Phases 5-8: Post-Execution
- **Phase 6 (Tests)**: 191/191 tests pass across 7 files. One infrastructure fix: wrangler.toml rate limiter syntax corrected from `[[ratelimits]]` to `[[unsafe.bindings]]`.
- Phase 5 (Code Review): Not run as separate phase; advisories from Phase 3.5 were incorporated into task prompts.
- Phase 8 (Documentation): Evolution log and backlog update completed as Task 7.

## Agent Contributions

### Planning Phase (Phase 2)

| Agent | Contribution |
|-------|-------------|
| security-minion | DNS-pinned fetch infeasibility, timing-safe auth, browser isolation, request interception, XSS flag |
| api-design-minion | Response shapes, error taxonomy, Retry-After scope, direct validateUrl passthrough |
| edge-minion | Puppeteer lifecycle, ctx.waitUntil limits, rate limiting via wrangler.toml, no concurrency limiting |
| data-minion | KV key structure, metadata shape, 24h TTL, synchronous write before 202, R2 in Step 3 |
| test-minion | Injectable renderer requirement, createExecutionContext for async, fetchMock, 6 test files |
| ux-strategy-minion | note field, Retry-After:5 on 202, error+retryable on failed, no ID recovery (YAGNI) |
| software-docs-minion | Contract-first OpenAPI, RFC 9457 schema, capture ID regex, evolution log requirements |

### Review Phase (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE (5) | Timing oracle in auth, scheme guard, content-length best-effort, status rate limit gap, static 404 |
| test-minion | ADVISE (5) | Module-scoped renderer state, URL test case clarity, KV idempotency, captureHeaders tests, fetchMock |
| ux-strategy-minion | ADVISE (1) | captureUrl points to non-existent endpoint |
| lucy | ADVISE (2) | Drop setRenderer/getRenderer, prompt.md before execution |
| margo | ADVISE (3) | Drop setRenderer/getRenderer, OpenAPI gate is scope creep, captureUrl is YAGNI |
| software-docs-minion | ADVISE (2) | Cache-Control scope mismatch in spec, captureUrl non-existent endpoint |

## Verification

Tests: 191 passed, 0 failed (7 files). One post-execution fix applied (wrangler.toml rate limiter syntax).

## Test Plan

- [x] Auth module: 10 tests (correct key, wrong key, empty token, non-Bearer, missing header, missing env, RFC 9457 shape, key-not-leaked)
- [x] KV module: 18 tests (CRUD, round-trip, TTL, idempotency, no-op on missing)
- [x] Capture module: 26 tests (success/fail transitions, R2 writes, header-optional, captureHeaders redaction, scheme guard)
- [x] Integration: 19 tests (202 happy path, auth failures, Content-Type, body validation, URL rejection, status endpoint, security headers)
- [x] Pre-existing: 118 tests (health, responses, url-validation)

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- full orchestration

</details>

<details>
<summary>Compaction</summary>

1 compaction event (between Phase 3 and Phase 3.5).

</details>

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-13-180404-mvp-step-3-capture-endpoint-browser-rendering/`

Files: phase1-metaplan.md, phase1-metaplan-prompt.md, phase2-*-prompt.md (7), phase2-*.md (7), phase3-synthesis-prompt.md, phase3-synthesis.md, phase3.5-*-prompt.md (6), phase3.5-*.md (6), phase4-*-prompt.md (4), prompt.md

Resolves #3
