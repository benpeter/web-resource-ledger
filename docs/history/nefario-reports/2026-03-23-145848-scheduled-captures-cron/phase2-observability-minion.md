## Domain Plan Contribution: observability-minion

### Recommendations

#### 1. Log Schema for Scheduled Capture Events

The existing codebase uses a consistent pattern: `log(env, severity, subsystem, data)` where `data` always contains an `event` field using `subsystem.action` naming (e.g., `capture.start`, `capture.success`, `webhook.deliver`). The schedule feature should follow this exactly.

**New subsystem: `schedule`**

All schedule-related logs use `'schedule'` as the subsystem name, consistent with how `'webhook'`, `'billing'`, `'oauth'`, and `'capture'` each get their own subsystem.

**Event catalog (every log call the feature needs):**

| Event | Severity | When | Fields |
|---|---|---|---|
| `schedule.created` | 3 (info) | Tenant creates a new schedule | `scheduleId`, `tenantId`, `url`, `cron`, `keyHashPrefix`, `authMethod` |
| `schedule.updated` | 3 (info) | Tenant updates cron/enabled/url | `scheduleId`, `tenantId`, `changedFields` (array of field names, not values) |
| `schedule.deleted` | 3 (info) | Tenant deletes a schedule | `scheduleId`, `tenantId`, `keyHashPrefix`, `authMethod` |
| `schedule.paused` | 3 (info) | Schedule disabled by tenant | `scheduleId`, `tenantId` |
| `schedule.limit_reached` | 4 (warn) | Tenant hits per-tenant schedule limit | `tenantId`, `currentCount`, `maxAllowed`, `responseStatus` (409 or 429) |
| `schedule.tick_start` | 3 (info) | Cron trigger fires, beginning to process due schedules | `triggerTime` (ISO 8601 from `controller.scheduledTime`), `schedulesFound` (count of due schedules) |
| `schedule.tick_empty` | 3 (info) | Cron trigger fires but no schedules are due | `triggerTime` |
| `schedule.execute` | 3 (info) | One schedule's capture is enqueued | `scheduleId`, `tenantId`, `url`, `captureId`, `triggerTime` |
| `schedule.execute_fail` | 5 (error) | Enqueue or pre-validation failed for one schedule | `scheduleId`, `tenantId`, `url`, `triggerTime`, `errorCategory`, `errorMessage` (truncated to 256 chars per existing convention) |
| `schedule.execute_skip` | 4 (warn) | Schedule skipped (tenant suspended, quota exhausted, URL now invalid) | `scheduleId`, `tenantId`, `url`, `triggerTime`, `skipReason` |
| `schedule.tick_complete` | 3 (info) | Cron trigger finishes processing all due schedules | `triggerTime`, `executed` (count), `skipped` (count), `failed` (count), `durationMs` |

**Key design decisions:**

- **`scheduleId` on every schedule event**: Required by success criteria. Enables filtering in Coralogix by schedule to see its full history.
- **`captureId` on `schedule.execute`**: Links the schedule execution to the capture lifecycle. Once the capture is enqueued, the existing `capture.*` event chain (dequeued, start, success/fail/retry/dlq) already logs everything about the capture itself. No need to duplicate capture-level logging inside the schedule subsystem.
- **`triggerTime` is the `scheduledTime` from the Cron Trigger controller, not `Date.now()`**: This is the canonical "when was this supposed to run" value. It enables detecting drift between scheduled time and actual execution.
- **`durationMs` on `tick_complete`**: Measures total wall clock of the cron handler. Critical for capacity planning -- if tick duration approaches the cron interval, schedules will start overlapping.
- **No `url` on `tick_complete`**: The tick is a batch operation. Per-URL detail is on `schedule.execute`.
- **`skipReason` is a bounded enum, not free text**: Values like `tenant_suspended`, `quota_exhausted`, `url_validation_failed`, `schedule_disabled`. Keeps cardinality low.

#### 2. Severity Levels

Following the exact same convention as existing code:

