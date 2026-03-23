# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. Cron Expression vs. Presets: Use Presets with an Escape Hatch

**Recommendation: Named presets as the primary abstraction, with raw cron as an advanced option.**

The core JTBD for scheduling is: *"When I need ongoing evidence of a web page's state, I want to capture it automatically at regular intervals, so I can build a timeline without remembering to do it manually."*

Cron expressions are a system abstraction, not a user abstraction. They violate Nielsen's "match between system and real world" heuristic. The users who understand cron (`0 */6 * * *`) are the same users who will interact primarily through the API -- and even they would benefit from presets for the common case.

**Proposed preset tiers (chosen to align with natural monitoring rhythms):**

| Preset Label | Cron Equivalent | Primary Job |
|---|---|---|
| Every hour | `0 * * * *` | Active incident monitoring, fast-changing pages |
| Every 6 hours | `0 */6 * * *` | Business-day cadence without noise |
| Daily | `0 9 * * *` | Compliance baseline -- the 80% case |
| Weekly | `0 9 * * 1` | Low-churn regulatory pages, terms of service |

**Why these four and not more:**

- Hick's Law: 4 options is the sweet spot for quick decisions without choice paralysis.
- They cover the realistic monitoring spectrum for evidence gathering. "Every minute" is abuse territory, not a real user need. "Monthly" is too infrequent to justify scheduling over manual capture.
- The 9:00 UTC default for daily/weekly is deliberate -- European business hours, and evidence captured during business hours is more defensible for compliance ("this is what people saw during the workday").

**The cron escape hatch (API only, not in the UI):**

The API should accept either `{ "interval": "daily" }` or `{ "cron": "0 9 * * 1-5" }` (weekdays only, for example). The UI exposes only the presets. This follows progressive disclosure: most users get simplicity, power users get flexibility through the API they are already comfortable with. If the web UI receives a schedule created via API with a custom cron, it should display the cron expression with a human-readable description ("Every weekday at 09:00 UTC") rather than hiding it or refusing to show it.

**Critical: do not expose cron input fields in the web UI.** Cron validation errors are one of the highest-friction patterns in scheduling UIs. They demand specialized knowledge, produce confusing error messages, and make users feel incompetent. The four presets eliminate this entire error class.

### 2. Schedule Creation Flow: Extend the Existing Capture Submission Pattern

