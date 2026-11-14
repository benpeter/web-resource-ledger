# Outcome

- `migrations/0019_deletion_request.sql`; `src/db.js` (request, cancel, list object
  keys, delete rows); `src/admin.js` (three handlers); `src/quotas.js`,
  `src/scheduler.js`, `src/index.js` (403 for account refusals, routes);
  `src/admin-dashboard.js` (`deletionRequestedAt`).
- Tests, red first (8fbe255, 150fedc): `test/tenant-deletion.test.js`, nine tests: request,
  cancel, purge guards, a purge that leaves no row, object or KV entry of the tenant and
  touches nothing of another, and the 403 for a blocked account.
- `openapi.yaml` (three admin operations, `deletionRequestedAt`, 403 on both capture
  endpoints), `docs/INTERNALS.md` (routes, column), `OPERATIONS.md` (Account Deletion),
  `docs/operations/coralogix-events.md`, the data-retention page, CHANGELOG.

## Backlog changes

- benpeter/wrl-backlog#86: closed by this phase.