| Severity | Meaning (Coralogix) | Usage in this feature |
|---|---|---|
| 3 (info) | Normal operations | CRUD on schedules, successful tick processing, individual schedule execution |
| 4 (warn) | Degraded but recoverable | Limit reached, schedule skipped, no schedules found (could indicate config issue) |
| 5 (error) | Failure requiring attention | Enqueue failure, DB query failure during tick, unexpected exceptions |
| 6 (debug) | Verbose diagnostic | Not recommended for production schedule logs (existing code uses 6 only once, for list queries) |

No severity 1 or 2 usage -- consistent with the rest of the codebase which never uses those levels.

#### 3. Correlation with Existing Capture Logs

The schedule feature does NOT need its own capture outcome logging. Here is why:

1. `schedule.execute` logs `scheduleId` + `captureId` + `url`
2. The capture is enqueued to the existing `CAPTURE_QUEUE`
3. The existing `capture.dequeued` -> `capture.start` -> `capture.success`/`capture.fail` chain already logs `captureId` + `tenantId` + `url` + `durationMs` and everything else

To satisfy the success criterion "Coralogix logs for each schedule execution (scheduleId, URL, outcome, duration)", we need to be able to **join** across subsystems using `captureId`. This is already how the codebase works -- `capture.*` events and `webhook.*` events are correlated via `captureId`, and the same pattern applies here.

**One optional enhancement**: Add `scheduleId` to the queue message body so the `capture.dequeued` and `capture.success`/`capture.fail` events can include it. This lets a single Coralogix query show the full picture without a manual join. The field is nullable (null for API-initiated captures) and adds negligible overhead.

#### 4. Alerting Recommendations

**New alert: Schedule Tick Failure Rate**

- **Trigger**: `schedule.execute_fail` count > 0 over a rolling 5-minute window
- **Severity**: Warning (not critical) -- individual schedule failures are degraded, not systemic
- **Rationale**: A failing schedule likely indicates a broken tenant configuration (bad URL, revoked API key), which the tenant should fix. But sustained failures could indicate a systemic issue (D1 down, queue down).
- **Alert threshold**: If `schedule.execute_fail` count > 5 in 15 minutes, escalate to critical. This means multiple schedules across multiple ticks are failing, which points at infrastructure.

**New alert: Tick Duration Approaching Cron Interval**

- **Trigger**: `schedule.tick_complete` with `durationMs` > 50% of cron interval (e.g., > 30s if cron is every minute)
- **Severity**: Warning
- **Rationale**: If tick processing takes longer than the interval between ticks, executions will overlap and schedules will drift. Early warning allows intervention before it becomes visible to tenants.

**New alert: Zero Executions Over Expected Period**

- **Trigger**: No `schedule.tick_start` events for 2x the cron interval
- **Severity**: Critical
- **Rationale**: Means the Cron Trigger itself stopped firing. This is a Cloudflare platform issue and requires immediate investigation.

**Do NOT create alerts for:**
- Individual `schedule.execute_skip` (expected behavior for suspended tenants or exhausted quotas -- this is the system working correctly)
- `schedule.tick_empty` (normal when no schedules exist yet)
- Individual capture failures downstream (already covered by existing `capture.dlq` alerting)

#### 5. Coralogix Query Patterns

Provide these as saved queries or document them in the evolution log for operator reference:

```
# All executions for a specific schedule
subsystemName:"schedule" AND text.scheduleId:"sch_abc123"

# Failed schedule executions in last hour
subsystemName:"schedule" AND text.event:"schedule.execute_fail"

# Tick performance over time (for dashboard)
subsystemName:"schedule" AND text.event:"schedule.tick_complete" | select text.durationMs, text.executed, text.skipped, text.failed

# Schedule execution -> capture outcome correlation
(subsystemName:"schedule" AND text.event:"schedule.execute") OR
(subsystemName:"capture" AND text.event:"capture.success" OR text.event:"capture.fail")
| group by text.captureId
```

#### 6. Security Logging Constraints

Following the INVARIANT comment in `log.js`:

