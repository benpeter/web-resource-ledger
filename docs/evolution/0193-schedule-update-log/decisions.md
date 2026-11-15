# Decisions

- The scheduler was right. The schedule's cron was hourly until
  2026-11-15 14:49 UTC, when it was edited to `0 */6 * * *` through the API
  with Ben's key. The skipped runs show it: one per hour up to 14:00 UTC,
  then 18:00 and 00:00. `nextRunAfter()` gives the six-hour times for every
  hour of that day when run under UTC, which is the Worker's time zone. The
  odd times seen earlier that evening came from running it on a Mac in CET.
  So no change to `src/cron.js` or `src/scheduler.js`.
- Finding that edit took a detour, and that is what this phase fixes. The
  `schedule.updated` line was in Coralogix, but as one unparsed `text`
  string, so a query on `$d.event` did not return it. It logged the edited
  fields as a list named `changed`. The compare events log `changed` as true
  or false, and Coralogix keeps one type per field name.
- The REST handler now logs the list as `fields`, the name the MCP tool
  already used for the same thing. No other event logs `fields`.
- The MCP tool logged the same edit as `schedule.update`. It now uses
  `schedule.updated`, so one query finds an edit whichever way it was made.
  `schedule.created` and `schedule.deleted` already had one name for both.
- Checked the last 36 hours of production and staging logs for other events
  stored as `text`: this was the only one.
- No changelog entry: the API and its answers are unchanged.
