# Outcome

- Red first (14bfe37), then green (d519d5a).
- Helpers in the dashboard source: `scheduleNudgeHref`, `schedulePrefillUrl`
  (ui-schedules), `detail_showScheduleNudge` (ui-detail),
  `submit_showScheduleNudge` and `submit_maybeShowScheduleNudge` (ui-submit). The
  router accepts `/schedules?url=...`.
- Tests: `test/ui-schedules.test.js` (link encoding, prefill with and without a
  URL, non-http(s) and broken encoding refused, who sees the nudge).
- Checked in a browser against a local stub of the API: the capture page link
  opens the form with `https://example.com/pricing?plan=pro&x=1` filled in; the
  list hint appears above the table after a capture completes, "Not now" removes
  it, a second capture doesn't bring it back, and an account with a schedule
  never sees it.
- Docs: the schedules guide's "Create a schedule" section; CHANGELOG.

## Backlog changes

- #19: corrected the comment that said only the founder had captured; the nudge
  is done, the digest widening stays open there.
