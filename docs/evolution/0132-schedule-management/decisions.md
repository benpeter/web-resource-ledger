# Decisions

## What already existed

- `schedules.paused` and the scheduler's `WHERE paused = 0` came with phase
  0059, but nothing could set the column.
- `GET /v1/captures?schedule_id=` worked; OpenAPI didn't list it, and neither
  MCP nor the dashboard used it.

## API

- `PATCH /v1/schedules/{id}` takes any of `name`, `url`, `cron`, `paused`. `url`
  and `cron` get the same checks as create (URL validation, at most hourly).
  The checks live in `validateScheduleUpdate`, shared by the HTTP handler and
  the MCP tool, so the two can't drift.
- Resuming, or a new cron, sets `next_run_at` to the next cron time after now
  (`withNextRun`). Keeping the old value would have fired every missed run's
  worth at once on the next tick, which is never what someone resuming wants.
- A paused schedule still counts toward the schedule limit. Pausing is for
  keeping a schedule's settings, not a way around the limit.

## Status and change detection

- `last_capture_status` stayed `pending` forever: the scheduler wrote it when it
  queued the capture and nothing updated it. `completeCapture` and `failCapture`
  now update the schedule whose `last_capture_id` is that capture, in the same
  D1 batch.
- Change detection compared a schedule's capture with the schedule's previous
  capture. After a URL edit that would compare two different pages. It now
  compares with the previous capture of the same schedule and the same URL, so
  editing the URL starts a new baseline.

## Dashboard

- Each schedule row has Captures (opens `#/captures?schedule=<id>`), Pause or
  Resume, Edit (inline form under the row) and Delete. The router matched the
  whole hash, so `#/captures?schedule=` fell through to "not found"; it now
  ignores the query part.
- The status badge read `lastRunStatus`, a field the API never sends, so a
  schedule whose last capture failed showed "Active". It reads
  `lastCaptureStatus` and adds Skipped (quota) and Blocked (threat check), which
  the scheduler also writes.
- A paused schedule shows no next run: resuming replaces the stored value.
- Badges moved under the URL so the four buttons fit on one line at desktop
  width. Found in a local preview, as were the filter banner position and the
  empty-list text.

## MCP

- `update_schedule`, and `schedule_id` on `list_captures`.
