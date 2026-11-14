# Outcome

- Red first (29c35f0), then green (e7f36c5).
- `src/schedules.js`: `publicSchedule()` on create, list, get and update.
- `openapi.yaml`: `ChangeSummary` component; `Schedule.changeSummary`,
  `Schedule.updatedAt` and the `nextRunAt` wording; `VerificationCapture.url`
  (required) and the verify examples; `qualifiedTimestamp` in the check enum, the
  checks description and `VerificationSigning`; the `skip` meaning; admin
  `usageHistory[].updatedAt`. `lint:api` back at its 12 accepted warnings.
- Docs: verification guide (REST example with `url`, how the JSON splits time
  verification into two checks), schedules guide (list example with
  `changeSummary` and `updatedAt`); CHANGELOG.
- Tests: `test/schedule-crud.test.js` checks the four responses for `tenant_id`.

## Backlog changes

- None.
