# Decisions

- The docs-site Worker (`site/src/index.js`) had the same bare `catch {}` around
  `env.ASSETS.fetch`, so both Workers now log `landing.assets_fail` / `docs.assets_fail`
  at severity 5 with the path and error message, and still answer 500.
- Looking for other silent catches turned up two in the capture queue consumer: when the
  last attempt throws, or a message reaches the dead-letter queue, the consumer marks the
  capture failed and swallowed any D1 error doing so. The capture then stays `pending`
  with nothing in the logs. Production has 8 captures in that state (founder tenant,
  hourly apache.org schedule, 2026-07-14 to 2026-09-05), which fits. Both places now log
  `capture.fail_record_fail` (severity 5); the `recordAttemptError(...).catch(() => {})`
  before a retry logs `capture.attempt_error_record_fail` (severity 4). The ack stays,
  so a broken D1 still can't block the queue. The 8 old captures are left as they are.
- The other `catch {}` blocks handle one known case (invalid JSON body -> 400, invalid
  return URL -> default, non-JSON Web Risk response -> `degraded`, which its callers
  log) and stay.
- The Coralogix query for this session showed two `capture.list` events as Critical.
  WRL logged telemetry at severity 6 as "verbose", but Coralogix numbers 1 debug,
  2 verbose, 3 info, 4 warning, 5 error, 6 critical. `capture.list`, `sitemap.read` and
  `sitemap.read_fail` now use 2. No alert filters on severity, so nothing else changes.
  The schema doc also listed `webhook.list` at 6, but the code logs it at 3.
- The test for the line-235 path (last attempt throws) isn't feasible without renderer
  injection in the queue tests; the DLQ test covers the same three-line change.
