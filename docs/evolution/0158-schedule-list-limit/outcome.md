# Outcome

- Red first (70c7dfb), then green (738d469).
- `GET /v1/schedules` returns `limit`; MCP `list_schedules` shows "N of LIMIT
  schedules".
- Docs: OpenAPI `ScheduleListResponse` (`limit`, required) and examples, the
  schedules guide's list example, the limits page, the MCP guide's example output.
- Tests: `test/schedule-limits.test.js` (default and admin-set limit),
  `test/mcp.test.js` (`list_schedules` with and without schedules).

## Backlog changes

- None.
