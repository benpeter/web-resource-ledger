# Domain Plan Contribution: devx-minion

## Recommendations

### Which MCP clients to target (beyond Claude Code, Cursor, Windsurf)

**Primary recommendation: VS Code with GitHub Copilot**

This is the clear winner for the "at least one other MCP client" requirement. Rationale:

1. **Largest user base by far.** VS Code is the dominant IDE; GitHub Copilot is embedded in it by default. The addressable audience dwarfs every other MCP client combined. Every developer who finds WRL on a directory listing likely already has VS Code.

2. **Native Streamable HTTP support.** VS Code uses `type: "http"` in `.vscode/mcp.json` and natively tries Streamable HTTP first, falling back to SSE. No bridge tools needed. WRL's transport works out of the box.

3. **Secure credential handling built in.** VS Code supports `${input:variable-id}` for secrets, so the example can show best-practice credential management instead of hardcoded tokens.

4. **Directory traffic conversion.** Someone clicking through from MCP.so or Smithery is overwhelmingly likely to be a VS Code user. Having a VS Code snippet on the landing page removes the "how do I use this?" friction immediately.

**Secondary recommendation: Cline**

Add Cline as well -- it is low effort because the config format is nearly identical to Cursor (`mcpServers` with `url` and `headers`), and Cline has 5M+ installs on the VS Code marketplace. It is specifically popular among developers who actively seek out and install MCP servers, making it a high-intent audience.

**Not recommended for initial scope:**

- **Zed**: Stdio-only natively. Requires `mcp-remote` as a bridge (`npx -y mcp-remote <url> --header "Authorization:Bearer KEY"`). This adds friction and a Node.js dependency just to connect. The config is unintuitive for newcomers. Low user base relative to effort. Add later if Zed ships native HTTP support.

- **Continue**: Pivoted to a CLI-first code-checks platform in mid-2025. Its MCP support exists but is secondary to its new mission. The YAML config is straightforward (`type: streamable-http`, `url`, `requestOptions.headers`) but the audience overlap with WRL's use case (evidence capture, legal compliance) is minimal. Continue users are running code quality checks, not capturing web pages.

- **Custom SDK usage (TypeScript MCP SDK)**: A programmatic example showing how to connect via `@modelcontextprotocol/sdk` is valuable but serves a different audience (developers building automations, not developers using an IDE). Defer to a separate "Programmatic Usage" page or blog post. The directory listings should focus on "paste this config, start using it" experiences.

### What each example should cover

**Config snippet + worked scenario.** Not just the JSON/YAML -- a complete "zero to first capture" path. Here is why:

- Directory traffic lands cold. The user knows nothing about WRL. A config snippet alone says "here is how to connect" but not "here is why you would."
- The existing tutorial in `site/content/mcp.md` is excellent (capture, poll, verify in 3 steps) but it is client-agnostic. Each client example should show the config AND reference the tutorial, creating a smooth reading path: connect -> first capture -> verify.

**Structure per client example:**

1. **Config snippet** (copy-pasteable, with file path noted so users know where to put it)
2. **One sentence on what WRL does** (for context when scanning)
3. **"Try it" prompt** -- a natural language instruction the user can paste into their AI assistant to trigger a capture. This is the "hello world" moment. Example: *"Capture https://example.com as tamper-evident evidence and verify it."*
4. **Link to the full tutorial** for the complete workflow

This keeps each client section to roughly 15-25 lines -- scannable, actionable, self-contained as a quick-start entry point.

### How examples should be structured in the repo

**Single page, not separate files per client.** The existing `docs/mcp.md` and `site/content/mcp.md` pattern is correct. All client configs live in the Setup section of the MCP page, organized by client name with anchor links. Reasons:

- **One URL to submit to directories.** Every directory listing points to `https://docs.webresourceledger.com/mcp/`. The user lands on one page with their client's config, the tool reference, and the tutorial. No click-through required.
- **Maintenance burden.** Separate pages per client means N pages to keep in sync when the API changes. One page means one update.
- **Discoverability.** A developer who uses Cline but also has Cursor installed sees both configs on the same page. Cross-pollination.

**Ordering within the Setup section should be by user base size:**

1. VS Code (GitHub Copilot) -- largest audience
2. Claude Code -- existing, keep it
3. Cursor -- existing, keep it
4. Cline -- new, very similar to Cursor
5. Windsurf -- existing, keep it
6. Generic MCP client -- catch-all for everything else

This puts the most likely match first for a cold visitor.

### Directory landing page optimization

Yes, examples should be self-contained enough to serve as quick-start entry points. Directory listings on MCP.so, Smithery, and Glama typically link to a single URL. That URL needs to answer three questions in under 30 seconds:

1. **What does this do?** (one paragraph)
2. **How do I connect it?** (config snippet for my client)
3. **What can I do with it?** (tool list + try-it prompt)

The current `site/content/mcp.md` is close to this but opens with a paragraph before the setup section. Consider adding a "Quick start" anchor that directory listings can deep-link to: `https://docs.webresourceledger.com/mcp/#setup`.

### Specific config snippets to add

**VS Code (GitHub Copilot):**

