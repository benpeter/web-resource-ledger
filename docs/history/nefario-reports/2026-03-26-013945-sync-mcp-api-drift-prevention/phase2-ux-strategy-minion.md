## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### 1. Not every API endpoint should be an MCP tool

The success criterion says "All current API endpoints are represented as MCP tools." This is the wrong goal. MCP tool lists are the agent's decision space. Every tool added increases Hick's Law decision time and cognitive load for the LLM selecting which tool to call. The right goal is: **every user-facing job is reachable through MCP tools, with no operational noise.**

Categorize the ~30+ routes into three tiers:

**Tier 1 — Core tools (expose as MCP tools).** These are the jobs an AI agent would be hired to do:

| Tool name | Maps to | Job |
|-----------|---------|-----|
| `capture_url` | `POST /v1/captures` | Capture a page as evidence |
| `capture_batch` | `POST /v1/captures/batch` | Capture multiple pages at once |
| `get_capture` | `GET /v1/captures/:id` | Check capture status/details |
| `list_captures` | `GET /v1/captures` | Find captures by filters |
| `verify_capture` | `GET /v1/verify/:id` | Verify evidence integrity |
| `get_artifact` | `GET /v1/captures/:id/artifacts/:type` | Download a specific artifact |
| `get_certificate` | `GET /v1/captures/:id/certificate` | Get evidence certificate |
| `diff_captures` | `GET /v1/captures/:id1/diff/:id2` | Compare two captures visually |

That is 8 tools. An agent can scan 8 tool names and descriptions in under a second and make a confident selection.

**Tier 2 — Automation tools (expose, but lower priority).** These support workflows an agent might manage:

| Tool name | Maps to | Job |
|-----------|---------|-----|
| `create_webhook` | `POST /v1/webhooks` | Set up capture notifications |
| `list_webhooks` | `GET /v1/webhooks` | See existing webhooks |
| `delete_webhook` | `DELETE /v1/webhooks/:id` | Remove a webhook |
| `create_schedule` | `POST /v1/schedules` | Set up recurring captures |
| `list_schedules` | `GET /v1/schedules` | See existing schedules |
| `get_schedule` | `GET /v1/schedules/:id` | Get schedule details |
| `delete_schedule` | `DELETE /v1/schedules/:id` | Remove a schedule |

That brings the total to 15. Still manageable -- roughly double Stripe's MCP tool count per domain area.

**Tier 3 — Do NOT expose as MCP tools.** These are operational/admin/UI endpoints that don't serve agent jobs:

- `/health` — infrastructure monitoring, not an agent task
- `/ui` — browser-only dashboard
- `/auth/*` — OAuth flow, browser-based, no agent use
- `/v1/account/*` — account management (keys, TOS, settings, notifications) — these are human-to-UI operations
- `/v1/admin/*` — operator-only admin (key management, usage, cache purge, tenant config)
- `/v1/billing/*` — Stripe checkout/portal, browser-only
- `/v1/stripe/webhook` — inbound webhook from Stripe
- `/v1/notifications/*` — unsubscribe/email verify, email-link-driven
- `/.well-known/signing-key(s)` — machine-to-machine key discovery, not a user job
- `/favicon.ico` — obviously not

**Rationale**: An agent that sees `admin_purge_cache` or `account_accept_tos` alongside `capture_url` has to waste context deciding these are irrelevant. Worse, an agent might call admin endpoints it shouldn't. The Kano model classifies these as indifferent or reverse features for the agent user — they add zero value and create confusion risk.

#### 2. Flat namespace with verb_noun naming — no grouping prefixes

MCP tools exist in a flat namespace. Some projects use prefixes like `wrl_captures_list` or `captures.list`. Don't do this. Here's why:

- **Agents don't browse tool lists hierarchically.** They match tool names against intent. `list_captures` matches "list my captures" more naturally than `wrl_captures_list`.
- **Prefixes waste the most scannable part of the name** (the first characters) on redundant context. Every tool already belongs to the WRL server — repeating it is noise.
- **Verb-first naming** (`capture_url`, `verify_capture`, `list_captures`, `diff_captures`) puts the action front-and-center, matching how agents interpret user requests ("verify this capture" -> look for a tool starting with `verify`).

The existing 4 tools already follow this pattern. Maintain it for the new ones. For CRUD operations on webhooks/schedules, use the same pattern: `create_webhook`, `list_webhooks`, `delete_webhook`.

#### 3. Description template — consistent, scannable, action-oriented

Every tool description should follow this template:

```
[One sentence: what it does and what it returns.]
[One sentence: timing expectations or constraints, if any.]
[One sentence: what to do next, if there's a natural workflow continuation.]
```

