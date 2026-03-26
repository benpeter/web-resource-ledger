# Phase 0085: Sync MCP Server with Current API and Establish Drift Prevention

## Source

GitHub Issue #202: "Sync MCP server with current API and establish drift prevention"

## Task Description

**Outcome**: The WRL MCP server reflects the current API surface (endpoints, parameters, response shapes) and a process exists to prevent it from silently drifting behind future API changes.

**Success criteria**:
- All current API endpoints are represented as MCP tools with correct parameters and response types
- MCP server works end-to-end against staging for core flows (capture, list, get, verify)
- A CI check or test exists that detects when the API and MCP server are out of sync
- README/docs updated with current tool list

**Scope**:
- In: MCP server tool definitions, parameter types, response handling, sync detection mechanism
- Out: New MCP features beyond current API surface, MCP server hosting/deployment changes, OAuth for MCP
