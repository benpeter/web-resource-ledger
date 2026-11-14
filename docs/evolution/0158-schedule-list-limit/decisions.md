# Decisions

- The API sends what the dashboard already reads: `GET /v1/schedules` returns
  `{ data, limit }`, the effective limit from the tenant config. The dashboard
  code is unchanged. Adding a field is backwards compatible.
- MCP `list_schedules` starts with "N of LIMIT schedules", and the empty answer
  says how many the account can have, so an agent knows the room left before it
  calls `create_schedule`. The tool description is unchanged; the output says it.
- One extra D1 read per list call (`getTenantConfig`), the same read schedule
  creation makes. Not worth caching.
