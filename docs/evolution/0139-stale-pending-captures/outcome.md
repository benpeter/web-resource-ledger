# Outcome

- `src/stale-captures.js` (`failStaleCaptures`, `STALE_PENDING_HOURS = 24`) and
  `failStalePendingCaptures` in `src/db.js`; called on the hour from `scheduled()` in
  `src/index.js`. Logs `capture.stale_fail` / `capture.stale_fail_error`.
- `src/mcp.js`: `capture_url` description. `src/index.js`: `email.dispatch_skipped` at
  severity 1. `src/log.js`: severity JSDoc lists 1 to 5.
- Tests, red first (fde0806, 1286efa): `test/stale-captures.test.js` (24-hour boundary,
  kept attempt reason, schedule status, minute 0 only) and
  `test/log-severity-sync.test.js` (all `log()` severities 1 to 5, in the sync config).
- `openapi.yaml` (`getCaptureStatus`), `site/content/limits.md` (new failure message),
  `site/content/mcp.md` (pending troubleshooting and quickstart), `docs/INTERNALS.md`
  (cron table, lifecycle step 7), `docs/operations/coralogix-events.md` and
  `docs/audit-log-schema.md` (legend, missing events), CHANGELOG.

## Backlog changes

None filed. Not a backlog item: found in production. The 8 stuck captures fail on the
first hour after deploy.
