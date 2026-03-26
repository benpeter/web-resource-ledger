---
task: "Sync MCP server with current API and establish drift prevention"
date: 2026-03-26
source-issue: 202
status: complete
agents: [mcp-minion, api-spec-minion, test-minion, ux-strategy-minion, software-docs-minion, security-minion, lucy, margo, code-review-minion]
task-count: 4
gate-count: 1
mode: execution
---

## Summary

Expanded the WRL MCP server from 4 to 11 tools, added a CI drift-detection test that prevents the MCP surface from silently falling behind the OpenAPI spec, and updated documentation for the full tool surface. Code review identified and fixed tenant isolation gaps in get_capture and verify_capture (pre-existing in the original 4 tools). All 61 test files pass (1574 tests), plus 3 sync detection tests.

## Original Prompt

GitHub Issue #202: Sync MCP server with current API and establish drift prevention. The WRL MCP server had 4 tools but the API defined ~25 endpoints. Need to expand tool surface, add CI sync detection, and update docs.

## Key Design Decisions

### 11 tools, not 31
The success criterion "all current API endpoints represented" was reinterpreted as "all tenant-facing agent jobs reachable." Admin endpoints (different auth boundary), webhooks (require infrastructure URLs), binary downloads (poor MCP fit), and UI endpoints were explicitly excluded with documented reasons.

### Drift detection via contract test
A test parses openapi.yaml and asserts every operationId is either mapped to an MCP tool or explicitly excluded. Inline maps in the test file (not a separate JSON manifest). Runs in Node pool via separate vitest config because the workerd pool doesn't support fs access.

### Manual documentation
11 tools don't justify a generator script. The drift detection test catches structural divergence. Manual docs grouped by domain with a summary table.

## Phases

### Phase 1: Meta-Plan
5 specialists identified: mcp-minion (tool design), api-spec-minion (drift detection), test-minion (test strategy), ux-strategy-minion (tool surface UX), software-docs-minion (documentation). Lucy approved team without adjustment.

### Phase 2: Specialist Planning
All 5 ran in parallel. Key consensus: flat verb_noun naming, contract test for drift detection, per-tool describe blocks in tests. Disagreement on tool count (11 vs 15) resolved in synthesis favoring YAGNI.

### Phase 3: Synthesis
4 tasks, 1 approval gate. Resolved 4 conflicts: tool count (11), drift mechanism (inline maps), documentation (manual), getSchedule exclusion. All favored the simpler option per CLAUDE.md engineering philosophy.

### Phase 3.5: Architecture Review
5 mandatory reviewers. 2 APPROVE (ux-strategy, margo), 3 ADVISE (security: scope annotations + batch rate limiting + tenant isolation + error sanitization; test: separate vitest config; lucy: staging e2e gap). No BLOCK.

### Phase 4: Execution
Task 1 (mcp-minion): Added 7 tools to src/mcp.js. Version 0.2.0. Scope checks, tenant isolation, rate limiting all implemented per security advisories.
Task 2 (test-minion): Created test/mcp-sync.test.js with 3 assertions, vitest.sync.config.ts, CI integration.
Task 3 (test-minion): Added 15 new tests (35 total) for all 11 tools.
Task 4 (software-docs-minion): Updated docs/mcp.md and site/content/mcp.md with summary table, grouped tools, intentional omissions.

### Phase 5: Code Review
3 reviewers. code-review-minion found 2 BLOCK-level issues: missing tenant isolation on get_capture and verify_capture. Both auto-fixed. Lucy noted stale JSDoc (fixed). Margo noted logic duplication as fast-follow.

### Phase 6: Tests
61 test files, 1574 tests pass, 0 failures. Sync test: 3/3 pass.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
Phase 8a assessment: 0 additional items needed. Task 4 already covered docs/mcp.md and site/content/mcp.md updates.

## Agent Contributions

### Planning (Phase 2)

| Agent | Contribution |
|-------|-------------|
| mcp-minion | Tool surface design: 11 tools, verb_noun naming, admin exclusion rationale |
| api-spec-minion | Drift detection mechanism: contract test with coverage manifest approach |
| test-minion | Test architecture: per-tool describe blocks, sync test as highest-value deliverable |
| ux-strategy-minion | Tool UX: 3-sentence description template, cognitive load analysis, tiering framework |
| software-docs-minion | Doc strategy: hybrid auto-gen (rejected for KISS), domain grouping, intentional omissions section |

### Review (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | Scope annotations wrong, batch rate-limit gap, tenant isolation needed |
| test-minion | ADVISE | poolMatchGlobs won't work, use separate vitest config |
| ux-strategy-minion | APPROVE | Tool surface coherent, naming consistent |
| lucy | ADVISE | Staging e2e missing from tasks, evolution log (handled by orchestration) |
| margo | APPROVE | Proportional complexity, correct simplification choices |

### Code Review (Phase 5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| code-review-minion | ADVISE (2 BLOCK findings) | Missing tenant isolation on get_capture and verify_capture — fixed |
| lucy | APPROVE | Convention-adherent, all success criteria met |
| margo | ADVISE | Logic duplication (fast-follow), batch rate-limit divergence |

## Verification

Verification: 2 code review findings auto-fixed, all tests pass, docs updated.

## Decisions

### Tool surface: 11 tools
Chosen: 4 existing + 7 new (batch_capture, diff_captures, get_usage, list_schedules, create_schedule, delete_schedule, get_certificate)
Over: 15 tools (ux-strategy-minion, adding webhooks) or 31 (all operationIds)
Why: YAGNI. Webhooks need infra URLs agents don't have. Admin uses different auth.

### Drift detection: inline contract test
Chosen: test/mcp-sync.test.js with inline TOOL_TO_OPERATION and EXCLUDED_OPERATIONS maps
Over: Separate JSON manifest (api-spec-minion), parameter parity checking
Why: 25 entries don't justify a file. Parameter checks are fragile.

### Documentation: manual
Chosen: Hand-written docs with domain grouping and summary table
Over: Auto-generated tool reference (software-docs-minion)
Why: KISS. 11 tools. Drift test catches structural changes.

## Working Files

<details><summary>Scratch files (16 files)</summary>

See companion directory: `docs/history/nefario-reports/2026-03-26-013945-sync-mcp-api-drift-prevention/`

- prompt.md — original task description
- phase1-metaplan-prompt.md, phase1-metaplan.md — meta-plan
- phase2-*.md — specialist planning contributions (5 agents)
- phase3-synthesis-prompt.md, phase3-synthesis.md — delegation plan
- phase3.5-*.md — architecture review verdicts
- phase5-*.md — code review findings

</details>

## Session Resources

<details><summary>Skills and context</summary>

### Skills Invoked
- /nefario (this orchestration)

### Compaction Events
0 (context fit within single window)

</details>
