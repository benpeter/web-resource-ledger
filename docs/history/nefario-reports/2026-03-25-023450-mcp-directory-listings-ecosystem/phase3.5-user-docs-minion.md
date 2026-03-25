ADVISE

- [user-docs]: Cline config should include an explicit caveat in the published docs that Streamable HTTP support is unverified.
  SCOPE: site/content/mcp.md and docs/mcp.md -- the Cline client config section added in Task 1 Part D
  CHANGE: The Cline section must include a visible note adjacent to the config block -- for example: "Note: Streamable HTTP transport support in Cline is unverified. If the connection fails, check [cline/cline#3315](https://github.com/cline/cline/issues/3315) for current status." Do not leave the caveat decision to devx-minion's discretion. Mandate the note in the Task 1 prompt.
  WHY: Users arriving from MCP directory listings will try Cline first based on the published config. If the config silently fails (Streamable HTTP not supported), they lose trust in the docs and in the product -- exactly the wrong first impression from directory traffic. The plan acknowledges this risk (Conflict Resolution #4, Risk #4) but the task prompt says only "add a note if untested" without requiring the note to appear in the published docs. The gap between "devx-minion may add a note" and "the note is required" needs to be closed at the planning level, not left to execution discretion.
  TASK: Task 1 (Part D, Cline config section)
