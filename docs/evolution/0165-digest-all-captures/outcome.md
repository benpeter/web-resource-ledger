# Outcome

- Red first (7d9c260), then green (540c996).
- `src/notifications.js`: `handleWeeklyDigest` selects tenants with captures in the
  period; `sendWeeklyDigestForTenant` adds `other` (all captures minus the active
  schedules' rows). `src/email/templates/weekly-digest.js` renders it as one row
  and counts it in the totals and the preheader. `src/ui/ui-notifications.js`:
  the setting's description.
- Tests: `test/notification-triggers.test.js` (a tenant with only unscheduled
  captures; a tenant with a schedule and other captures),
  `test/email-templates.test.js` (the row and the totals),
  `test/ui-notifications.test.js` (the description).
- Docs: `openapi.yaml` describes `weekly_digest` by what the mail contains (it
  said "capture activity and usage"; the digest has no usage figures); CHANGELOG.

## Backlog changes

- #19 closed: the nudge shipped in phase 0160, the digest change here.
