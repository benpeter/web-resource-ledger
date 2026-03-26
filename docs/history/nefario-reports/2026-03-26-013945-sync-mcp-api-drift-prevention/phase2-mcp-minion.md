## Domain Plan Contribution: mcp-minion

### Recommendations

#### 1. Endpoint Classification: Tools vs Resources vs Omitted

After reviewing all ~25 endpoints against their auth schemes, MCP usage patterns, and the principle of avoiding the API-wrapper-one-on-one anti-pattern, here is my classification:

**New MCP Tools (add 7, total 11)**

| Tool Name | Endpoint(s) | Rationale |
|-----------|-------------|-----------|
| `capture_url` | POST /v1/captures | Already exists. No changes needed. |
| `batch_capture` | POST /v1/captures/batch | High-value for agents doing bulk archival. Distinct workflow from single capture. |
| `get_capture` | GET /v1/captures/{id} + GET /v1/captures/{id}/status | Already exists. Consider merging status polling into this tool (see below). |
| `list_captures` | GET /v1/captures | Already exists. No changes needed. |
| `verify_capture` | GET /v1/verify/{id} | Already exists. No changes needed. |
| `diff_captures` | GET /v1/captures/{baseId}/diff/{targetId} | Core analytical tool -- agents compare captures to detect changes. High MCP value. |
| `get_usage` | GET /v1/account/usage | Agents need quota awareness before submitting captures/batches. Lightweight read. |
| `list_schedules` | GET /v1/schedules | Read existing schedules. Paired with create/delete for full schedule management. |
| `create_schedule` | POST /v1/schedules | Agents should be able to set up recurring captures. |
| `delete_schedule` | DELETE /v1/schedules/{id} | Completes the schedule CRUD. |
| `get_certificate` | GET /v1/captures/{id}/certificate | Generates PDF evidence certificate. Useful for legal/compliance agent workflows. Return as resourceLink URL, not binary content. |

**Omit from MCP (with reasoning)**

| Endpoint | Why omit |
|----------|----------|
| GET /v1/captures/{id}/artifacts/{name} | Returns binary blobs (PNG, WACZ, HTML). MCP tools return text content, not binary streams. The `get_capture` tool already provides artifact URLs that the user/agent can fetch directly. |
| GET /v1/captures/{id}/status | Merge into `get_capture`. The existing tool already handles pending/complete/failed states. A separate lightweight status tool adds cognitive load without distinct value for an AI agent. |
| GET /.well-known/signing-key(s) | Public key material for independent verification. Not an agent action -- these are consumed by verification tooling, not LLMs. |
| POST /v1/admin/keys, DELETE /v1/admin/keys/{hash} | Admin auth scheme (ADMIN_KEY, not tenant API key). MCP auth uses tenant bearer tokens. Exposing admin endpoints through a tenant-authed MCP channel is a security boundary violation. |
| GET /v1/admin/usage | Same admin auth issue. Tenant-scoped usage is available via `get_usage`. |
| POST /v1/admin/cache/purge | Infrastructure operation, admin auth. Not appropriate for MCP. |
| POST /v1/webhooks, GET /v1/webhooks, DELETE /v1/webhooks/{id}, POST /v1/webhooks/{id}/ping | Webhook management is configuration, not an agent workflow. An LLM registering webhook endpoints would need to know infrastructure URLs. Low agent value, moderate security risk. Defer unless user demand emerges. |
| GET/PUT /v1/account/notifications | Email notification preferences. UI/settings concern, not agent workflow. |
| GET /v1/notifications/unsubscribe | One-click email action. Not an MCP use case. |

**Rationale for 11 tools (not more)**

11 tools is within the comfortable range for MCP tool selection. Research shows that beyond ~15 tools, LLM task completion rates degrade. The current 4 is too few given the API surface. 11 covers all tenant-facing agent workflows without crossing into admin/infrastructure territory.

#### 2. Naming Convention

Current names (`capture_url`, `get_capture`, `list_captures`, `verify_capture`) are already clean and follow a `{verb}_{noun}` pattern scoped to WRL. Since all tools live under a single `web-resource-ledger` MCP server, the server name provides the service namespace -- tool names do not need a `wrl_` prefix.

**Naming convention for all tools:**

```
{verb}_{noun}           -- for unique nouns
{verb}_{qualified_noun} -- when disambiguation needed
```

Applied:
- `capture_url` (existing)
- `batch_capture` (not `capture_urls` -- "batch" conveys multi-item semantics)
- `get_capture` (existing)
- `list_captures` (existing)
- `verify_capture` (existing)
- `diff_captures` (verb=diff, noun=captures, two IDs)
- `get_usage` (tenant usage, not admin)
- `list_schedules` / `create_schedule` / `delete_schedule`
- `get_certificate` (for capture certificate PDF)

This scales to 15+ tools without collision. If webhooks are added later: `list_webhooks`, `create_webhook`, `delete_webhook`.

#### 3. Auth Scheme Modeling

The MCP server authenticates with tenant bearer tokens (`bearerAuth`). Admin endpoints use a separate `adminAuth` scheme. These are fundamentally different security principals.

**Recommendation: Do NOT mix auth schemes in a single MCP server.**

Admin operations should remain CLI/API-only. If admin MCP access is ever needed, it should be a separate MCP server with its own auth boundary (`web-resource-ledger-admin`). This follows the single responsibility pattern and prevents privilege escalation.

