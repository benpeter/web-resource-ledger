## Domain Plan Contribution: iac-minion

### Recommendations

#### 1. Cron Trigger Interval: Every 1 Minute (`*/1 * * * *`)

The system needs to fan out to all tenant schedules that are due. Since tenants can define arbitrary cron expressions (hourly, daily, `*/5 * * * *`, etc.), the Worker's own trigger must fire at the finest granularity any tenant schedule can specify. The minimum Cloudflare Cron Trigger interval is 1 minute. Using `*/1 * * * *` means:

- A tenant schedule of `*/5 * * * *` gets evaluated every minute but only matches every 5 minutes.
- A tenant schedule of `0 3 * * *` matches once per day at 03:00 UTC.
- The scheduled() handler itself is lightweight (D1 query + queue dispatch) -- it does not perform captures. CPU time will be well under the 30-second CPU limit for sub-hour cron intervals.

Using a coarser interval (e.g., every 5 minutes) would mean tenants can only schedule at 5-minute granularity minimum. Starting at 1-minute allows future flexibility without changing infrastructure. If cost or log noise becomes an issue, it can be trivially widened later.

#### 2. Wrangler.toml Configuration

Add `[triggers]` at the top level (production) and `[env.staging.triggers]` for staging:

```toml
# --- Cron Triggers ---
# Fires every minute to evaluate tenant-defined capture schedules.
# The scheduled() handler queries D1 for due schedules, then enqueues
# capture jobs onto the existing wrl-captures queue. The handler itself
# is lightweight (D1 read + queue dispatch); actual capture work stays
# in the queue consumer.
[triggers]
crons = ["*/1 * * * *"]
```

For staging:

```toml
[env.staging.triggers]
crons = ["*/1 * * * *"]
```

Note: cron triggers are non-inheritable (like queues) -- staging must declare its own. Both environments use the same 1-minute interval so behavior parity is maintained.

Limit impact: a paid plan allows 250 cron triggers per account. This uses 2 (one per environment). No concern.

#### 3. Reuse the Existing `wrl-captures` Queue -- Do Not Create a Separate Queue

Scheduled captures MUST enqueue onto the existing `wrl-captures` queue (staging: `wrl-captures-staging`). Reasons:

- **Same processing pipeline**: A scheduled capture follows the exact same capture pipeline as an API-initiated one -- browser session, screenshot, WACZ bundle, R2 storage, D1 record, webhook dispatch. The queue consumer (`handleCaptureMessage`) already handles all of this.
- **Concurrency management is shared**: The `max_concurrency = 10` on the capture queue limits parallel browser sessions. Scheduled and on-demand captures competing for the same pool is correct behavior -- the system should not allow scheduled captures to starve on-demand captures or vice versa by running them through separate queues with separate concurrency limits.
- **DLQ and retry logic are already built**: `max_retries = 3`, exponential backoff, DLQ routing, and `failCapture()` in the DLQ consumer all apply unchanged.
- **Quota accounting works unchanged**: The `createCapture()` + `incrementUsage()` calls happen before enqueue. Scheduled captures that go through the same code path get metered correctly by both D1 usage counters and Stripe meters.

The only difference is the message body should include an additional field (e.g., `scheduleId`) so the capture record can be linked back to the originating schedule for grouping. The existing `handleCaptureMessage` ignores unknown fields, so this is backward compatible.

#### 4. scheduled() Handler Design

The `scheduled()` export should be added alongside the existing `fetch()` and `queue()` in `src/index.js`:

```javascript
export default {
  async scheduled(controller, env, ctx) {
    // controller.cron === '*/1 * * * *'
    // controller.scheduledTime is epoch ms of the intended fire time
    await handleScheduledTick(controller, env, ctx);
  },

  async queue(batch, env, ctx) { /* existing */ },
  async fetch(request, env, ctx) { /* existing */ },
};
```

The `handleScheduledTick` function should:

1. Query D1 for all active schedules whose cron expression matches the current minute (truncated to minute boundary from `controller.scheduledTime`).
2. For each matching schedule, run the same pre-enqueue pipeline as `handleCreateCapture`: validate URL, check tenant quota, create D1 capture record, increment usage, enqueue to `CAPTURE_QUEUE`.
3. Use `sendBatch()` for efficiency when multiple schedules fire in the same tick.
4. Log a summary: how many schedules matched, how many enqueued, how many skipped (quota exceeded, tenant blocked, etc.).

