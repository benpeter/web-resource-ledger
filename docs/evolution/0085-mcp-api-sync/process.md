# Phase 0085: Process

## TL;DR

Five specialist agents planned the MCP server expansion in parallel, converging on 11 tools (not the 31 implied by "all endpoints"). A contract test with inline maps won over a JSON manifest for drift detection. Code review caught two pre-existing tenant isolation gaps in the original 4 tools — the most valuable find of the phase. Total: 7 new MCP tools, 1 drift detection test, 15 new per-tool tests, 2 security fixes, docs updated. Six commits on the feature branch.

## Team Selection (Phase 1)

Nefario selected 5 specialists for planning:

- **mcp-minion** — tool surface design (which endpoints become tools, naming, parameter mapping)
- **api-spec-minion** — drift detection mechanism (how to prevent MCP from falling behind the API)
- **test-minion** — test architecture for both sync detection and per-tool coverage
- **ux-strategy-minion** — tool UX from the AI agent's perspective (cognitive load, naming consistency)
- **software-docs-minion** — documentation strategy for the expanded tool set

Lucy approved the team without adjustment. Notable exclusions: security-minion (deferred to mandatory Phase 3.5 review), margo (same), frontend-minion (no UI work).

## What the Specialists Argued (Phase 2)

All 5 ran in parallel. Key positions:

**mcp-minion** proposed 11 tools using `verb_noun` naming. Argued that admin endpoints (different auth boundary), webhooks (require infrastructure callback URLs), binary downloads (poor MCP text fit), and UI routes should be excluded. This became the winning position.

**api-spec-minion** wanted a separate `mcp-coverage.json` manifest file and parameter-level parity checking between OpenAPI parameters and MCP tool inputs. Also proposed a JSON manifest approach for the exclusion list.

**test-minion** agreed with the contract test concept but warned that `poolMatchGlobs` wouldn't work with the Cloudflare vitest pool plugin — the sync test needs Node.js `fs` to read `openapi.yaml`, but the main test suite runs in workerd. Proposed a separate `vitest.sync.config.ts`. This turned out to be critical — the first test run without this separation failed with `no such file or directory, readAll 'openapi.yaml'`.

**ux-strategy-minion** pushed for 15 tools, wanting to include webhooks and `get_artifact`. Argued from a "jobs to be done" perspective that agents should have full API coverage. Also proposed a 3-sentence description template for each tool and a tiered tool discovery system.

**software-docs-minion** proposed auto-generated documentation from tool definitions, with a CI check to verify docs match the actual tool list. A generator script approach.

## Conflict Resolutions (Phase 3)

Four conflicts resolved in synthesis, all favoring simplicity:

1. **Tool count: 11 vs 15** — ux-strategy-minion wanted webhooks + get_artifact. Rejected because webhooks require infrastructure callback URLs that AI agents don't have, and get_artifact returns binary content MCP handles poorly. YAGNI.

2. **Drift detection: inline maps vs JSON manifest** — api-spec-minion wanted a separate file. 25 entries don't justify a file. Parameter-level parity checking was rejected as fragile (camelCase/snake_case mapping issues). Per-tool tests catch parameter regressions more reliably.

3. **Documentation: manual vs auto-generated** — software-docs-minion wanted a generator script. 11 tools don't justify generator tooling. The drift detection test catches structural changes; manual docs with domain grouping were sufficient.

4. **getSchedule exclusion** — list_schedules already returns full schedule objects. A separate get_schedule tool adds cognitive load with no agent value.

## Architecture Review (Phase 3.5)

5 mandatory reviewers ran in parallel:

- **ux-strategy-minion**: APPROVE — tool surface coherent, naming consistent
- **margo**: APPROVE — proportional complexity, correct simplification choices
- **security-minion**: ADVISE — 4 findings:
  - Scope annotations were wrong on some tools (schedule tools need 'capture' scope per HTTP handlers)
  - Batch rate limiting gap (batch_capture should consume N rate limit slots)
  - Tenant isolation needed on all tools that fetch records by ID
  - Error messages should be sanitized to avoid leaking internal state
- **test-minion**: ADVISE — confirmed separate vitest config needed, poolMatchGlobs incompatible with Cloudflare pool
- **lucy**: ADVISE — staging e2e test gap noted (no staging environment available for automated MCP testing)

No BLOCK verdicts. All ADVISE items were folded into task prompts for execution.

## Execution (Phase 4)

4 tasks executed sequentially (tasks 2-4 depended on task 1):

**Task 1 (mcp-minion)**: Added 7 tools to `src/mcp.js`. Each tool averaged ~115 lines (not the estimated ~40) due to proper error handling, rate limiting, scope checks, and text formatting. File grew from 553 to ~1350 lines. All security advisories implemented: scope checks, tenant isolation, N-slot rate limiting on batch.

**Task 2 (test-minion)**: Created `test/mcp-sync.test.js` with 3 assertions (completeness, no overlap, no stale exclusions), `vitest.sync.config.ts` for Node pool, and CI integration in `.github/workflows/ci.yml`.

**Task 3 (test-minion)**: Added 15 new tests to `test/mcp.test.js` (35 total), covering happy-path and error-path for each new tool. Updated tools/list assertion from 4 to 11.

**Task 4 (software-docs-minion)**: Updated `docs/mcp.md` and `site/content/mcp.md` with summary table, domain-grouped tools, and intentional omissions section.

## Code Review Findings (Phase 5)

The most valuable phase. Three reviewers ran in parallel:

**code-review-minion** found 2 BLOCK-level issues — both in the *original* 4 tools, not the new ones:
1. `get_capture` lacked tenant isolation: fetched the record but didn't verify `record.tenantId === auth.tenantId`. An agent could read any tenant's captures by ID.
2. `verify_capture` called `performVerification` without first checking tenant ownership. Same exposure.

Both were auto-fixed: `get_capture` got a compound check (`!record || record.tenantId !== auth.tenantId`), `verify_capture` got a pre-fetch with tenant guard before calling the verification function.

**lucy**: Found stale JSDoc comment ("all four WRL tools" → "WRL tools"). Fixed.

**margo**: Noted logic duplication between `src/mcp.js` and `src/index.js` route handlers — both implement the same business logic with slightly different wrappers. Flagged as fast-follow for extracting shared transport-neutral functions. Not addressed in this PR.

## Test Results (Phase 6)

All 61 test files passed (1574 tests). The sync test (`test/mcp-sync.test.js`) passed 3/3 assertions. One hiccup during execution: the sync test initially ran in the workerd pool and failed because `fs.readFileSync` isn't available in the Workers runtime. Fixed by adding `'test/mcp-sync.test.js'` to the exclude array in `vitest.config.js`.

## Human Interventions

This was an autonomous execution (no human operator). Lucy agent made all gate decisions:
- **Team approval**: Approved without adjustment
- **Reviewer approval**: Auto-approved (no discretionary reviewers needed)
- **Execution plan approval**: Approved
- **Post-execution**: Selected "Run all" (code review, tests, documentation)
- **PR creation**: Approved

## Where to Read More

- **Full specialist discussions**: `docs/history/nefario-reports/2026-03-26-013945-sync-mcp-api-drift-prevention/` (16 scratch files)
- **Execution report**: `docs/history/nefario-reports/2026-03-26-013945-sync-mcp-api-drift-prevention.md`
- **Decisions with rationale**: `docs/evolution/0085-mcp-api-sync/decisions.md`
- **What was produced**: `docs/evolution/0085-mcp-api-sync/outcome.md`
