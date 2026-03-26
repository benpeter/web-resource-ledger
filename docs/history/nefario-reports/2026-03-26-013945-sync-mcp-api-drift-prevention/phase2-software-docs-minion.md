## Domain Plan Contribution: software-docs-minion

### Recommendations

**1. Single source of truth: generate the tool reference from code, maintain prose manually**

The MCP server source (`src/mcp.js`) already contains everything needed to produce a tool reference: tool names, descriptions, Zod parameter schemas with `.describe()` annotations, and required scopes (embedded in handler logic). A lightweight script should extract this structured data and emit a Markdown fragment (the "Available tools" section). The prose sections (Quick Setup, Tutorial, Troubleshooting, Example agent workflows) remain hand-written -- they carry editorial judgment that auto-generation cannot replicate.

This hybrid approach means:
- Tool names, parameters, types, and descriptions are always derived from code -- no manual sync
- Setup instructions, tutorials, and troubleshooting stay human-authored
- The two doc locations (`docs/mcp.md` and `site/content/mcp.md`) should share the same generated fragment via an include or build step, not copy-paste

**2. CI sync check: compare generated fragment against committed docs**

A CI step generates the tool reference fragment from `src/mcp.js` and diffs it against the committed docs. If they diverge, CI fails with a clear message: "MCP docs are out of sync with tool definitions. Run `npm run docs:mcp` to regenerate." This is simpler and more reliable than structural tests that assert on tool counts or parameter names -- those tests are themselves a second source of truth that can drift.

**3. Doc structure that scales to ~15 tools**

At 4 tools, the current flat list works. At 15, it becomes a wall. Recommended structure:

```
## Available tools

### Capture
- capture_url -- submit a new capture
- get_capture -- get status and artifacts for a capture
- list_captures -- list captures with filters

### Verification
- verify_capture -- verify cryptographic integrity

### Webhooks (future)
- create_webhook
- list_webhooks
- ...
```

Group tools by domain (Capture, Verification, Webhooks, Schedules, Account). Each tool entry keeps the current format: description, parameter table, required scope, example output. Add a summary table at the top of the "Available tools" section with all tool names and one-line descriptions, linking to the detail sections below. This gives both scannable overview and deep reference.

**4. Example multi-tool conversations: yes, but keep them task-oriented**

The current tutorial ("capture and verify in 3 tool calls") is the right model. The site version already has an "Example agent workflows" section with two one-liner prompts -- this is good but should be expanded with 2-3 more scenarios that demonstrate multi-tool composition. Format as task descriptions ("Before deploying, preserve evidence...") rather than raw tool call sequences. Agents interpret natural language instructions; showing tool call JSON is useful for debugging but not for the primary audience.

Do NOT add a "conversations" section that simulates chat back-and-forth. That format is verbose, hard to maintain, and couples the docs to specific agent UI patterns.

**5. Consolidate the two doc files**

`docs/mcp.md` (repo docs) and `site/content/mcp.md` (docs site) are nearly identical with minor wording differences. This is a duplication problem waiting to cause drift. Options:
- **Preferred**: `docs/mcp.md` is the source. The site build copies or includes it, with frontmatter injected by the build pipeline.
- **Acceptable**: `site/content/mcp.md` is the source, and `docs/mcp.md` is a symlink or generated copy.

Pick one canonical location. The other derives from it.

### Proposed Tasks

**Task 1: Build tool-reference generator script**
- Input: `src/mcp.js` (parse `server.tool()` calls to extract name, description, Zod schema, scope requirements)
- Output: Markdown fragment with tool name, description, parameter table, required scope
- Approach: Simple AST-free extraction -- the `server.tool()` calls follow a consistent pattern. A Node.js script that imports the Zod schemas or regex-parses the source would work. Prefer the import approach if feasible (more robust to formatting changes).
- Deliverable: `scripts/generate-mcp-docs.js` that writes to `docs/_generated/mcp-tools.md`
- Dependencies: None

**Task 2: Integrate generated fragment into docs**
- Restructure `docs/mcp.md` to include the generated tool reference fragment
- Add domain groupings (Capture, Verification) with a summary table at top
- Keep prose sections (Setup, Tutorial, Troubleshooting, Example workflows) hand-written in the same file, with a clear marker comment where the generated section is inserted
- Deliverable: Updated `docs/mcp.md` with include mechanism
- Dependencies: Task 1

**Task 3: Consolidate docs/mcp.md and site/content/mcp.md**
- Choose one canonical source (recommend `docs/mcp.md`)
- Make the other derive from it (symlink, copy in build, or include)
- Deliverable: Single source of truth for MCP documentation
- Dependencies: Task 2

**Task 4: Add CI sync check**
- Add a CI step that runs the generator and diffs output against committed docs
- Fail with actionable error message if they diverge
- Deliverable: CI job (GitHub Actions step) in the existing workflow
- Dependencies: Task 1

**Task 5: Expand example workflows section**
- Add 2-3 more task-oriented scenarios to the "Example agent workflows" section
- Focus on multi-tool composition: capture + poll + verify, list + filter + verify, scheduled monitoring patterns
- Keep format consistent with existing entries (one-liner prompt descriptions)
- Deliverable: Updated prose in docs
- Dependencies: Task 2

### Risks and Concerns

1. **Generator fragility**: If `server.tool()` call patterns change (e.g., moving to a declarative config object), the generator breaks. Mitigation: the CI check catches this immediately -- generator failure = CI failure = someone fixes it before merge.

2. **Scope extraction is implicit**: The `capture` scope check is embedded in handler logic (`hasScope(auth.scopes, 'capture')`) rather than declared in the tool definition. The generator would need to either parse this from the handler body (fragile) or maintain a small mapping file (`tool-name -> required scope`). This mapping file is a controlled duplication -- small, explicit, and checked by CI.

3. **Zod schema complexity**: The `list_captures` tool has 7 optional parameters with `.optional().default()` chains. The generator must handle these correctly, including default values and enum constraints. Test with the existing 4 tools before assuming it generalizes to 15.

4. **Two-file consolidation may break links**: If `site/content/mcp.md` has been linked from external sources (blog posts, forum answers), changing its nature (from standalone file to derived copy) must preserve the URL. The site build pipeline needs to produce the same output URL regardless of source location.

5. **Example outputs in docs will still drift**: The generated fragment covers parameters and descriptions, but example outputs (the ```` blocks showing tool responses) are hand-written and reflect the text formatting in handler code. These can still drift. Consider: should example outputs also be generated (by running tools against a fixture and capturing output)? This is higher effort but eliminates the last drift vector.

### Additional Agents Needed

None beyond what is presumably already involved. The implementation work (generator script, CI integration) is straightforward backend/tooling work. The doc restructuring and prose writing falls within this minion's domain.
