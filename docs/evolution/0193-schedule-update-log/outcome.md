# Outcome

- Red first (d1c1365): two tests that read the log line of a schedule
  update, one through `PATCH /v1/schedules/{id}` and one through the MCP
  tool `update_schedule`. Green in ec9b29b.
- `src/schedules.js`: `schedule.updated` logs `fields` instead of `changed`.
- `src/mcp.js`: `update_schedule` logs `schedule.updated` instead of
  `schedule.update`.
- `docs/operations/coralogix-events.md`: a row for `schedule.updated`, which
  was missing, and the rule that a field name has one type, with the query
  that finds events stored as `text`.

## Backlog changes

None. The hourly schedule was Ben's own setting and he changed it himself.