Example for `diff_captures`:
```
Compare two captures of the same URL and get a summary of visual and content changes. Both captures must be complete. Returns change metrics (HTML changes, header changes, visual similarity score) and artifact URLs for side-by-side screenshots.
```

Why this template:
- **Sentence 1** is what the agent needs 90% of the time — match intent to tool.
- **Sentence 2** prevents the agent from making wrong assumptions (e.g., calling verify on a pending capture, or expecting batch to be instant).
- **Sentence 3** enables tool chaining without the agent having to reason about the full API surface (progressive disclosure of workflow).

Avoid in descriptions:
- Implementation details ("uses Ed25519 with RFC 3161" — put this in the return value, not the selection criteria)
- Auth details (the agent already authenticated at the transport level; repeating "requires read scope" is noise)
- Internal IDs or format details in the top-level description (put format hints in parameter `describe()` strings instead)

#### 4. Parameter descriptions need the same rigor as tool descriptions

The current `capture_url` tool has one parameter: `url` with description "The URL to capture (http:// or https://)." This is good — concise and constraining.

For new tools, apply the same standard:
- **Include format hints**: `capture_id: "The capture ID (format: cap_ followed by 32 hex characters)."` (already done for `get_capture` — maintain this)
- **Include valid values for enums**: Don't just say "artifact type" — say "One of: screenshot, screenshot-before, html, headers, wacz"
- **Default values in the description**: "Maximum results to return (1-100, default 20)" (already done for `list_captures`)

#### 5. Batch tool needs special description treatment

`capture_batch` is the one tool where the mental model diverges from the single-capture flow. The description must make clear:
- It accepts an array of URLs (and the max count)
- It returns an array of capture IDs (one per URL)
- Each capture is independent — some may fail while others succeed
- Use `get_capture` with each ID to check individual results

This prevents the common agent error of treating batch as atomic ("the batch failed" when 1 of 10 URLs was invalid).

### Proposed Tasks

**Task A: Define the tool manifest (precedes implementation)**
- Deliverable: A definitive list of tool names, descriptions, and parameter schemas for all Tier 1 + Tier 2 tools
- This document becomes the source of truth for both implementation and the drift-detection CI check
- Write it as a structured data file (JSON or JS module) that the MCP server imports directly, so the manifest IS the implementation — no separate spec to drift from
- Dependencies: None, but should be reviewed before implementation begins

**Task B: Description audit of existing 4 tools**
- Apply the 3-sentence template to the existing `capture_url`, `get_capture`, `list_captures`, `verify_capture` descriptions
- Remove auth-level details from descriptions (the misleading "no additional auth needed" issue from Phase 0041 was already flagged — verify it was fixed)
- Move implementation details (Ed25519, RFC 3161, WACZ) out of selection-criteria position and into return-value context
- Deliverable: Updated description strings ready for implementation

**Task C: Tool count validation gate**
- Before any implementation PR merges, validate: is the tool count justified? Apply the test: "If I removed this tool, could an agent still accomplish the job using other tools?" If yes, remove it.
- Specifically evaluate: should `get_artifact` be a separate tool, or should `get_capture` return artifact URLs that the agent can fetch directly via HTTP? (Current design already returns URLs in `get_capture` — adding a separate `get_artifact` tool may be redundant.)

### Risks and Concerns

1. **Over-expansion is the biggest risk.** The success criterion "All current API endpoints are represented as MCP tools" will push implementers toward 25+ tools. This is operationally correct but experientially wrong. The criterion should be reframed: "All user-facing jobs are reachable through MCP tools with correct parameters and response types." Admin, billing, auth, and notification endpoints are not agent jobs.

2. **Description drift is a cognitive load problem, not just a correctness problem.** If the drift-detection CI only checks that tools exist but not that descriptions are accurate, agents will make wrong decisions based on stale descriptions. The CI check should validate descriptions against a canonical source, not just tool presence.

3. **`ping_webhook` is a trap.** It exists in the API for developer debugging, but an agent calling `ping_webhook` is almost never what a user wants. If included, the description must explicitly say "For testing webhook delivery — sends a synthetic event, not a real capture notification."

4. **Tool count will grow over time.** Establish a principle now: every new MCP tool requires a JTBD justification ("What job does an agent hire this tool for?"). Without this gate, the tool list will accumulate operational noise over successive phases.

### Additional Agents Needed

- **API design minion** — to validate that the tool parameter schemas faithfully represent the API's actual request/response contracts (I'm evaluating the user-facing shape, not the technical accuracy)
- **MCP/devx minion** (if one exists) — to validate that the naming conventions and description patterns work well with specific MCP clients (Claude Desktop, Cursor, etc.) since different clients render tool lists differently
