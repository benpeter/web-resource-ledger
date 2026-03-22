# Phase 1: Meta-Plan

MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

**Outcome**: Any MCP-compatible AI agent can capture and verify web pages as part of its workflow, positioning WRL as "the MCP server for web evidence" — a niche with zero current occupants.

**Success criteria**:
- MCP server exposes 3 tools: `capture_url`, `get_capture`, `verify_capture`
- Streamable HTTP transport (Cloudflare Workers compatible)
- Tools map directly to existing REST API endpoints
- An MCP client (e.g., Claude Code) can complete a full capture-verify round-trip
- Documentation includes MCP server configuration examples
- Listed in MCP server directories

**Scope**:
- In: Thin MCP adapter over existing API, 3 tool definitions, Streamable HTTP transport, documentation, directory listing
- Out: New capture capabilities beyond existing API, agent-specific UX, MCP auth beyond API key

**Constraints**:
- R1 (list endpoint) must exist — agents need to retrieve their captures
- R11 (TSA) recommended first — "evidence infrastructure for AI" is a stronger pitch with independent timestamps

## Working Directory

/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snappy-bouncing-sloth

## Codebase Context

- Cloudflare Worker (vanilla JS, no framework), `src/index.js` is the router
- Existing REST API endpoints: POST /v1/captures, GET /v1/captures, GET /v1/captures/{id}, GET /v1/captures/{id}/status, GET /v1/verify/{id}
- Auth: Bearer token (per-tenant API keys via KV, or legacy static key)
- wrangler.toml config, R2 for storage, KV for metadata
- Package: vitest for testing, @cloudflare/vitest-pool-workers for worker tests
- Dependencies: @cloudflare/playwright, fflate, @duckduckgo/autoconsent
- OpenAPI spec at openapi.yaml
- No external skills discovered (0)

## External Skill Discovery

No project-local skills found in .claude/skills/ or .skills/.

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills to classify
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase1-metaplan.md
