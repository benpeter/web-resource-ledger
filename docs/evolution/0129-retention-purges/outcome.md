# Outcome

- Quarantine purge and usage-counter trimming run every Monday at 09:00 UTC and
  log `retention.quarantine_purged` and `retention.usage_trimmed`.
- The weekly digest moves from Sunday to Monday, as intended.
- Scheduled captures no longer run twice at the weekly cron.
- data-retention.md describes the real R2 key layout and the jobs.
- Tests: test/retention.test.js (9). The meter test used a cron production
  doesn't configure (`0 * * * *`) and now uses the per-minute cron.
