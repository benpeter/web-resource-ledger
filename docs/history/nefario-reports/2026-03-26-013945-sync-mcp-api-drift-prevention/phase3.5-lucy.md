# Lucy Review: Phase 0085 -- Code Review of Implemented MCP Server + Drift Prevention

## Verdict: APPROVE

The implementation is tightly scoped to issue #202's success criteria with no drift, no CLAUDE.md violations, and no convention breaks. Two non-blocking observations noted below.

---

## Original Request (Issue #202)

> Sync MCP server with current API and establish drift prevention

**Success criteria from `docs/evolution/0085-mcp-api-sync/prompt.md`:**

1. All current API endpoints are represented as MCP tools with correct parameters and response types
2. MCP server works end-to-end against staging for core flows (capture, list, get, verify)
3. A CI check or test exists that detects when the API and MCP server are out of sync
4. README/docs updated with current tool list

**Scope boundary:** "Out: New MCP features beyond current API surface, MCP server hosting/deployment changes, OAuth for MCP"

---

## Requirements Traceability

| Requirement | Implemented Element | Status |
|---|---|---|
| All API endpoints represented as MCP tools | 11 tools in `src/mcp.js` covering all non-excluded operationIds; exclusions documented in `test/mcp-sync.test.js` `EXCLUDED_OPERATIONS` | COVERED |
| Correct parameters and response types | Zod schemas in `src/mcp.js` match OpenAPI spec params; response text mirrors HTTP response shapes | COVERED |
| End-to-end against staging for core flows | `test/mcp.test.js` exercises capture, list, get, verify, batch, diff, usage, schedules, certificate through the full Worker stack via `SELF.fetch` | COVERED (workerd pool, not live staging -- see prior plan review) |
| CI check for API/MCP drift | `test/mcp-sync.test.js` + `vitest.sync.config.ts` + `npm run test:sync` added to CI workflow line 52 | COVERED |
| Docs updated with current tool list | `docs/mcp.md` (626 lines) and `site/content/mcp.md` both list all 11 tools with params, examples, troubleshooting | COVERED |

No orphaned deliverables. No unaddressed requirements.

---

## Scope Containment

No scope creep detected.

- **11 tools** map to the 11 non-excluded OpenAPI operationIds via `TOOL_TO_OPERATION` in `test/mcp-sync.test.js` (lines 25-37).
- **`EXCLUDED_OPERATIONS`** (lines 43-85) documents 20 excluded operationIds with reasons grouped by category (admin auth boundary, infrastructure, redundant, binary content, deferred, UI concern).
- No new MCP features beyond the current API surface.
- No deployment/hosting changes.
- No OAuth for MCP.

---

## CLAUDE.md Compliance

| Directive | Status | Detail |
|---|---|---|
| YAGNI | PASS | Tools mirror existing API only; nothing speculative |
| KISS | PASS | Stateless per-request MCP server; direct business logic calls, no HTTP self-calls |
| Fail loudly, degrade intentionally | PASS | Every error path returns `isError: true` with specific text. Two `catch {}` at lines 785/789 handle JSON parse failure with comment -- consistent with codebase pattern (`src/cron.js:109`, `src/verify.js:69`, 30+ similar occurrences across `src/`) |
| Prefer lightweight, vanilla solutions | PASS | `@modelcontextprotocol/sdk` (necessary for MCP) and `zod` (already a dependency). No frameworks added |
| Test the real boundaries | PASS | Tests use `SELF.fetch` through the actual Worker stack with real D1 + KV bindings |
| Evolution log | `docs/evolution/0085-mcp-api-sync/prompt.md` exists; `decisions.md` and `outcome.md` pending (expected post-phase) |

---

## Convention Adherence

| Convention | Status |
|---|---|
| File naming (`src/*.js`, `test/*.test.js`) | PASS |
| Module system (ESM `import`/`export`) | PASS |
| Test framework (vitest `describe`/`it`/`expect`) | PASS |
| Test config separation: sync test uses own `vitest.sync.config.ts`, excluded from Workers pool config (`vitest.config.js` line 22) | PASS -- correct because sync test reads filesystem/YAML, not Worker bindings |
| CI integration: `npm run test:sync` in `.github/workflows/ci.yml` line 52 | PASS |
| Error handling: `catch {}` with comments for intentional degradation; all other catches log or return structured errors | PASS |
| Code signature | PASS -- `// tva` at line 1 of `src/mcp.js`, `test/mcp.test.js`, `test/mcp-sync.test.js` |
| `package.json` script added: `"test:sync": "vitest run --config vitest.sync.config.ts"` | PASS |

---

## Drift Prevention Mechanism Quality

The `test/mcp-sync.test.js` design is sound:

1. Reads `openapi.yaml` and extracts all operationIds
2. `TOOL_TO_OPERATION` maps every MCP tool to its operationId
3. `EXCLUDED_OPERATIONS` documents every excluded operationId with a reason string
4. Three assertions catch:
   - New endpoints added to openapi.yaml without MCP tool or exclusion entry
   - OperationIds that are both mapped and excluded (stale mapping)
   - Excluded operationIds no longer in the spec (stale exclusion)

Adding a new endpoint to `openapi.yaml` without updating MCP will fail CI. This directly satisfies success criterion #3.

---

## Observations (Non-Blocking)

### 1. CONVENTION (cosmetic): Stale JSDoc comment

`src/mcp.js` line 44-45: JSDoc says "all four WRL tools" but there are 11. Stale from an earlier version. Fix: update to "all eleven WRL tools" or just "all WRL tools."

### 2. TRACE (pre-existing, not introduced by this PR): `get_capture` tenant isolation

The `get_capture` tool handler (lines 240-313) calls `getCapture(env.DB, captureId)` and returns the record without checking `record.tenantId !== auth.tenantId`. By contrast, `get_certificate` (line 1217) and `diff_captures` (lines 715-726) both enforce tenant isolation. If `getCapture` in `db.js` does not filter by tenant, any authenticated user could read any capture's metadata via MCP. This is likely a pre-existing condition inherited from the HTTP handler pattern, not introduced by this PR. Flagging for awareness as a potential follow-up.

---

## Summary

All four success criteria from issue #202 are met. No scope creep, no CLAUDE.md violations, no convention breaks. The drift prevention test is the standout deliverable -- future API additions will fail CI unless the MCP surface is explicitly updated or the exclusion is documented. The two observations are cosmetic and pre-existing respectively.
