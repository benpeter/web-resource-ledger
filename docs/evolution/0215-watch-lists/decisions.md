# Decisions

- A watch list is a schedule with several URLs, not a new resource. Schedules
  already have the cron, pause, edit, limit, threat check, quota handling,
  weekly digest and change detection a watch list needs, and
  `getPreviousCaptureId` already compares a schedule's capture only with
  earlier captures of the same URL (phase 0132), so diffs stay per page.
- Migration 0020 adds a nullable `urls` column (JSON array). It is set only
  for more than one URL; `url` always holds the first, so code that reads
  `url` alone (the digest, logs, older dashboards) keeps working. The API
  always returns `urls`, with one entry for a single-URL schedule.
- Create and PATCH take `url` or `urls`, not both. `urls` replaces the whole
  list; `url` turns a list back into one page. Every URL goes through
  `validateUrl`; a URL listed twice is refused, since the run would capture it
  twice and the second capture would be compared with the first.
- Up to 100 URLs per schedule: one `sendBatch` call, and a size that covers a
  site's policy pages or a product range. The 10-schedule limit is unchanged.
- Quota: the scheduler's one check per tenant now counts every URL of the due
  schedules. When the quota left can't cover them all, those runs are skipped
  as before, rather than capturing an arbitrary part of a list.
- The scheduler sends a schedule's queue messages only after `next_run_at`
  moved. Before, one capture was created and the schedule advanced in the
  same step; with several captures per run, a failed advance would otherwise
  enqueue the whole list again every minute.
- A flagged URL is skipped and logged; the rest of the list is captured. Only
  a list whose every URL is flagged gets `lastCaptureStatus: blocked`.
- `lastCaptureId` is the capture of the last URL. A per-URL status table was
  not added: `GET /v1/captures?schedule_id=` already lists every capture of a
  run, and the dashboard's Captures link filters by schedule.
- Dashboard: the URL field is a textarea, one URL per line, for create and
  edit; the row shows the first URL and "and N more". MCP `create_schedule`
  and `update_schedule` take `urls`; `list_schedules` prints a list's URLs.
