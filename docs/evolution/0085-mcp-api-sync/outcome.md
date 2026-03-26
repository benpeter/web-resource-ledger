# Phase 0085: Outcome

## What Was Built

### MCP Server Expansion (src/mcp.js)
- 7 new tools added: batch_capture, diff_captures, get_usage, list_schedules, create_schedule, delete_schedule, get_certificate
- Total: 11 MCP tools, version bumped from 0.1.0 to 0.2.0
- Security: tenant isolation on all tools, scope checks on capture/schedule tools, N-slot rate limiting on batch
- File grew from 553 to ~1350 lines (proportional to 7 new tools averaging ~115 lines each)

### Drift Detection (test/mcp-sync.test.js)
- New test file that parses openapi.yaml and asserts every operationId is either mapped to an MCP tool or explicitly excluded with a reason
- 20 excluded operationIds with categorized reasons (admin, infrastructure, deferred, UI, binary, redundant)
- Runs in Node pool via separate vitest.sync.config.ts
- CI step added to .github/workflows/ci.yml

### Per-Tool Tests (test/mcp.test.js)
- 35 tests (up from ~20), covering all 11 tools
- Happy-path and error-path for each new tool
- tools/list assertion updated to 11 tools

### Documentation (docs/mcp.md, site/content/mcp.md)
- Summary table with all 11 tools and scope requirements
- Tools grouped by domain: Capture, Verification & Analysis, Account & Scheduling
- Each new tool documented with parameters, scope, example output
- Intentional Omissions section explaining excluded endpoints

## Surprises

1. **Pre-existing tenant isolation gap**: Code review found that get_capture and verify_capture (original tools) lacked tenantId ownership checks. Fixed in this PR — not introduced by the expansion but discovered during review.

2. **File size**: mcp.js reached ~1350 lines, exceeding the ~900 line estimate. Each tool needs ~115 lines for proper error handling, rate limiting, scope checks, and text formatting. The estimate of ~40 lines per tool was optimistic. Margo noted this as a fast-follow for extracting shared logic into transport-neutral functions.

3. **Vitest pool conflict**: The drift detection test needs Node.js fs to read openapi.yaml, but the main test suite runs in cloudflare:test workerd pool. poolMatchGlobs doesn't work with the Cloudflare pool plugin. Solved with a separate vitest.sync.config.ts.

## Backlog Changes

- ~~Sync MCP server with current API and establish drift prevention~~ (this phase, done)
- **New**: Extract shared transport-neutral business logic from mcp.js and index.js route handlers (logic duplication noted by margo) — parking lot

## Surface Consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed — MCP tools mirror existing endpoints, no new endpoints added |
| Docs site | Updated (site/content/mcp.md) |
| Landing page | No update needed — MCP tool expansion is an enhancement, not a new headline capability |
| MCP server | This IS the change |
| Legal pages | No update needed — no new data collection or third-party services |
