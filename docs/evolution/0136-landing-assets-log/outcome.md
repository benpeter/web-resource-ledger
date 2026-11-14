# Outcome

- `landing/src/index.js`, `site/src/index.js`: a failed asset fetch is logged.
- `src/index.js`: `capture.fail_record_fail` and `capture.attempt_error_record_fail`;
  telemetry logs at severity 2.
- Tests: `test/landing-worker.test.js`, new `test/docs-worker.test.js`,
  `test/queue-consumer.test.js` (DLQ with a failing D1), new `test/log-severity.test.js`.
  Each red first.
- `docs/audit-log-schema.md`: new events, corrected severities and mapping table.

## Backlog changes

- benpeter/wrl-backlog#69 (bare catch in the landing Worker): done, closed with this
  phase.