For the tenant MCP server, scope checks remain as-is:
- Tools that read: require `read` scope (enforced at MCP auth gate)
- `capture_url` and `batch_capture`: require `capture` scope (checked in tool handler)
- `create_schedule`: requires `capture` scope (schedules create captures)
- `delete_schedule`: requires `read` scope (only deletes own schedules)

#### 4. Artifact Downloads and Binary Content

Artifact downloads (`/artifacts/{name}`) return binary content (PNG, WACZ zip, raw HTML). MCP tools return `TextContent`, `ImageContent`, or `EmbeddedResource` items.

**Recommendation: Do NOT create an `download_artifact` tool.**

Instead:
- `get_capture` already returns artifact URLs in its text output
- For the certificate PDF, `get_certificate` should return a `resourceLink` pointing to the URL, not embed the binary
- If an agent needs to analyze a screenshot, it can use the URL directly with its host's image capabilities

This avoids context window pollution from large binary payloads and follows the MCP pattern of returning references to large content rather than embedding it.

#### 5. Batch Capture Modeling

The batch endpoint has unique semantics (207 Multi-Status, per-item results). Model this as a single tool with array input:

```
batch_capture:
  input: { urls: string[] }
  output: text summary of accepted/failed items with capture IDs
```

Return a human-readable summary (e.g., "3/5 URLs accepted") plus per-item details. Do not try to return structured JSON -- the text output should be scannable and actionable.

The 20-item batch limit is enforced server-side. Document it in the tool description.

#### 6. Diff Captures Modeling

The diff endpoint has a rich response shape (HTML hunks, header changes, screenshot comparison). The MCP tool should return a text summary:

```
diff_captures:
  input: { base_id: string, target_id: string, include?: string }
  output: text summary of changes across sections
```

The `include` parameter maps to the API's comma-separated section filter. Default to all sections. Format the output as a structured text report the agent can reason about.

### Proposed Tasks

**Task 1: Add 7 new tool definitions to `src/mcp.js`**
- Tools: `batch_capture`, `diff_captures`, `get_usage`, `list_schedules`, `create_schedule`, `delete_schedule`, `get_certificate`
- Each tool: Zod input schema, handler calling existing business logic, text output formatting
- Scope checks: `capture` scope for `batch_capture` and `create_schedule`
- Dependencies: Existing business logic modules (db.js, etc.) must export the needed functions. Check if they exist or need to be imported.
- Deliverable: Updated `src/mcp.js` with 11 tools

**Task 2: Update tests in `test/mcp.test.js`**
- Add `tools/list` assertion for 11 tools (currently asserts 4)
- Add happy-path and error-path tests for each new tool
- Dependencies: Task 1
- Deliverable: Updated test file passing all assertions

**Task 3: Create drift detection test**
- A test that parses `openapi.yaml` and compares the set of tenant-facing endpoints against the MCP tool registry
- Maintains an explicit "omitted endpoints" allowlist with reasons
- Fails CI when a new endpoint appears in the OpenAPI spec that is not either (a) registered as an MCP tool or (b) listed in the allowlist
- Dependencies: None (can be done in parallel with Task 1)
- Deliverable: New test file `test/mcp-drift.test.js`

**Task 4: Update `docs/mcp.md`**
- Add documentation for all 7 new tools (parameters table, example output, required scopes)
- Update "Available Tools" count
- Add section explaining which endpoints are intentionally omitted and why
- Dependencies: Task 1
- Deliverable: Updated docs/mcp.md

**Task 5: Update MCP server version**
- Bump `version` in McpServer constructor from `'0.1.0'` to `'0.2.0'` to reflect the expanded tool surface
- Dependencies: Task 1
- Deliverable: Version bump in src/mcp.js

### Risks and Concerns

1. **Business logic imports**: The new tools need to call functions like `batchCapture()`, `diffCaptures()`, `createSchedule()`, etc. These may live in route handlers rather than being extracted into importable business logic functions. If so, extraction is prerequisite work that could expand scope significantly.

2. **Context window at 11 tools**: 11 tools with descriptions is within safe range, but the descriptions must stay concise. The current `capture_url` description is 3 lines -- acceptable. New tool descriptions should not exceed this. Bloated descriptions push toward context window degradation.

3. **Batch capture complexity**: The 207 Multi-Status response is inherently complex to render as text. The tool handler needs to format per-item results clearly. If an agent submits 20 URLs and 5 fail, the output must be scannable. Test with maximum batch sizes.

4. **Schedule creation scope**: Creating a schedule implicitly commits to future captures (quota consumption). The tool description must make this clear so the agent/user understands the commitment. Consider whether a `capture` scope check is sufficient or if a separate `schedule` scope is warranted.

5. **Drift detection false positives**: New OpenAPI endpoints that are intentionally omitted (e.g., health checks, internal endpoints) will trip the drift test. The allowlist must be maintained. Risk: developers add endpoints and forget to update the allowlist, causing CI failures. Mitigation: clear error message in the test output explaining what to do.

6. **Certificate tool returning a URL vs content**: The PDF is generated on-demand and could be large. Returning a URL is correct, but the agent may not have a way to present or download it. The text output should include both the URL and a brief description of what the certificate contains.

### Additional Agents Needed

None. The tasks are well-scoped to MCP server implementation (my domain), existing test patterns, and documentation. If business logic extraction (Risk #1) turns out to be needed, a backend-minion or the implementer can handle it as part of Task 1 -- it does not require a separate specialist plan.