- **Never log the schedule's full cron expression in error paths** where it could be attacker-controlled input. Log it on `schedule.created` where it has already passed validation.
- **Never log raw API keys** used for schedule authentication.
- **`url` is safe to log** per existing convention (validated and URL-constructor-normalized by `validateUrl` before logging).
- **`scheduleId` is safe** if it follows the same pattern as `captureId` (prefixed hex string like `sch_[a-f0-9]{32}`), which makes it regex-bounded and injection-safe.

### Proposed Tasks

1. **Add `'schedule'` subsystem log calls to all CRUD handlers** (create, update, delete, list, pause/resume). Follow the `ctx.waitUntil(log(env, ...) ?? Promise.resolve())` pattern used everywhere in `index.js`. Estimated: included in the schedule API route implementation task.

2. **Add tick-level logging to the `scheduled()` handler**. Log `schedule.tick_start` at the top, `schedule.execute` or `schedule.execute_fail` for each schedule processed, and `schedule.tick_complete` at the end with aggregate counts and duration. Estimated: included in the cron trigger implementation task.

3. **Propagate `scheduleId` through the capture queue message** (optional field, nullable). Add `scheduleId` to the message body schema in the enqueue call and surface it in `capture.dequeued` / `capture.success` / `capture.fail` log events. This is the only change to existing code outside the schedule feature. Estimated: small, but requires touching `handleCaptureMessage` in `index.js` and `performCapture` in `capture.js`.

4. **Create Coralogix alert rules** for the three alerts described above (tick failure rate, tick duration, zero executions). This is a Coralogix dashboard/alerting configuration task, not a code task.

5. **Add integration test assertions** that verify log calls are made with the correct event names and required fields (scheduleId, url, durationMs) during schedule execution. Follow the existing test patterns -- assert on the data object passed to `log()`, not on Coralogix API calls.

### Risks and Concerns

1. **Cron trigger has no `ctx.waitUntil()`**: The `scheduled()` handler in Cloudflare Workers receives `(controller, env, ctx)` where `ctx` has `waitUntil()`. However, the cron handler must complete within 30 seconds (free plan) or 15 minutes (paid plan with Cron Triggers). If tick processing enqueues many captures, the fire-and-forget log calls via `ctx.waitUntil()` should still work, but verify that Cloudflare does not terminate the worker before `waitUntil` promises resolve. The existing `log()` function returns a fetch Promise, so using `ctx.waitUntil(log(...))` in the scheduled handler is the correct pattern.

2. **Log volume at scale**: If there are 1,000 active schedules running every minute, that is 1,000 `schedule.execute` events + 1 `schedule.tick_start` + 1 `schedule.tick_complete` per minute = ~1.44M log events/day just for schedule execution. At Coralogix's ingestion pricing, this is meaningful. **Mitigation**: The tick-level summary logs (`tick_start`, `tick_complete`) provide aggregate visibility. If per-schedule execution logging becomes too expensive, the `schedule.execute` events (info level) can be moved to medium-priority TCO tier in Coralogix while keeping `schedule.execute_fail` (error) at high priority.

3. **Cardinality of `scheduleId` in metrics**: If schedule execution metrics (not just logs) are ever added, `scheduleId` as a metric label would create high cardinality. Keep `scheduleId` in logs only. Metrics should aggregate by `tenantId` at most (e.g., `wrl_schedule_executions_total{tenantId, outcome}`). For now, logs are sufficient -- do not pre-build Prometheus metrics for this feature.

4. **`scheduleId` propagation through capture pipeline**: Adding `scheduleId` to the queue message and capture log events is the only invasive change to existing code. It must be nullable/optional to avoid breaking API-initiated captures. The `handleCaptureMessage` function already destructures specific fields from `msg.body` -- adding one more optional field is low risk, but requires test coverage.

### Additional Agents Needed

None beyond what the orchestration already involves. The logging implementation is code work that the implementing agent handles directly. Coralogix alert configuration is a manual operational step documented in the evolution log.
