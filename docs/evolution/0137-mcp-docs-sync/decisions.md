# Decisions

- `test/mcp-sync.test.js` gets two checks: every `server.tool('<name>'` in `src/mcp.js`
  is in `TOOL_TO_OPERATION`, and each has a `| \`name\` |` table row and a
  `#### \`name\`` section in `site/content/mcp.md`. It reads the source as text instead
  of starting the server, like the existing checks read `openapi.yaml`. This would have
  failed in phase 0132, which added `update_schedule` without docs.
- `docs/mcp.md` was a second copy of the guide, unchanged since March (#226) and missing
  two tools. Keeping two copies in sync is the drift that just happened, so it is now a
  pointer to the public page and its source. The file stays, because the README and
  older links point at it.
- MCP `list_schedules` printed the stored `nextRunAt` for paused schedules, so an agent
  that paused a schedule through `update_schedule` saw it as active with a next run. It
  now prints `Status:` and `Next run: (paused)`, the same words `update_schedule` uses,
  and what the dashboard has shown since phase 0132.
- The `get_usage` example showed a date range as the period and a paid tenant; it now
  shows the `YYYY-MM` period and the free limits the code prints.
- The README described the MCP server as "all four core operations"; it lists what the
  13 tools do, without a count that would go stale.