Important: the handler must be idempotent. If the cron fires twice for the same minute (Cloudflare makes no strict at-most-once guarantee), the handler should detect and skip duplicates. A simple approach: before enqueueing, check if a capture already exists for this `(schedule_id, fire_minute)` pair. The fire_minute can be stored as a column on the capture record or in a lightweight deduplication table.

#### 5. Cron Expression Evaluation

The Worker needs a library or function to evaluate whether a stored cron expression matches a given timestamp. Options:

- **Lightweight cron parser**: A small dependency (or hand-rolled function) that takes a 5-field cron string and a Date, returns boolean. Libraries like `cron-parser` or `croner` exist but add bundle size. Given the project's "lean and mean" philosophy, a focused hand-rolled matcher for standard 5-field cron (minute, hour, day-of-month, month, day-of-week) is preferable if the scope stays limited.
- The evaluation happens once per tick against all active schedules. With per-tenant schedule limits (say 5 per tenant, dozens of tenants), this is a few hundred evaluations at most -- trivially fast.

This is an application-code concern, not infra, but it has implications for the scheduled() handler's CPU budget.

#### 6. Staging Environment Considerations

- **Separate cron trigger**: Staging declares its own `[env.staging.triggers]` with the same interval. Since the staging Worker is a separate deployment (`wrl-staging`), its cron trigger fires independently and queries the staging D1 database.
- **Separate queue**: Scheduled captures in staging enqueue to `wrl-captures-staging`, which has `max_concurrency = 5` (lower than prod's 10). This is fine and actually safer for testing.
- **Testing cron locally**: `wrangler dev --test-scheduled` exposes a `/__scheduled` HTTP endpoint. Developers can `curl http://localhost:8787/__scheduled` to trigger the scheduled handler without waiting for a real cron fire. This should be documented in the dev guide.
- **No staging custom domain yet**: The staging environment's custom domain (`staging.webresourceledger.com`) is commented out in wrangler.toml. Cron triggers don't need a custom domain -- they fire internally. No change needed.

#### 7. Rate Limiting and Abuse Prevention for Scheduled Captures

Scheduled captures bypass the `CAPTURE_RATE_LIMITER` and `GLOBAL_CAPTURE_LIMITER` (which are per-HTTP-request). This is intentional -- the system itself is initiating these captures, not an external caller. However:

- **Quota enforcement still applies**: Each scheduled capture counts against the tenant's monthly quota via `incrementUsage()`. Free-tier tenants (200 captures/month) will exhaust their quota quickly if they schedule too aggressively.
- **Per-tenant schedule limits**: The API layer (not infra) should enforce a maximum number of active schedules per tenant (e.g., 5 for free, 25 for paid). This prevents a single tenant from creating hundreds of schedules that dominate the queue.
- **Per-tick fan-out limit**: The scheduled() handler should cap the total number of captures enqueued in a single tick (e.g., 50). This prevents a thundering herd scenario where many schedules fire simultaneously. Excess schedules can be deferred to the next tick or logged as skipped.
- **Queue sendBatch limit**: Cloudflare Queues `sendBatch()` accepts a maximum of 100 messages per call. If more than 100 schedules fire in a single tick, batching must be chunked.

#### 8. CPU Time Budget

For sub-hour cron intervals, Cloudflare enforces a 30-second CPU time limit. The scheduled() handler's work is:

1. One D1 query to fetch active schedules (lightweight).
2. Cron expression matching in JS (microseconds per expression).
3. D1 inserts for capture records (batch-able).
4. Queue sendBatch calls.

This will comfortably stay under 30 seconds of CPU time even with hundreds of schedules. No concern here.

The wall-clock limit is 15 minutes for cron-triggered Workers. The handler should complete in seconds, not minutes.

### Proposed Tasks

#### Task 1: Add `[triggers]` Cron Configuration to wrangler.toml

**What**: Add `[triggers]` section with `crons = ["*/1 * * * *"]` to the top-level config, and `[env.staging.triggers]` with the same value.

**Deliverables**: Updated `wrangler.toml` with cron trigger configuration for both production and staging.

**Dependencies**: None. Can be done first.

#### Task 2: Add `scheduled()` Export to Worker

**What**: Add the `scheduled(controller, env, ctx)` handler to the default export in `src/index.js`, alongside the existing `fetch()` and `queue()`. The handler calls a new `handleScheduledTick()` function (likely in a new `src/scheduler.js` module).

**Deliverables**:
- `scheduled()` handler in the export default block.
- `handleScheduledTick()` function that queries D1 for due schedules, evaluates cron expressions, creates capture records, and enqueues to `CAPTURE_QUEUE`.

**Dependencies**: Task 1 (wrangler.toml), D1 migration for schedules table (separate task from data-minion), cron expression evaluation function.

#### Task 3: D1 Migration for Schedules Table

**What**: Create migration `0007_schedules.sql` with a `schedules` table. Columns should include at minimum: `id`, `tenant_id`, `url`, `cron_expr`, `enabled`, `created_at`, `updated_at`, `last_fired_at`, `next_fire_at` (precomputed for query efficiency). Also add a `schedule_id` column to the `captures` table to link captures back to their originating schedule.

**Deliverables**: Migration SQL file.

**Dependencies**: None, but schema design should be reviewed by data-minion.

#### Task 4: Per-Tick Deduplication Logic

**What**: Implement idempotency for the scheduled handler. If the same `(schedule_id, fire_minute)` has already been processed, skip it. This can be a simple D1 check before enqueue, or a `UNIQUE` constraint on `(schedule_id, fire_minute)` in a lightweight runs table.

**Deliverables**: Deduplication logic in `handleScheduledTick()`.

**Dependencies**: Task 2, Task 3.

#### Task 5: Verify Staging Cron Trigger Works End-to-End

**What**: After deployment to staging, verify the cron trigger fires, the scheduled() handler queries D1, and captures are enqueued and processed. Use Coralogix logs to confirm the pipeline.

**Deliverables**: Verified staging deployment with at least one scheduled capture completing successfully.

**Dependencies**: All previous tasks.

### Risks and Concerns

1. **Thundering herd at minute boundaries**: If many tenants schedule captures at common times (e.g., `0 * * * *` -- top of every hour), the queue could see a sudden burst. Mitigation: the existing `max_concurrency = 10` on the queue consumer naturally throttles this. The per-tick fan-out limit (recommendation 7) adds a second safety valve. If burst handling becomes a real issue, captures can be jittered by adding a random 0-59 second delay via `delaySeconds` on `sendBatch()` messages.

2. **Cron expression evaluation correctness**: Getting cron parsing right (especially edge cases like `L` for last day of month, `W` for nearest weekday, etc.) is non-trivial. Recommendation: start with standard 5-field cron only (no `L`, `W`, `#` extensions). This covers the vast majority of use cases and can be extended later.

3. **Duplicate captures on cron double-fire**: Cloudflare does not guarantee exactly-once delivery for cron triggers. The handler must be idempotent (Task 4). Without deduplication, a double-fire creates duplicate captures that count against the tenant's quota.

4. **D1 query performance as schedules grow**: The scheduled() handler queries all active schedules every minute. With thousands of schedules, this query must be fast. A `WHERE enabled = 1` filter with an index on `(enabled, next_fire_at)` keeps this efficient. Precomputing `next_fire_at` avoids evaluating cron expressions in the database.

5. **Queue sendBatch limit**: Cloudflare Queues `sendBatch()` has a 100-message limit. If more than 100 schedules fire in a single tick, the handler must chunk into multiple `sendBatch()` calls. This is an implementation detail but easy to miss.

6. **Cron trigger removal gotcha**: Setting `crons = []` in wrangler.toml disables cron triggers. However, merely commenting out the `[triggers]` section does NOT disable them -- the previous cron configuration persists. This is a documented Cloudflare behavior that could cause confusion. Add a comment in wrangler.toml noting this.

7. **Browser session contention**: Scheduled captures compete with on-demand captures for browser sessions (max 10 concurrent via queue consumer). Heavy scheduled capture load could increase queue wait times for API-initiated captures. Monitor queue depth and consider increasing `max_concurrency` if this becomes an issue.

### Additional Agents Needed

- **data-minion**: Should review the D1 schema design for the schedules table, particularly index strategy for the "find due schedules" query, the deduplication approach, and the foreign key relationship between captures and schedules. The `next_fire_at` precomputation pattern needs careful design to handle timezone edge cases and DST transitions.

- **api-design-minion**: Should design the schedule CRUD API endpoints (`POST /v1/schedules`, `GET /v1/schedules`, `DELETE /v1/schedules/:id`, `PATCH /v1/schedules/:id`). Needs to define validation rules for cron expressions, per-tenant schedule limits in the API contract, and the response shape for captures linked to a schedule.

- **observability-minion** (if available): The scheduled handler introduces a new execution path that should be instrumented -- cron fire events, schedule evaluation counts, enqueue success/failure rates, deduplication hits. These metrics are critical for understanding system behavior and debugging issues with scheduled captures.
