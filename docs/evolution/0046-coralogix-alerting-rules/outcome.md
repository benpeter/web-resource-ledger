# Outcome: Coralogix Alerting Rules

## What was produced

Four Coralogix alert rules are now live in production, monitoring WRL health:

| Alert | Threshold | Window | Priority | Coralogix ID |
|-------|-----------|--------|----------|--------------|
| [WRL] Capture Failures | >3 events | 5 min | P1 | ee2a8589-5f08-4649-8459-69e06064e58b |
| [WRL] TSA Failures | >2 events | 10 min | P3 | c7df3c78-9520-419a-b54a-838171d5ce4c |
| [WRL] Auth Failure Spike | >3 events | 15 min | P1 | 537bfb47-a5ae-44c3-9f54-2318ad78d677 |
| [WRL] Worker Errors (5xx) | >2 events | 5 min | P1 | 1dab2646-1e80-47e1-a2e8-d926184e93cd |

### Files created
- `scripts/provision-alerts.sh` — idempotent provisioning script (~330 lines)
- `docs/operations/alerts.md` — alert definitions with threshold rationale
- `docs/operations/runbooks/capture-failures.md`
- `docs/operations/runbooks/tsa-failures.md`
- `docs/operations/runbooks/auth-failure-spike.md`
- `docs/operations/runbooks/worker-errors.md`

### Files modified
- `OPERATIONS.md` — added pointer to alerts documentation in Monitoring section
- `docs/backlog.md` — marked R22 as done, moved parking lot item to Done

## What changed from the plan

The issue spec defined percentage-based thresholds (>10%, >50%, >1%). All four
alerts were implemented as absolute-count thresholds instead. This was the
central synthesis decision — ratio alerts produce false positives at WRL's
low traffic volume. See decisions.md for the full rationale.

## API discovery issues

The Coralogix Alerts API v3 schema required trial-and-error:
- `alertProperties` → `alertDefProperties` (v3 naming)
- `evaluationWindow` field rejected as unknown
- Response uses `alertDefs` not `alerts` as the array key
- `responseStatus:>=500` Lucene syntax invalid; `[500 TO *]` works
- `override` in rules is required (not optional)
- `minutes` + `notifyOn` must be defined together in webhook config
- Connector/webhook management endpoints return 404 — inline email is the path

These were all discovered during live API testing (Task 1 and Task 3).

## Idempotency verified

The provisioning script was run three times:
1. First run: created 3 alerts (worker errors failed due to Lucene syntax)
2. Second run: showed 3 UNCHANGED + created worker errors (after fix)
3. Third run: all 4 UNCHANGED

## Backlog changes

- Marked done: `[consider] Coralogix alerting rules` in Operations parking lot
- Added to Done section: `R22: Coralogix alerting rules`
- No new items deferred — all success criteria met within scope
