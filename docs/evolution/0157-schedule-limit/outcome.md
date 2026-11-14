# Outcome

- Red first (d2b96a9, a88d852), then green (10989ba, 685c9f7).
- `POST /v1/schedules` over the limit answers `429` with `limitType: "schedules"`.
- `PUT /v1/admin/tenants/{tenantId}/config` answers `400` for a bad
  `schedules.maxSchedules`; it answered 500.
- Docs: OpenAPI `createSchedule` 429, the schedules guide (states the limit of
  10, indexed again), the limits page (new Schedule Limit section, operator
  overrides for `schedules.maxSchedules` and `rateLimit.capture`, `PUT` replaces
  the whole configuration), and the WRL scheduling cell on the landing and
  compare pages.
- Tests: `test/schedule-limits.test.js`, 4 new tests.

## Backlog changes

- None.
