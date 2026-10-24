# Outcome

- `PATCH /v1/schedules/{id}` to edit, pause and resume, in OpenAPI.
- MCP `update_schedule`; `list_captures` takes `schedule_id`.
- Dashboard: Pause/Resume, inline Edit, and Captures per schedule with a banner
  and a "Show all captures" link.
- `lastCaptureStatus` follows the capture to `complete` or `failed`; the badge
  shows Error, Skipped and Blocked.
- Change detection compares captures of the same URL only.
- schedules.md: new "Edit, pause or resume a schedule" section; the schedule
  limit counts paused schedules; quota skips set `skipped`.

## Verification

- Red tests first: test/schedule-update.test.js (API, status, change
  detection), MCP tests, test/ui-schedules.test.js (edit body, filter, badge,
  next run, filtered texts).
- Checked in a local preview (wrangler dev with a seeded session and three
  schedules): pause, resume, an invalid cron (the API's reason shows inline), a
  valid edit, the filtered captures list with and without captures, and a
  390 px wide screen.

## Found along the way

- `npm run dev` didn't start since phase 0129: the cron constants were named
  exports of the main module, which workerd treats as entrypoints. Fixed
  separately in #340.
