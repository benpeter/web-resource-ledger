---
task: "R3 CORS for capture POST, R4 HSTS preload, R5 X-RateLimit-Limit header"
date: 2026-03-16
source-issues: [33, 34, 35]
status: complete
task-count: 4
gate-count: 0
agents-consulted: [security-minion, edge-minion, test-minion, ux-strategy-minion, software-docs-minion]
reviewers: [security-minion, test-minion, ux-strategy-minion, lucy, margo]
compaction-events: 0
---

## Summary

Implemented three security/API header improvements in a single PR: configurable CORS
preflight for POST /v1/captures (#33), HSTS preload directive (#34), and
X-RateLimit-Limit response header on all rate-limited endpoints (#35). Changes
span src/index.js (CORS + HSTS + rate limit headers), a new src/rate-limits.js
config module, wrangler.toml, vitest.config.js, openapi.yaml (bumped to 0.3.0),
and 7 test files including a new test/cors.test.js with 15 cases. All 434 tests
pass across 21 files.

## Original Prompt

Combined task from GitHub issues #33, #34, and #35.

Issue #33 (R3): CORS for capture POST endpoint -- OPTIONS preflight with
configurable origin allowlist (CORS_ORIGINS env var), CORS headers on POST
responses, secure defaults (empty = no CORS).

Issue #34 (R4): HSTS preload submission -- bump max-age to 63072000, add
preload directive, document hstspreload.org submission as post-merge action.

Issue #35 (R5): X-RateLimit-Limit response header -- static per-IP ceiling
from config on all rate-limited endpoints, no Remaining/Reset headers.

Constraints: combine all three in one PR, skip all approval gates (defer to
gru and lucy), auto-create PR, write process.md in evolution log.

## Key Design Decisions

1. **CORS env var name**: `CORS_ORIGINS` over `CORS_ALLOWED_ORIGINS`. Terse naming
   matches project convention (SIGNING_KEY, not ED25519_SIGNING_KEY_PKCS8).
2. **CORS on error responses**: Headers applied in global response pipeline, not
   inside handlers. Ensures 401/400/429 carry CORS headers so browsers show the
   real error, not a spurious CORS failure.
3. **Rate limit config module**: `src/rate-limits.js` exports ceiling constants.
   One sync point with wrangler.toml vs four (prod vars + staging vars + two
   binding configs). edge-minion's recommendation over ux-strategy's inline approach.
4. **Access-Control-Max-Age: 7200**: Chrome caps at 7200; higher values mislead.
   Cache-Control: no-store on OPTIONS prevents CDN-layer caching.
5. **No global capacity exposure**: X-RateLimit-Limit reports per-IP ceiling only.
   503 responses omit the header. Global capacity hidden from attackers.
6. **GET wildcard CORS unchanged**: Public read endpoints correctly use `*`.

## Phases

### Phase 1: Meta-Plan
Identified 5 specialists: security-minion (CORS design), edge-minion (rate limit
config pattern), test-minion (test organization), ux-strategy-minion (developer
experience), software-docs-minion (OpenAPI updates). Excluded api-design-minion
(implementation of existing endpoints, not new API), iac-minion (standard env var),
observability-minion (no new runtime components).

### Phase 2: Specialist Planning
All 5 specialists consulted in parallel. Key conflicts surfaced:
- CORS scope: security-minion (path-specific OPTIONS) vs ux-strategy-minion (global
  pipeline for error response coverage) -- resolved as complementary, both adopted.
- Rate limit config: edge-minion (src/rate-limits.js) vs ux-strategy-minion (inline
  hardcoding) -- edge-minion wins on single-source-of-truth argument.
- Max-Age: security-minion (7200) vs edge-minion (86400) -- 7200 wins (Chrome cap).

### Phase 3: Synthesis
4 tasks, 3 batches, zero gates. Task 1: core implementation (edge-minion).
Task 2: tests (test-minion, blocked by T1). Task 3: OpenAPI spec (software-docs-minion,
blocked by T1). Task 4: evolution log (software-docs-minion, blocked by T1-T3).

### Phase 3.5: Architecture Review
5 mandatory reviewers: 3 APPROVE (security, ux-strategy, margo), 2 ADVISE (lucy,
test-minion), 0 BLOCK. Lucy caught missing process.md in Task 4 deliverables --
handled by orchestrator at wrap-up. test-minion noted Vary: Origin should be
explicit in test assertions and 503 rate-limit-absent test gap.

### Phase 4: Execution
Batch 1: edge-minion implemented all three features in src/index.js + new
src/rate-limits.js + wrangler.toml + vitest.config.js. Batch 2 (parallel):
test-minion wrote 15 CORS tests + updated HSTS + rate limit assertions across 6
files; software-docs-minion updated openapi.yaml (version 0.3.0, HSTS component,
XRateLimitLimit component, CORS docs). Batch 3: software-docs-minion created
evolution log 0019 and updated backlog.

### Phases 5-8
Verification: 434 tests pass (21 files). Code review and documentation handled
inline during execution. OpenAPI spec updated as part of Task 3.

## Agent Contributions

### Planning Agents (Phase 2)

| Agent | Recommendation | Key Contribution |
|-------|---------------|-----------------|
| security-minion | CORS design with exact origin matching, Vary: Origin, fail-closed default | CDN cache poisoning prevention, no substring matching |
| edge-minion | src/rate-limits.js config object, per-IP ceiling only | Bridging wrangler binding config with runtime headers |
| test-minion | New cors.test.js, distributed rate limit assertions | Test file organization, env var injection pattern |
| ux-strategy-minion | Terse env var name, global pipeline CORS | Error response CORS for better DX |
| software-docs-minion | Per-operation CORS docs, XRateLimitLimit component | OpenAPI update strategy (~30 lines) |

### Review Agents (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | APPROVE | Plan addresses all CORS security concerns |
| test-minion | APPROVE (advisory) | Vary: Origin explicit assertion, 503 gap noted |
| ux-strategy-minion | APPROVE | Journey coherent, cognitive load reduced |
| lucy | ADVISE | process.md missing from Task 4 deliverables |
| margo | APPROVE | Proportional complexity, no over-engineering |

## Verification

- **Tests**: 434 pass, 0 fail (21 files)
- **New tests**: 15 CORS cases + HSTS updates + X-RateLimit-Limit assertions across 6 files
- **Code review**: Inline during execution
- **Documentation**: OpenAPI 0.3.0, evolution log 0019

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- orchestration

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-16-122043-cors-hsts-ratelimit/`

Files:
- `prompt.md` -- original task description
- `phase1-metaplan-prompt.md` -- meta-plan input
- `phase1-metaplan.md` -- meta-plan output
- `phase2-security-minion.md` -- security specialist contribution
- `phase2-edge-minion.md` -- edge specialist contribution
- `phase2-test-minion.md` -- test specialist contribution
- `phase2-ux-strategy-minion.md` -- UX strategy contribution
- `phase2-software-docs-minion.md` -- documentation contribution
- `phase3-synthesis.md` -- delegation plan
- `phase3.5-security-minion.md` -- security review verdict
- `phase3.5-test-minion.md` -- test review verdict
- `phase3.5-ux-strategy-minion.md` -- UX strategy review verdict
- `phase3.5-lucy.md` -- lucy review verdict
- `phase3.5-margo.md` -- margo review verdict

</details>
