# Outcome

- `src/notifications.js`: `handleWeeklyDigest(env, now)`, dates for the template,
  `dedupPeriod` removed. `src/index.js`: the weekly cron passes `scheduledTime`.
- `test/notification-triggers.test.js`: subject and text name the period as dates. Red
  first (b9be618).
- CHANGELOG under Fixed.

## Backlog changes

- benpeter/wrl-backlog#19: commented that its trigger isn't met and that the digest
  works; stays in Next.
