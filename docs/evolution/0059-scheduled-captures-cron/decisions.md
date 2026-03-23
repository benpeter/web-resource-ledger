# Phase 0059: Scheduled Captures -- Decisions

## D1: Cron Trigger Interval -- Every Minute

**Chosen**: `*/1 * * * *` (every minute) for both production and staging.

**Over**: Hourly trigger (simpler, less DB load), 5-minute trigger (compromise).

**Why**: The minimum allowed schedule granularity is hourly, but tenants expect
their hourly schedules to fire promptly at the top of the hour. A 5-minute
trigger would add up to 4 minutes of jitter. Every-minute is the Cloudflare
minimum and ensures schedules fire within 60 seconds of their due time. DB
load is negligible -- a single indexed query per tick.

## D2: Reuse Existing Capture Queue

**Chosen**: Scheduled captures enqueue onto the existing `wrl-captures` queue.

**Over**: Separate `wrl-scheduled-captures` queue.

**Why**: The capture pipeline (queue consumer → browser rendering → R2 storage)
is identical for ad-hoc and scheduled captures. A separate queue would
duplicate DLQ configuration, consumer bindings, and monitoring. The only
difference is the `scheduleId` field in the message body, which propagates
through the existing pipeline with minimal changes.

## D3: CAS-Based Deduplication via advanceSchedule

**Chosen**: Compare-and-swap on `next_run_at` to prevent duplicate captures
when overlapping cron ticks fire.

**Over**: Idempotency key in a separate table, distributed lock via Durable
Objects, `last_fired_at` tracking.

**Why**: CAS is zero-infrastructure overhead. `advanceSchedule` updates
`next_run_at` only if it matches the expected value. If two ticks race,
only one succeeds. The DB does the coordination -- no external state needed.
Durable Objects would be over-engineering for this use case.

## D4: Cron Library -- croner

**Chosen**: `croner` (0-dependency, ~6KB, 5-field standard cron).

**Over**: `cron-parser` (larger, more features), `node-cron` (no nextRun
computation), hand-rolled parser.

**Why**: `croner` supports the exact subset we need (5-field cron, next
occurrence computation, `Date`-based iteration) with zero transitive
dependencies. It validates expressions strictly and provides `Cron.enumerate()`
for gap-based sub-hourly detection.

## D5: Hourly Minimum Enforcement -- Gap Check

**Chosen**: Enumerate 5 consecutive fire times and verify minimum gap >= 60
minutes.

**Over**: Regex-based field inspection (e.g., reject `*/N` where N < 60 in
minute field), AST inspection of parsed cron.

**Why**: Regex approaches miss complex expressions like `0,30 * * * *`
(fires every 30 minutes) or `0 0-23/2 * * *` (fires every 2 hours -- should
be allowed). Enumerating actual fire times is the only approach that
correctly handles all cron semantics. 5 consecutive times catches all
sub-hourly patterns while keeping computation trivial.

## D6: Schedule Limit Status Code -- 429

**Chosen**: 429 Too Many Requests when per-tenant schedule limit exceeded.

**Over**: 409 Conflict (api-design-minion recommendation, webhook pattern).

**Why**: Issue success criteria explicitly specifies 429. While 409 has a
semantic argument (resource conflict), 429 is more intuitive for "you've
hit your limit" and is consistent with the quota enforcement pattern used
elsewhere in the codebase.

## D7: No PATCH/Pause/Resume Endpoint

**Chosen**: Omit PATCH endpoint entirely. Schedule management is
create-or-delete only.

**Over**: PATCH with `active` toggle (synthesis initially included this).

**Why**: Issue scope explicitly excludes pause/resume. Lucy and Margo both
flagged this as scope creep during architecture review. The `paused` column
is kept in the migration as cheap schema insurance (1 byte per row, no code
paths), but no API endpoint exposes it.

## D8: Cron Expression Input -- Presets + Custom

**Chosen**: Dropdown with 5 presets (hourly, daily, weekly, Mon-Fri daily,
monthly) plus a "Custom" option revealing a raw cron input.

**Over**: Raw cron input only, human-friendly natural language builder.

**Why**: Most users want simple recurring schedules. Presets cover the common
cases without requiring cron syntax knowledge. The custom option serves
power users. A natural language builder would add significant UI complexity
for marginal benefit.

## D9: Usage Increment After sendBatch -- Per-Chunk

**Chosen**: Track sent count per chunk and increment usage proportionally
after partial failures.

**Over**: All-or-nothing usage increment (original implementation), no usage
increment on partial failure.

**Why**: Code review identified that with >100 messages, the first sendBatch
chunk could succeed while a later chunk fails. The original code only
incremented usage after ALL chunks succeeded, meaning successful sends
went uncounted. Per-chunk tracking ensures usage is always accurate
regardless of where in the batch a failure occurs.
