# Prompt

Same session as phases 0133 to 0136 (Ben, 2026-11-14: "don't forget about docs, all the
surfaces like MCP and API ... also check if anything has been missed in the past").

Checking the MCP docs against `src/mcp.js` found that `update_schedule` (phase 0132) has
no entry on the public MCP page, the `schedule_id` filter on `list_captures` isn't
documented, `docs/mcp.md` hasn't changed since March and lacks `read_sitemap` and
`update_schedule`, and MCP `list_schedules` doesn't show whether a schedule is paused,
although `update_schedule` can pause it. The sync test from #226 compares tools with the
OpenAPI spec but not with the docs.
