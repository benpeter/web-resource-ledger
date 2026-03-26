# Phase 0085: Decisions

## Tool Surface Size: 11 Tools (not 15 or 31)

**Chosen**: 11 tools (4 existing + 7 new: batch_capture, diff_captures, get_usage, list_schedules, create_schedule, delete_schedule, get_certificate)

**Over**: 15 tools (ux-strategy-minion wanted webhooks + get_artifact), 31 tools (literal reading of success criterion)

**Why**: 11 covers all tenant-facing agent jobs. Webhooks require infrastructure callback URLs agents don't have. get_artifact returns binary content MCP handles poorly. Admin endpoints use a different auth boundary. YAGNI.

## Drift Detection: Inline Test Maps (not JSON Manifest)

**Chosen**: operationId completeness test with inline TOOL_TO_OPERATION and EXCLUDED_OPERATIONS maps in test/mcp-sync.test.js, running in Node pool via separate vitest config.

**Over**: Separate mcp-coverage.json manifest (api-spec-minion), parameter-level parity checking (api-spec-minion/test-minion)

**Why**: 25 lines of map data don't warrant a separate file. Parameter parity checking has camelCase/snake_case fragility. Per-tool tests catch parameter regressions more reliably.

## Documentation: Manual Update (not Auto-Generated)

**Chosen**: Manual docs update to docs/mcp.md and site/content/mcp.md

**Over**: Auto-generated tool reference with CI sync check (software-docs-minion)

**Why**: 11 tools don't justify generator tooling. Drift detection test catches structural changes. KISS.

## getSchedule Excluded from MCP

**Chosen**: Exclude — list_schedules returns full schedule objects already

**Over**: Include as separate get_schedule tool

**Why**: list_schedules returns all schedule details. A separate tool adds cognitive load with no agent value.

## Scope Corrections from Code Review

**Post-execution finding**: Code review identified that delete_schedule, list_schedules require 'capture' scope (not 'read') per the HTTP handlers in schedules.js. Also found missing tenant isolation on get_capture and verify_capture (pre-existing gap in the original 4 tools, not introduced by this PR but fixed here).
