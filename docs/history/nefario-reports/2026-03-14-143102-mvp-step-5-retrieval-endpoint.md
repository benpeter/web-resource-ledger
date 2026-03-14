---
task: "MVP Step 5: Retrieval Endpoint"
date: 2026-03-14
slug: mvp-step-5-retrieval-endpoint
mode: execution
source-issue: 5
task-count: 4
gate-count: 2
compaction-events: 3
---

## Summary

Completed the capture lifecycle by adding `GET /v1/captures/{id}` (metadata + artifact links) and `GET /v1/captures/{id}/artifacts/{name}` (worker-proxied artifact serving) to the Cloudflare Worker. Produced 2 new handler functions in `src/index.js` (~95 lines), a belt-and-suspenders httpMetadata fix in `src/capture.js`, 274 lines of OpenAPI spec additions, 14 new retrieval tests, and 1 lifecycle smoke test (230 total tests passing). The POST -> poll -> retrieve loop is now functional. Key design decisions: worker-proxied URLs (not direct R2), complete-only 200 responses with single static 404, flat artifact URL strings with nested WACZ metadata. HTML artifacts served as `text/plain` with `Content-Disposition: attachment` (stored-XSS prevention).

## Original Prompt

GitHub Issue #5: MVP Step 5 -- Retrieval Endpoint

Add `GET /v1/captures/{id}` (metadata + artifact links) and `GET /v1/captures/{id}/artifacts/{name}` (raw artifact download). Complete the capture lifecycle: submit, poll, retrieve.

Additional context: use sonnet throughout as the model for agents.

## Key Design Decisions

1. **Worker-proxied URLs over direct R2** -- api-design-minion, api-spec-minion, and security-minion converged on three grounds: Content-Type/Content-Length control requires worker in serving path, HTML stored-XSS mitigation requires Content-Type override, and capture-ID-as-access-secret model breaks with direct R2 keys. ux-strategy-minion's preference for direct R2 simplicity was overridden by technical consensus.

2. **Complete-only 200, single static 404** -- Retrieval endpoint returns 200 only for `status === 'complete'`. Pending, failed, and unknown IDs all receive the same static `"Capture not found"` 404. Prevents capture ID enumeration via response differentiation. Status endpoint retains full lifecycle tracking.

3. **Flat artifact URLs, nested WACZ** -- Simple artifacts (screenshot, html, headers) are flat URL strings in `artifacts`. WACZ gets a nested object `{ url, size, bundleHash }` because it carries verification-relevant metadata. ux-strategy-minion's shape, adopted over api-design-minion's fully-nested proposal.

4. **arrayBuffer() over ReadableStream** -- `obj.arrayBuffer()` used instead of `obj.body` streaming for R2 artifact serving. The workerd test runner (`@cloudflare/vitest-pool-workers`) does not support ReadableStream from R2 `get()`. Acceptable for MVP artifact sizes (screenshots ~200KB, WACZ ~200KB). Backlog item for streaming when large WACZ bundles (>10MB) become common.

5. **Cache-Control strategy** -- `private, no-store` on metadata 200 (captures can be updated/deleted), `public, max-age=31536000, immutable` on artifact 200 (content-addressed, never changes), `no-store` on all 404 responses (prevent stale 404 caching).

## Phases

### Phase 1: Meta-Plan
Identified 5 specialists: api-design-minion (artifact URL strategy), api-spec-minion (OpenAPI schema design), security-minion (XSS prevention, anti-enumeration), ux-strategy-minion (response shape, lifecycle coherence), test-minion (test strategy for retrieval + integration).

### Phase 2: Specialist Planning
All 5 specialists contributed. Key consensus: worker-proxied URLs, `text/plain` for HTML, RFC 9457 problem responses. Key conflicts: direct R2 vs worker-proxied (resolved: worker-proxied), all-states vs complete-only (resolved: complete-only), flat vs nested schema (resolved: hybrid). No second-round agents needed.

### Phase 3: Synthesis
Produced 4-task plan with 2 approval gates, 5 conflict resolutions, 4 identified risks. Tasks organized in 2 batches: parallel Tasks 1-3 (Batch 1, gate on Task 2), sequential Task 4 (Batch 2, after Task 2 gate).

### Phase 3.5: Architecture Review
5 mandatory reviewers. Verdicts: 1 APPROVE (ux-strategy-minion), 4 ADVISE (security-minion, test-minion, lucy, margo), 0 BLOCKs. Key advisories incorporated: `record.status !== 'complete'` guard on artifact handler, `Cache-Control: no-store` on all 404 paths, `Content-Disposition: attachment` on all artifact types, timing side-channel documented as accepted risk, pending-capture 404 test added.

### Phase 4: Execution
4 tasks executed across 2 batches with 2 approval gates.

**Batch 1** (parallel): Task 1 added httpMetadata to `rendered.html` R2 put. Task 2 implemented both handlers with all security advisories. Task 3 extended OpenAPI spec with CaptureRecord, CaptureArtifacts, WaczInfo, Problem404 schemas and both GET paths.

**Gate 1** (Task 2): Handler implementation approved. Explicit field mapping (no KV spread), static 404, Content-Disposition on all artifacts, SECURITY comments on both handlers.

**Gate 2** (Task 3): OpenAPI spec approved. 274 lines added, consistent with handler response shapes.

**Batch 2**: Task 4 wrote 14 retrieval tests and 1 lifecycle smoke test. Test agent discovered R2 ReadableStream incompatibility in workerd test runner — fixed by switching to `arrayBuffer()`. All 230 tests pass.