```json
// .vscode/mcp.json
{
  "servers": {
    "wrl": {
      "type": "http",
      "url": "https://api.webresourceledger.com/mcp",
      "headers": {
        "Authorization": "Bearer ${input:wrl-api-key}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "wrl-api-key",
      "description": "WRL API key (capture + read scopes)",
      "password": true
    }
  ]
}
```

Note: VS Code's `${input:}` variable pattern is the recommended way to handle secrets. The user is prompted once, and the value is stored securely. This is a better practice than hardcoding the key, and worth calling out in the example.

**Cline:**

```json
// cline_mcp_settings.json (via Cline > MCP Servers > Configure)
{
  "mcpServers": {
    "wrl": {
      "url": "https://api.webresourceledger.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

Note: Cline's format is identical to Cursor except for where the file lives. The example should note the access path (Cline sidebar > MCP Servers > Configure).

## Proposed Tasks

### T1: Add VS Code (GitHub Copilot) config to MCP docs
- Add VS Code section to both `docs/mcp.md` and `site/content/mcp.md`
- Include the `${input:}` variable pattern for secure credential handling
- Note both workspace-level (`.vscode/mcp.json`) and user-level config paths
- Add a "try it" prompt example
- Estimated effort: small

### T2: Add Cline config to MCP docs
- Add Cline section to both `docs/mcp.md` and `site/content/mcp.md`
- Note that Cline config is accessible via Cline sidebar > MCP Servers > Configure
- Config format mirrors Cursor -- call this out to reduce cognitive load
- Estimated effort: small

### T3: Reorder Setup sections by audience size
- Move sections into the recommended order: VS Code, Claude Code, Cursor, Cline, Windsurf, Generic
- Apply to both `docs/mcp.md` and `site/content/mcp.md`
- Estimated effort: trivial

### T4: Add "try it" prompt to each client section
- After each config snippet, add a one-liner natural language prompt the user can paste into their AI assistant:
  > Try it: ask your assistant "Capture https://example.com as evidence and verify it"
- This is the "hello world" moment. It triggers `capture_url` and `verify_capture` in sequence, demonstrating the full value proposition in one interaction.
- Estimated effort: trivial

### T5: Add deep-linkable anchor for directory listings
- Ensure the Setup section has a clean anchor (`#setup`) that directory listings can link to directly
- Verify the docs site renders anchors correctly for `#setup`, `#vscode`, `#claude-code`, `#cursor`, `#cline`, `#windsurf`
- Estimated effort: trivial

### T6: Validate all config snippets against live API
- Test each config snippet (VS Code, Claude Code, Cursor, Cline, Windsurf) against the production MCP endpoint
- Confirm that the `capture_url` -> `get_capture` -> `verify_capture` flow works end-to-end from each client
- Success criteria from issue #114: "Integration examples are tested and working against the current API"
- Estimated effort: medium (requires having each client installed or accessible)

### T7: Keep docs/mcp.md and site/content/mcp.md in sync
- After all additions, diff the two files and ensure they are consistent
- The repo-level `docs/mcp.md` uses `capture_url` while the site uses `capture_page` -- this discrepancy exists today and should be resolved as part of this work
- Estimated effort: small

## Risks and Concerns

### R1: Tool name inconsistency between docs
The repo `docs/mcp.md` references `capture_url` while `site/content/mcp.md` references `capture_page`. Directory traffic will hit the site version. If the actual MCP tool is named `capture_url`, then `site/content/mcp.md` has a bug that will confuse every new user who tries the tutorial. This must be resolved before directory submissions go out -- it is the first thing a new user will try.

### R2: Cline Streamable HTTP support uncertainty
There is a GitHub issue (cline/cline#3315) reporting that Cline does not work with Streamable HTTP transport. The Cline docs show SSE config but the streamable HTTP support status is unclear. Before publishing the Cline example, we must verify that the config actually works. If Cline only supports SSE, we either need to confirm WRL falls back to SSE or note the limitation. Risk mitigation: test before publishing.

### R3: VS Code input variable behavior across versions
The `${input:}` pattern in `.vscode/mcp.json` is a VS Code feature that prompts the user for a value. This is the recommended approach, but older VS Code versions may not support it for MCP configs. The example should note the minimum VS Code version required, or provide a fallback with a hardcoded placeholder.

### R4: Config drift across clients
Five client configs means five things to update when the API endpoint or auth scheme changes. The risk is low (endpoint URLs rarely change) but worth noting. The mitigation is the single-page structure -- one page to update, not five.

### R5: Directory listing URLs must remain stable
Once directory submissions point to `https://docs.webresourceledger.com/mcp/`, that URL must not change or break. If the site restructures, a redirect must be in place. This is a hard requirement for directory SEO and user trust.

### R6: Testing across all clients is time-consuming
Issue #114 requires examples to be "tested and working against the current API." Testing VS Code, Claude Code, Cursor, Cline, and Windsurf each requires having the client installed and configured. Some of these may not be available in the current development environment. Mitigation: prioritize testing VS Code and Claude Code (largest audiences), and note which clients were tested in the PR.

## Additional Agents Needed

**mcp-minion**: Should validate the tool name discrepancy (is it `capture_url` or `capture_page`?) and confirm the MCP server's transport compatibility with each client, particularly whether Cline's Streamable HTTP support works or if SSE fallback is needed.

No other additional agents needed beyond what is already planned (product-marketing-minion for directory listing copy).
