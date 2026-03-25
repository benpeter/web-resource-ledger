# Phase 3.5: Gru Review -- MCP Directory Listings and Ecosystem

## Verdict: ADVISE

---

### Advisory 1: Smithery skip is based on outdated understanding

- [technology-landscape]: Smithery now supports listing remote HTTP servers without Docker deployment
  SCOPE: Conflict resolution #2 (Smithery skip), overall directory coverage
  CHANGE: Smithery now accepts externally-hosted Streamable HTTP servers via `smithery mcp publish "https://api.webresourceledger.com/mcp" -n @benpeter/web-resource-ledger` or via their web UI at smithery.ai/new. The Docker container requirement that justified the skip no longer applies. Consider adding a low-effort task to list on Smithery via URL method.
  WHY: The plan's reasoning ("Smithery requires Docker deployment; WRL is a Cloudflare Worker") was correct historically but Smithery evolved. They now support a URL-based publish method for any server exposing Streamable HTTP. Skipping Smithery is defensible on priority grounds, but the stated rationale is factually wrong, which matters because the plan documents decisions for future reference. Additionally, Smithery has meaningful distribution -- it appears in MCP.so cross-listings and multiple client integrations.
  TASK: Not a specific task -- suggest adding a 10-minute Task 5b or noting corrected rationale in decisions.

### Advisory 2: MCP.so submission process is wrong

- [technology-landscape]: Task 5 instructs creating a new GitHub issue on chatmcp/mcpso, but MCP.so submissions are comments on issue #1
  SCOPE: Task 5 prompt
  CHANGE: Replace `gh issue create --repo chatmcp/mcpso` with `gh issue comment 1 --repo chatmcp/mcpso --body "..."`. The submission format is a comment on the existing pinned issue #1 ("Submit Your MCP Servers here"), not a new issue. Many submissions are just a GitHub link with a one-line description.
  WHY: Creating a new issue will likely be closed by maintainers with a redirect to issue #1, wasting a submission attempt and creating noise. The comment format is also much simpler -- just the repo URL and a brief description.
  TASK: Task 5

### Advisory 3: server.json headers format needs correction to match 2025-12-11 schema

- [technology-landscape]: The headers format in Task 1 Part B is correct for the target schema, but the current server.json has headers as a simple object, not inside the remotes array
  SCOPE: Task 1 Part B, step 5
  CHANGE: The instruction says to "Convert from the simple key-value object to the structured array format" at the top level, but headers in the current server.json are already nested inside `remotes[0]`, not at the top level. The Task 1 prompt should clarify: convert `remotes[0].headers` from `{"Authorization": "Bearer ${env:WRL_API_KEY}"}` to the structured array format `[{"name": "Authorization", "description": "...", "isRequired": true, "isSecret": true}]`. The prompt's example is correct in structure but might confuse the agent about where the headers live.
  WHY: Minor clarity issue. An agent reading "Headers format: Convert from the simple key-value object to the structured array format" may look for a top-level `headers` field that does not exist. The headers are inside the remotes array entry. Risk is low (the agent will likely figure it out) but worth tightening.
  TASK: Task 1

### Advisory 4: server.json version bump to 1.0.0 should also update src/mcp.js

- [technology-landscape]: The McpServer constructor in src/mcp.js hardcodes version '0.1.0' which will diverge from server.json's 1.0.0
  SCOPE: Task 1, src/mcp.js line 47
  CHANGE: Either update `src/mcp.js` line 47 (`version: '0.1.0'`) to `'1.0.0'` to match, or explicitly note that the version in server.json (registry metadata) is intentionally different from the version in the MCP server handshake. The current Task 1 prompt says "Do not modify src/mcp.js" which will leave them divergent.
  WHY: MCP clients receive the version from the server's `initialize` response (sourced from src/mcp.js). Directory listings will show 1.0.0 from server.json. A client connecting and receiving 0.1.0 in the handshake while the registry says 1.0.0 creates a confusing signal. Either both should be 1.0.0 or the divergence should be documented as intentional.
  TASK: Task 1

### Advisory 5: Schema version 2025-12-11 is confirmed current

- [technology-landscape]: No concerns -- 2025-12-11 is the latest released schema version
  SCOPE: Task 1 Part B, step 1
  CHANGE: None needed. Confirmed via the official CHANGELOG: versions are 2025-07-09, 2025-09-16, 2025-09-29, 2025-10-11, 2025-10-17, 2025-12-11. There is an unreleased draft section but no newer dated release. The plan is targeting the correct schema.
  WHY: Confirmation, not a concern. Noted for completeness.
  TASK: Task 1

### Advisory 6: MCP Registry publish may succeed without npm -- but verify

- [technology-landscape]: The registry quickstart tutorial assumes npm+stdio servers, but remote-only publishing via the remotes field is documented and supported
  SCOPE: Task 2 prompt
  CHANGE: The Task 2 prompt is largely correct. Remote-only servers (no `packages` field, only `remotes`) can be published to the registry. However, the registry performs verification: for `io.github.*` namespaces, it verifies GitHub account ownership. For remote servers, the registry may also verify the URL is reachable. The task prompt should mention that the endpoint must be publicly accessible and responding to MCP requests at publish time.
  WHY: If the MCP endpoint returns 401 (requires auth) during registry verification, the publish may fail. The registry docs state "A remote server MUST be publicly accessible at its specified URL" -- this likely means reachable, not necessarily unauthenticated, but worth noting as a potential failure mode.
  TASK: Task 2
