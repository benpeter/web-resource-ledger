# Outcome

## What changed

- `src/retention.js`: one function deletes a capture (R2 objects, then its
  threat checks and its row, keeping a WACZ object another capture uses). The
  quarantine purge, `purgeExpiredCaptures` and `purgeTenantCaptures` use it.
- `purgeExpiredCaptures` runs on the hour from the per-minute cron, deletes up
  to 100 captures created more than `CAPTURE_RETENTION_DAYS` ago and logs
  `retention.expired_purged` when it deleted something. Unset, it does nothing.
- `DELETE /v1/admin/tenants/{tenantId}/captures?confirm={tenantId}[&limit=n]`
  deletes up to 100 of a tenant's captures, oldest first, keeps the account and
  answers `{ tenantId, deleted: { captures, r2Objects }, remaining }`.
- `wrangler.toml`: staging sets `CAPTURE_RETENTION_DAYS = "30"`; production
  doesn't.
- Docs: INTERNALS (variable, staging difference, route), OPERATIONS (deleting a
  tenant's captures, staging retention), openapi.yaml, CHANGELOG.

## Verified

- Red first (057b8a9): four tests for the expired purge (unset does nothing,
  31 days old goes and 29 days old stays, a shared WACZ object stays, the hourly
  cron runs it) and four for the admin route (confirm, unknown tenant, what goes
  and what stays, the limit). Green in 016d0fd; the red tests' threat-check
  fixtures used a verdict the table doesn't allow and were fixed there.
- `npm run test:sync`: 59 passed. `npm run lint:api`: exit 0.
- Full unit suite: 2053 passed, 19 failed, all in the four files that need DNS inside workerd (batch-capture, mcp, queue-consumer, quota-enforcement; "expected 422 to be 202", "Could not resolve hostname"). CI is the check for those.
