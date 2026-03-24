---
task: Extend /health endpoint with build metadata for deploy verification (Issue #171)
date: 2026-03-24
slug: extend-health-build-metadata
mode: execution
source-issue: 171
task-count: 3
gate-count: 0
compaction-events: 2
---

## Summary

Extended the /health endpoint with an optional `build` object containing commit SHA (full 40-char), version (from package.json), environment (production/staging), and deployedAt (ISO 8601 UTC). Build metadata is injected at deploy time via `wrangler --define` flags, burned into the Worker bundle as compile-time constants. Both deploy workflows (staging + production) updated with a "Resolve build metadata" step and `--define` command flags. Smoke test gains Check 5: verifies deployed commit matches `$GITHUB_SHA` with a 6-attempt retry loop for global propagation lag. OpenAPI spec, README, OPERATIONS.md, and CONTRIBUTING.md updated. 8 files changed across 4 commits.

## Original Prompt

GitHub Issue #171: Extend /health endpoint with build metadata for deploy verification. The existing /health endpoint returns build identity metadata (commit SHA, version, deploy timestamp, environment), enabling CI pipelines to confirm a specific commit is live after deploy and humans to instantly see what's running.

## Key Design Decisions

1. **Nested `build` object over flat top-level fields** -- Matches existing `legal` grouping pattern. Visual chunking for operators. Forward-compatible for future build fields. Over: flat top-level fields (ux-strategy-minion initial consideration; creates asymmetry with legal grouping).
2. **Full 40-character SHA over short 7-char** -- Task explicitly requires full SHA. Enables exact CI matching without truncation logic. Over: short 7-char SHA (api-design-minion, test-minion recommended for brevity).
3. **Omit build when globals absent over fallback values** -- No fake data in response. Absent key is unambiguous signal. Clean OpenAPI contract (build optional at top level). Over: always include build with `'dev'`/`'development'` fallbacks (test-minion).
4. **CLI --define flags over wrangler.toml [define] stanza** -- `[define]` is non-inheritable, requires duplication in env blocks. typeof guards handle missing globals gracefully. Over: wrangler.toml [define] with safe defaults (iac-minion initial proposal, self-rejected).
5. **git rev-parse HEAD over ${{ github.sha }}** -- Resolves correctly regardless of trigger type (workflow_run, workflow_dispatch, tag rollback). Single source of truth after checkout.
6. **Separate Check 5 over integrating into Check 1** -- Different failure semantics (alive vs stale code). Different retry needs. Non-fatal by design.

## Phases

### Phase 1: Meta-Plan
Selected 5 specialists: iac-minion (wrangler --define injection), test-minion (smoke test retry strategy), api-design-minion (response shape, backward compat), ux-strategy-minion (consumer ergonomics), software-docs-minion (documentation impact). Excluded: security-minion (public info, no auth surface), observability-minion (zero-I/O handler), frontend-minion (no UI).

### Phase 2: Specialist Planning
All 5 contributed in parallel. Full consensus on nested build object and typeof guards. Key insight from iac-minion: wrangler-action `command:` + `environment:` coexist safely (verified from action source code). Test-minion designed fixed-interval retry (not exponential -- propagation is eventually-consistent, not congestion).

### Phase 3: Synthesis
3-task plan with 0 approval gates. All tasks assigned to iac-minion. Task 1 (handler + tests + OpenAPI) blocks Tasks 2 (workflows) and 3 (smoke test) which run in parallel.

### Phase 3.5: Architecture Review
5 mandatory reviewers. 3 APPROVE, 2 ADVISE, 0 BLOCK. Security-minion: add format validation for SHA/version in CI metadata step. Lucy: scope deviation acknowledged (wrangler.toml define intentionally skipped). No discretionary reviewers needed.

### Phase 4: Execution
3 tasks across 2 execution batches:

| Task | Agent | Deliverable |
|------|-------|-------------|
| 1. handleHealth + tests + OpenAPI | iac-minion | src/index.js, test/health.test.js, openapi.yaml |
| 2. Deploy workflow --define flags | iac-minion | deploy-staging.yml, deploy-production.yml |
| 3. Smoke test Check 5 | iac-minion | scripts/smoke-test.sh |

### Phase 5: Code Review
3 reviewers. 1 APPROVE (margo), 2 ADVISE (code-review-minion, lucy), 0 BLOCK. 2 substantive findings auto-fixed:
- `\d` in grep replaced with `[0-9]` (BSD grep compatibility)
- OpenAPI build schema enriched with descriptions, patterns, enum, examples

### Phase 6: Tests
health.test.js: 5/5 pass. OpenAPI lint: valid (10 pre-existing warnings). shellcheck: clean. 14 test file failures all in `.claude/worktrees/general-debugger/` (pre-existing, unrelated).

### Phase 8: Documentation
4 files updated: README.md (health endpoint example), OPERATIONS.md (monitoring + rollback sections), CONTRIBUTING.md (smoke test count).

## Verification

Verification: 2 code review findings auto-fixed, tests passed, docs updated (4 files).

## Agent Contributions

### Planning (Phase 2)
- **iac-minion**: Wrangler --define injection strategy, command: + environment: coexistence, git rev-parse HEAD for SHA resolution
- **test-minion**: Smoke test retry design (6 attempts, 5s interval), typeof guard requirement, skip-on-absent pattern
- **api-design-minion**: Nested build object, optional at top / required children, Cache-Control: no-store per-handler
- **ux-strategy-minion**: Build grouping consistency with legal, full SHA + full word env values
- **software-docs-minion**: 6 documentation files identified for update

### Review (Phase 3.5)
- **security-minion**: ADVISE -- format validation for CI inputs
- **test-minion**: APPROVE
- **ux-strategy-minion**: APPROVE
- **lucy**: ADVISE -- scope deviation acknowledgment, evolution log reminder
- **margo**: APPROVE

### Code Review (Phase 5)
- **code-review-minion**: ADVISE -- BSD grep \d compatibility, OpenAPI schema gaps
- **lucy**: ADVISE -- missing enum/pattern constraints on build properties
- **margo**: APPROVE -- proportional implementation

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- primary orchestration

</details>

<details>
<summary>Compaction Events</summary>

2 compaction events (after Phase 3 synthesis and Phase 3.5 review).

</details>

## Working Files

See [2026-03-24-093008-extend-health-build-metadata/](./2026-03-24-093008-extend-health-build-metadata/) for all scratch files (31 files: prompts, specialist contributions, synthesis, review verdicts).