The current UI has a clean pattern: URL input + "Capture" button. Scheduling should not require a separate section or new navigation target (that adds cognitive load and fragments the user's mental model of "capturing").

**Proposed interaction model:**

The capture form gains an optional "Repeat" toggle or selector. Default remains "Once" (the current behavior). Selecting a repeat interval transforms the action from "Capture" to "Schedule" -- the button label should change to reflect this, providing immediate feedback about the different action being taken.

This is a textbook progressive disclosure pattern: the scheduling option is visible but secondary. Users who don't need it scan past it. Users who do need it discover it naturally in the context where they'd think "I wish this happened automatically."

After schedule creation, the UI should navigate to or prominently display the new schedule with a confirmation: "Scheduled: daily capture of example.com. Next capture at 09:00 UTC." This is critical system status visibility (Nielsen heuristic #1).

### 3. Monitoring Schedule Health: The "Last Run" Pattern

Users don't monitor cron schedules -- they monitor *outcomes*. The critical question is not "is my cron trigger running?" but "is my URL still being captured successfully?"

**Schedule list view should show, for each schedule:**

- **URL** (recognition over recall)
- **Interval** (human-readable: "Daily", "Every 6 hours")
- **Last capture** (relative time: "2h ago", "yesterday") with status badge (Complete / Failed)
- **Next capture** (absolute time if <24h, relative otherwise)

**This is the minimum viable monitoring surface.** It answers the three questions users actually have:
1. Is it running? (last capture time)
2. Did it work? (status badge)
3. When does it run next? (next capture time)

A schedule that has failed its last N captures should be visually elevated (the existing `badge--fail` pattern works here). This is proactive error surfacing -- users should not have to click into each schedule to discover problems.

**Avoid building a "schedule run history" view for MVP.** The existing captures list already shows all captures. A schedule's captures are just a filtered subset. If schedule-originated captures carry a `scheduleId` field (which they should, for data model reasons), the captures list can be filtered by schedule later. Building a separate history view duplicates existing UI surface area and adds maintenance burden for no additional user capability.

### 4. Failure Notification: Leverage Existing Webhooks, Not a New System

WRL already has a robust outbound webhook system with `capture.complete` and `capture.failed` events. Schedule-originated captures should fire the same webhook events, with the addition of a `scheduleId` field in the payload so consumers can correlate.

**Do not build schedule-specific notification features (email, in-app alerts, etc.) for this phase.** The reasoning:

- Webhooks already cover the programmatic notification use case.
- Email/push notifications are an entirely separate infrastructure concern (delivery, bounce handling, unsubscribe compliance, notification preferences UI).
- The Kano model says: must-be is "schedules run and I can see results." Performance is "I can filter/group by schedule." Excitement might be "it alerts me when a scheduled capture fails three times in a row." The must-be and performance features should ship before the excitement feature.

**However, a new webhook event type should be considered:** `schedule.failing` -- fired when a schedule has N consecutive failures. This is a higher-value signal than individual `capture.failed` events because it indicates a systemic problem (URL went down, auth changed, DNS broke) rather than a transient glitch. This can be a backlog item, not an MVP requirement.

### 5. Schedule Limits: Simple, Visible, and Consistent with Existing Patterns

The product already has a pattern for per-tenant limits: 5 webhook registrations, 5 API keys. The "N of M" display pattern is established in the Settings UI.

**Recommendation: 5 schedules per tenant for free tier, configurable via the existing per-tenant config override mechanism.**

This is consistent with the existing cognitive model (users already understand the "N of M" pattern from API keys and webhooks). The limit should be displayed in the UI wherever schedules are managed, using the same `settings-keys-limit` visual pattern.

**Quota interaction is important to communicate clearly.** Each scheduled capture consumes a capture from the tenant's monthly quota. The schedule creation flow should state this explicitly: "Each execution uses 1 capture from your monthly quota. At daily frequency, this schedule will use approximately 30 captures/month." This prevents the surprise of a free-tier user creating 5 daily schedules, burning through their 200 captures in 8 days, and feeling betrayed. That's a trust-destroying moment that simple disclosure prevents.

### 6. Pause/Resume Over Delete/Recreate

Schedules should have an active/paused state. The webhook schema already supports this pattern (`active` field on webhook records). Deleting and recreating a schedule to temporarily stop it is high-friction (requires re-entering URL and interval) and loses the association with historical captures.

A simple toggle (active/paused) in the schedule list is sufficient. The paused state should be visually distinct (muted styling, "Paused" badge) and the "Next capture" field should show "Paused" instead of a time. This communicates system status immediately.

## Proposed Tasks

1. **Define the schedule data model** -- `scheduleId`, `tenantId`, `url`, `interval` (enum: hourly, every_6h, daily, weekly), `cron` (nullable, for API-created custom schedules), `active` (boolean), `createdAt`, `updatedAt`, `lastCaptureId`, `lastCaptureStatus`, `nextRunAt`. Store in D1 alongside existing tables.

2. **Implement schedule CRUD API** -- `POST /v1/schedules`, `GET /v1/schedules`, `GET /v1/schedules/:id`, `PATCH /v1/schedules/:id` (for pause/resume and interval changes), `DELETE /v1/schedules/:id`. Follow existing webhook CRUD patterns (auth, validation, tenant isolation, per-tenant limit enforcement). Accept `interval` (preset enum) or `cron` (validated expression), not both.

3. **Implement Cron Trigger handler** -- Cloudflare Cron Trigger fires on the most granular needed interval (hourly), handler queries D1 for schedules due to run, enqueues captures via the existing queue. Include `scheduleId` in the capture metadata so results link back.

4. **Add `scheduleId` to capture records and webhook payloads** -- Captures created by a schedule carry the originating `scheduleId`. This field appears in `GET /v1/captures` responses and in `capture.complete`/`capture.failed` webhook payloads. Null for on-demand captures.

5. **Add scheduling UI to capture form** -- Extend the existing capture submission form with an interval selector (defaulting to "Once"). Change button label to "Schedule" when a repeat interval is selected. Display confirmation with next-run time after creation.

6. **Build schedule list in the web UI** -- New `#/schedules` route showing all schedules with URL, interval, last capture status, next run time, and pause/resume toggle. Follow existing card/list patterns from Settings. Display "N of M schedules" limit indicator.

7. **Quota disclosure in schedule creation** -- When creating a schedule, show estimated monthly capture usage ("~30 captures/month at daily frequency") and remaining quota context.

## Risks and Concerns

### Quota Surprise (HIGH severity)

Free-tier users could exhaust their 200 monthly captures rapidly through scheduling without understanding the cost. Five daily schedules = 150 captures/month, which is 75% of the free tier consumed automatically. If captures fail and users add more schedules to compensate, they burn through quota even faster on failures. **Mitigation:** explicit quota disclosure at schedule creation (proposed task #7), and clear language that failed captures also consume quota (or decide they don't -- that's a product decision with billing implications).

### Cron Trigger Granularity vs. User Expectations (MEDIUM severity)

Cloudflare Cron Triggers have a minimum interval of 1 minute but practical reliability concerns at very fine granularity. More importantly, if the cron handler runs hourly but a user expects their "every 6 hours" schedule to run at exactly 00:00, 06:00, 12:00, 18:00, there's a timing expectations gap. **Mitigation:** communicate "approximate" timing ("around 09:00 UTC", not "at 09:00 UTC"), and use `nextRunAt` calculations that align with the preset definitions rather than promising precision.

### Fan-out at Scale (MEDIUM severity)

If many tenants create hourly schedules, a single cron trigger invocation could need to enqueue hundreds of captures. This has queue throughput and wall-clock implications for the Worker. **Mitigation:** this is primarily an engineering concern (batch enqueue, staggering), but the UX impact is that schedules might run late during high-load periods. The UI should tolerate this gracefully -- show "last capture" time rather than promising exact "next run" precision.

### Mental Model Fragmentation (LOW-MEDIUM severity)

Currently, the UI has two top-level views: Captures and Settings. Adding Schedules creates a third navigation target. The risk is that users must now maintain two mental models: "where are my captures?" and "where are my schedules?" If schedule-originated captures appear in the captures list (they should), users might not realize *why* a capture appeared. **Mitigation:** schedule-originated captures in the list should carry a subtle indicator (small "scheduled" label or icon) linking to the originating schedule. This connects the two views without requiring users to hold the relationship in working memory.

### Paused Schedule Drift (LOW severity)

Users who pause a schedule and forget about it will have a paused schedule consuming one of their 5 slots indefinitely. This is a minor version of the "zombie resource" pattern. **Mitigation:** the schedule list should make paused schedules visually distinct and sortable to the bottom. No proactive cleanup needed for MVP -- the 5-slot limit provides natural pressure to clean up.

## Additional Agents Needed

- **api-design-minion** -- Design the schedule CRUD endpoints, validate the interval preset enum vs. cron expression approach, define the `scheduleId` enrichment on capture records and webhook payloads, and ensure the API contract is consistent with existing webhook/capture patterns.
- **iac-minion** -- Cloudflare Cron Trigger configuration in `wrangler.toml`, D1 schema migration for the schedules table, queue interaction patterns for schedule-triggered captures, and the fan-out scaling concern.
- **security-minion** -- Validate that schedule limits are sufficient to prevent abuse (e.g., a tenant creating 5 hourly schedules to amplify capture rate beyond per-tenant rate limits), review the cron expression validation for injection/abuse if the API accepts raw cron, and ensure schedule-triggered captures respect the same SSRF protections as on-demand captures.
- **test-minion** -- Integration test strategy for cron-triggered captures, including schedule CRUD, the cron handler's D1 query and queue enqueue, and the `scheduleId` propagation through the capture pipeline to webhook payloads.
