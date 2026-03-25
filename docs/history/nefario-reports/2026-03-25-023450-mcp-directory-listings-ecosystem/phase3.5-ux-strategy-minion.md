## UX Strategy Review: MCP Directory Listings and Ecosystem (R35)

**Verdict: ADVISE**

---

### Review Summary

The plan is coherent and well-sequenced. The Task 1 gate correctly blocks all external submissions until docs are accurate — directory traffic sent to a page with `capture_page` would hit a broken tool name on their first call, which would be a trust-destroying first impression. That sequencing is the right call.

The 6-client setup section is manageable. Each client has a structurally different config format (bash CLI, VS Code's `inputs` block, Cursor/Cline JSON, Windsurf's `serverUrl` variant), so per-client detail is necessary — collapsing them would produce errors, not simplicity. Users scan for their client name and stop reading; this is satisficing behavior working in our favor. The ordering by audience size (VS Code first) is correct.

The directory descriptions match audience jobs: MCP directories get agent-capability framing; IIPC gets WACZ/signing framing with no AI language. The `*(In Development)*` status tag for IIPC is exactly right.

One placement issue to address:

---

- [ux-strategy]: "Try it" callout is placed after 6 client configs, past where first-time visitors are making their "is this worth setting up?" decision
  SCOPE: `site/content/mcp.md` and `docs/mcp.md`, Task 1 Part E
  CHANGE: Move the "Try it" callout to immediately before the first client config section (before VS Code), not after the last one. Position it as a one-line teaser that sets expectations before the user commits to the setup:

  ```
  > **Try it:** Ask your agent: *"Capture https://example.com as evidence and verify it."*
  ```

  Place this directly after the opening paragraph ("The MCP server uses Streamable HTTP transport...") and before the `## Setup` heading, or as the first element under `## Setup` before the first `###` client section.
  WHY: Directory traffic lands cold — they haven't decided to set up yet. The question in their mind is "will this work for my agent?" not "which client config do I use?" The callout answers that question in one sentence. Placed after 6 client configs, it functions as a post-setup reminder for users who already committed; placed before setup, it functions as a conversion signal that motivates the setup. The job is "help me decide if this is worth 2 minutes of config" — that job is best served at the top of the section, not the bottom.
  TASK: Task 1, Part E (placement instruction)

---

### Non-issues confirmed

- **6 clients on one page**: Not a cognitive load problem. Config snippets are structurally parallel; client name acts as a scannable anchor. Users read one section and stop.
- **VS Code `inputs` block asymmetry vs other clients**: The VS Code config is deliberately more complex (secure key prompt). This is not an inconsistency — it reflects VS Code's superior secrets handling. The agent should preserve this difference, not flatten it.
- **IIPC audience positioning**: Correctly strips all MCP/AI framing. "API-first", "Self-hostable", "*(In Development)*" — all correct signals for that community.
- **`batch_capture` removal**: The right call. A phantom tool in docs is a user trap; removal is the correct fix.
- **Cline caveat**: Including with a note about unverified Streamable HTTP support is the honest, user-respecting approach.