## Decisions

### Gate 1: Handler Implementation (Task 2)
**Decision**: Approve handler implementation with worker-proxied URLs, complete-only 200, static 404.
**Rationale**: All security advisories from Phase 3.5 implemented. Explicit field mapping prevents future KV field leakage. Content-Type dispatch table correctly overrides HTML to text/plain.
**Confidence**: HIGH

### Gate 2: OpenAPI Specification (Task 3)
**Decision**: Approve OpenAPI additions.
**Rationale**: Schemas match handler response shapes 1:1. Problem404 shared component consolidates existing inline 404.
**Confidence**: HIGH

## Verification

### Phase 5: Code Review
3 reviewers, all APPROVE:
- **code-review-minion**: APPROVE with NITs — weak test assertions (`toBeTruthy` vs exact values), missing pending-capture metadata test, `Cache-Control: no-store` not asserted on 404 responses, `Content-Disposition` not asserted on all artifact types.
- **lucy**: ADVISE — full traceability verified, all requirements mapped to code and tests, CLAUDE.md compliance confirmed, backlog cross-reference noted XSS prevention partially addressed.
- **margo**: APPROVE with NIT — `arrayBuffer()` vs streaming flagged for backlog, lookup table growth noted for future monitoring.

### Phase 6: Tests
230/230 tests pass (215 existing + 15 new). No regressions. Test execution ~61s.

### Phase 8: Documentation
Skipped — OpenAPI spec updated as part of execution (Task 3). README already references `openapi.yaml`. No additional documentation needed.

## Test Plan

- [x] 8 metadata endpoint tests (shape, URLs, no auth, security headers, Cache-Control, 404 variants, ip absent)
- [x] 6 artifact endpoint tests (text/plain HTML, image/png screenshot, Content-Disposition, wacz-absent 404, pending 404, absent headers 404)
- [x] 1 lifecycle smoke test (POST -> KV advance -> GET metadata with artifact URLs)
- [x] 215 existing tests unaffected

## Agent Contributions

### Planning (Phase 2)

| Agent | Contribution |
|-------|-------------|
| api-design-minion | Artifact URL strategy: worker-proxied over direct R2 for header control |
| api-spec-minion | OpenAPI schema design: CaptureRecord, Problem404 shared components |
| security-minion | XSS prevention strategy, anti-enumeration, Cache-Control policy |
| ux-strategy-minion | Response shape design, lifecycle mental model separation |
| test-minion | Test strategy: retrieval unit tests + lifecycle integration test |

### Review (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | status check guard on artifact handler, Cache-Control on all 404s |
| test-minion | ADVISE | artifact route test coverage, pending-capture 404 test |
| ux-strategy-minion | APPROVE | All UX recommendations adopted |
| lucy | ADVISE | Requirements fully traced, convention compliance confirmed |
| margo | ADVISE | Plan proportional, Task 3 gate potentially low-value |

### Code Review (Phase 5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| code-review-minion | APPROVE | Test assertion strength NITs, security checklist passed |
| lucy | APPROVE | Full traceability, CLAUDE.md compliant |
| margo | APPROVE | No over-engineering, arrayBuffer backlog NIT |

## Session Resources

<details>
<summary>Skills, external skills, compaction</summary>

### Skills Invoked
- `/nefario` — full execution orchestration

### External Skills
No external skills detected.

### Compaction
3 compaction events during session. Phase 2 specialist details and Phase 3.5 review details were compacted; reconstructed from scratch files for this report.

</details>

## Working Files

<details>
<summary>Scratch files (27 files)</summary>

All working files copied to companion directory:
`docs/history/nefario-reports/2026-03-14-143102-mvp-step-5-retrieval-endpoint/`

| File | Description |
|------|-------------|
| prompt.md | Original user prompt |
| phase1-metaplan-prompt.md | Meta-plan input |
| phase1-metaplan.md | Meta-plan output |
| phase2-api-design-minion.md | API design specialist contribution |
| phase2-api-spec-minion.md | API spec specialist contribution |
| phase2-security-minion.md | Security specialist contribution |
| phase2-test-minion.md | Test specialist contribution |
| phase2-ux-strategy-minion.md | UX strategy specialist contribution |
| phase3-synthesis-prompt.md | Synthesis input |
| phase3-synthesis.md | Delegation plan |
| phase3.5-security-minion-prompt.md | Security review input |
| phase3.5-security-minion.md | Security review: ADVISE |
| phase3.5-test-minion-prompt.md | Test review input |
| phase3.5-test-minion.md | Test review: ADVISE |
| phase3.5-ux-strategy-minion-prompt.md | UX strategy review input |
| phase3.5-ux-strategy-minion.md | UX strategy review: APPROVE |
| phase3.5-lucy-prompt.md | Lucy review input |
| phase3.5-lucy.md | Lucy review: ADVISE |
| phase3.5-margo-prompt.md | Margo review input |
| phase3.5-margo.md | Margo review: ADVISE |
| phase4-frontend-minion-task1-prompt.md | Task 1 execution prompt |
| phase4-frontend-minion-task2-prompt.md | Task 2 execution prompt |
| phase4-api-spec-minion-prompt.md | Task 3 execution prompt |
| phase4-test-minion-prompt.md | Task 4 execution prompt |
| phase5-code-review-minion.md | Code review: APPROVE |
| phase5-lucy.md | Lucy code review: APPROVE |
| phase5-margo.md | Margo code review: APPROVE |

</details>
