# Phase 1: Meta-Plan Prompt

MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

**Outcome**: The WRL MCP server reflects the current API surface (endpoints, parameters, response shapes) and a process exists to prevent it from silently drifting behind future API changes.

**Success criteria**:
- All current API endpoints are represented as MCP tools with correct parameters and response types
- MCP server works end-to-end against staging for core flows (capture, list, get, verify)
- A CI check or test exists that detects when the API and MCP server are out of sync
- README/docs updated with current tool list

**Scope**:
- In: MCP server tool definitions, parameter types, response handling, sync detection mechanism
- Out: New MCP features beyond current API surface, MCP server hosting/deployment changes, OAuth for MCP

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/bright-nibbling-sloth

## Codebase Context

The MCP server is at `src/mcp.js` and currently exposes 4 tools: capture_url, get_capture, list_captures, verify_capture.

The OpenAPI spec at `openapi.yaml` defines ~25+ endpoints across these tags: health, captures, verification, signing, admin, webhooks, account, notifications, schedules.

Key endpoints NOT in MCP today:
- /v1/captures/batch (batch capture)
- /v1/captures/{id}/status (lightweight status check)
- /v1/captures/{id}/artifacts/{name} (artifact download)
- /v1/captures/{id}/certificate (certificate download)
- /v1/captures/{baseId}/diff/{targetId} (visual diff)
- /.well-known/signing-key and /.well-known/signing-keys
- /v1/admin/* endpoints (key management, usage, cache purge)
- /v1/webhooks/* endpoints
- /v1/account/* endpoints (usage, notifications)
- /v1/notifications/unsubscribe
- /v1/schedules/* endpoints

Tests are at `test/mcp.test.js`. CI is at `.github/workflows/ci.yml`.
Docs are at `docs/mcp.md` and `site/content/mcp.md`.

There is a project-local skill at `.claude/skills/ops-runbook` (not relevant to this task).

## External Skill Discovery
Scan .claude/skills/ and .skills/ for SKILL.md files.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-enfX6H/sync-mcp-api-drift-prevention/phase1-metaplan.md`
