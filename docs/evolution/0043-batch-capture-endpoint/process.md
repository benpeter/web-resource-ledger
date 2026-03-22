# Phase 0043: Batch Capture Endpoint — Process

## TL;DR

Seven specialists planned, five mandatory reviewers plus gru reviewed, three
execution agents delivered the batch capture endpoint in a single orchestration
session. The most contentious design decision — rate limit strategy — was
resolved by the CF rate limiter API itself: it has no `.remaining()` method,
making sequential consumption the only viable approach. 48 tests written,
46 pass, 2 skip (miniflare rate limiter limitation). Code review returned
3 ADVISE, 0 BLOCK. Full test suite: 653 pass, 2 skip.

## Specialists consulted (Phase 2)

Seven agents were consulted for planning:

1. **api-design-minion** — Designed the 207 Multi-Status response contract,
   per-item ProblemDetail shape, and the `{ urls: [{ url: "..." }] }` request
   body shape that leaves room for per-URL options without breaking changes.

2. **security-minion** — Argued for all-or-nothing rate limit pre-check and
   duplicate URL rejection. Both positions were overridden (see conflicts below).
   Contributed SSRF-per-URL requirement and "never reflect user input" principle.

3. **test-minion** — Designed the test matrix covering 9 categories. Identified
   the miniflare rate limiter gap early, recommending staging validation as
   fallback.

4. **ux-strategy-minion** — Advocated for string enum status codes (`accepted`,
   `validation_error`) over HTTP integers. Overridden by RFC 4918 convention
   and codebase consistency. Contributed the summary object design for CI
   pipeline binary signal.

5. **devx-minion** — Focused on SDK ergonomics: items array order matches input
   order, summary object provides at-a-glance pass/fail, statusUrl per item
   enables per-URL polling.

6. **observability-minion** — Designed the `capture.batch` log event with
   aggregate counts (total, accepted, failed) plus per-item `capture.queued`
   events for drill-down.

7. **data-minion** — Confirmed KV is appropriate for batch (no transaction
   semantics needed, each URL is independent). No D1 migration required.

## Key conflicts and resolutions

### Rate limit strategy (security-minion vs reality)

Security-minion wanted all-or-nothing pre-check: verify N tokens available
before processing any URL. This would prevent partial consumption and partial
failure. api-design-minion pointed out that CF rate limiters have no
`.remaining()` or `.peek()` API — each `.limit()` call is destructive. The
all-or-nothing approach is technically impossible without consuming N tokens
speculatively.

**Resolution**: Sequential consumption with pre-check (D3). The pre-check
burns 1 token to confirm the caller has any quota at all. Subsequent items
consume 1 token each. When a limiter fails mid-batch, the current item and
all remaining items are marked 429/503. This is the only approach that works
with the CF API and gives honest per-item outcomes.

### Duplicate URL handling (security-minion vs devx-minion)

Security-minion wanted duplicate URLs rejected to prevent amplification.
devx-minion argued legitimate use cases exist (time-series monitoring,
comparison captures). api-design-minion noted that deduplication would make
the response array shorter than input, violating the order-preservation contract.

**Resolution**: Allow duplicates (D4). Each consumes a rate limit token,
which is self-limiting. The hard cap (100) and per-IP rate limit (10/min)
provide defense in depth.

### Request body shape (api-design-minion vs ux-strategy-minion)

api-design-minion proposed `{ urls: [{ url: "..." }] }` (objects).
ux-strategy-minion proposed flat strings `{ urls: ["..."] }`.
api-design-minion won: objects leave room for per-URL options (viewport,
waitUntil) without a breaking change.

### Per-item status representation (api-design-minion vs ux-strategy-minion)

api-design-minion proposed HTTP integer status codes (202, 400, 422, etc.).
ux-strategy-minion proposed string enums. HTTP integers won: RFC 4918
convention, consistent with `problemResponse()` throughout the codebase.

## Architecture review (Phase 3.5)

Six reviewers (5 mandatory + gru):

- **security-minion**: APPROVE
- **test-minion**: ADVISE — noted need for rate limit exhaustion mid-batch test
- **ux-strategy-minion**: APPROVE
- **lucy**: ADVISE — identified dead code risk in rate-limits.js modification
  (synthesis had instructed adding a 'batch' entry that `getRateLimitGroup`
  would never match), missing `computeCip` in handler flow, and
  `getRateLimitGroup` gap for exact string match
- **margo**: ADVISE — flagged potential dead code in rate-limits.js, confirmed
  no dedicated batch limiter is correct
- **gru**: APPROVE

Lucy's findings were the most impactful: removing the dead-code
rate-limits.js change and adding explicit `computeCip` to the handler
prevented two bugs before code was written.

## Execution (Phase 4)

Three tasks executed:

1. **frontend-minion** (Task 1): Implemented `handleBatchCapture` in
   `src/index.js` (+179 lines) and response helpers in `src/responses.js`
   (+12 lines). Gate approved by Lucy.

2. **api-spec-minion** (Task 2): Updated `openapi.yaml` (+310 lines) with
   5 new schemas and the full batch endpoint path definition.

3. **test-minion** (Task 3): Created `test/batch-capture.test.js` with
   48 tests across 9 categories. Discovered the miniflare rate limiter
   behavior (it enforces real limits) and solved with per-test unique IPs.

Tasks 2 and 3 ran in parallel after Task 1's gate was approved.

## Code review (Phase 5)

Three reviewers, all ADVISE:

- **code-review-minion**: Rate limit token consumed before body parsing
  (spec/implementation mismatch), `maxItems: 100` vs default 20, missing
  `additionalProperties: false` on per-item schema.
- **lucy**: Skipped rate limit tests noted as requirement gap, URL extraction
  duplication (3x), handler size (172 lines).
- **margo**: Handler duplication with single-capture (~60 lines),
  `ABSOLUTE_MAX_BATCH_SIZE` configurability is premature YAGNI.

No findings rose to BLOCK level. The duplication finding was the strongest
recommendation, deliberately deferred to keep the PR focused.

## Human interventions

This was a fully autonomous orchestration (no human at the gates). Lucy
agents made all gate decisions. Key autonomous decisions:

- Team approved as proposed (7 specialists)
- Execution plan approved after Lucy verified all success criteria mapped
- Task 1 gate approved after Lucy verified implementation matched plan
- Post-execution: "Run all" selected for code review + tests + docs
- All ADVISE findings accepted without auto-fix (appropriate for advisory items)

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/` (companion directory)
- Decisions with rationale: `docs/evolution/0043-batch-capture-endpoint/decisions.md`
- Outcomes and surprises: `docs/evolution/0043-batch-capture-endpoint/outcome.md`
