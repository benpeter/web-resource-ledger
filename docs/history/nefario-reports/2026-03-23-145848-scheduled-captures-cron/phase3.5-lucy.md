# Lucy Review: Scheduled Captures Delegation Plan

## Verdict: ADVISE

The plan is well-constructed and demonstrates strong adherence to existing codebase conventions (vanilla JS, D1 patterns, webhook CRUD template). However, it contains a clear scope violation that must be resolved before execution, and one additional scope creep item.

---

## Findings

### 1. DRIFT / SCOPE: Pause/Resume is explicitly out of scope

**Prompt (line 16):** `Out: Sub-hourly schedules, change detection / diff between scheduled captures, **schedule pause/resume**, schedule-specific webhook events`

**Plan includes pause/resume in every task:**
- Task 1 (schema): `paused INTEGER NOT NULL DEFAULT 0` column, `WHERE paused = 0` in indexes and queries, `paused` in `updateSchedule()` and `ALLOWED_PATCH_FIELDS`
- Task 2 (API): `PATCH /v1/schedules/:id` handler with `paused` field, `schedule.paused`/`schedule.resumed` log events
- Task 3 (cron handler): `WHERE paused = 0` filter in fan-out query, advance-anyway logic for paused schedules
- Task 4 (UI): pause/resume toggle button, badge states for paused schedules
- Task 5 (tests): `Pause: { paused: true }` and `Resume: { paused: false }` test cases, `paused` in seedSchedule
- Task 6 (docs): "Pause and resume" section in guide, `paused` in OpenAPI schema

**Origin of drift:** The api-design-minion argued (phase2) that "schedules have a paused state" and that PATCH avoids "delete-and-recreate antipattern." The synthesis adopted this argument without checking it against the prompt's explicit scope exclusion.

**Fix:** Remove the `paused` column, all pause/resume logic, and the PATCH endpoint entirely. If the user wants to stop a schedule, they delete it (matching the webhook pattern, which also has no pause). The `paused` column can be added as a forward-compatible schema addition in a future phase if pause/resume is ever requested.

**Note:** Removing `paused` also removes the need for the `PATCH` endpoint entirely, since the only other PATCH fields are `cron` and `name` -- and neither is mentioned in the prompt's success criteria. The prompt specifies POST (create), GET (list), DELETE. No update endpoint is requested.

### 2. SCOPE: PATCH endpoint and GET-by-ID are not in the success criteria

**Prompt success criteria (lines 4-6):**
- `POST /v1/schedules creates a schedule`
- `GET /v1/schedules lists all schedules`
- `DELETE /v1/schedules/{id} removes a schedule`

**Plan adds:**
- `GET /v1/schedules/:id` (single schedule retrieval)
- `PATCH /v1/schedules/:id` (update schedule)

The prompt's Scope-In says "CRUD API for schedule management" which could be interpreted to include Read-single and Update. However, the explicit success criteria enumerate only three endpoints, and the scope explicitly excludes pause/resume (the primary use case for PATCH).

**Fix:** GET-by-ID is a minor, low-cost addition that follows established patterns and is arguably implied by "CRUD" -- keep it but acknowledge it is additive. PATCH should be removed entirely (see Finding 1). If the user later wants to rename schedules or change cron expressions without delete-and-recreate, PATCH can be added in a follow-up.

**Severity:** GET-by-ID is minor gold-plating (ADVISE). PATCH is scope creep driven by the out-of-scope pause/resume feature (addressed in Finding 1).

### 3. CONVENTION: `name` field is required in schema but not in prompt

The prompt's success criteria say `POST /v1/schedules creates a schedule with URL and cron expression`. No mention of a `name` field. The plan makes `name` required (`CHECK (length(name) BETWEEN 1 AND 128)`, validation rejects missing name with 400).

The webhook pattern does have an optional `name`, but the prompt doesn't request it for schedules.

**Fix:** Make `name` optional with a sensible default (e.g., truncated URL or empty string). This is a minor proportionality issue -- adding a required field the user didn't ask for creates unnecessary API friction.

### 4. COMPLIANCE: Engineering philosophy adherence (positive)

The plan correctly follows CLAUDE.md engineering philosophy:
- **YAGNI**: Explicitly excludes timezone support, capture_settings, schedule detail view, visual cron picker, webhook events for schedules
- **Vanilla JS**: UI uses imperative DOM construction, no frameworks
- **Fail loudly**: Error handling in scheduler specifies per-schedule failure isolation with logging, no silent catch blocks
- **Test real boundaries**: Tests use miniflare-backed D1, not mocks
- **Lean and Mean**: Uses `croner` (0-dep, ~6KB) instead of building a custom cron parser -- this is a justified dependency

### 5. COMPLIANCE: `croner` dependency addition

The plan adds `croner` as a production dependency. Per CLAUDE.md: "Always ask: What does this dependency give me that I can't do simply without it?" Cron expression parsing with 5-field standard support, minimum interval enforcement, and next-run computation is non-trivial to implement correctly. The library is 0-dep and ~6KB. This is justified.

### 6. TRACE: Requirements traceability

| Prompt Requirement | Plan Element | Status |
|---|---|---|
| POST /v1/schedules (create with URL + cron) | Task 2: handleCreateSchedule | COVERED |
| GET /v1/schedules (list with next-run) | Task 2: handleListSchedules | COVERED |
| DELETE /v1/schedules/{id} | Task 2: handleDeleteSchedule | COVERED |
| Hourly minimum granularity | Task 2: validateCron with 60-min check | COVERED |
| Cron Trigger invokes Worker | Task 3: wrangler.toml + scheduled() | COVERED |
| Capture results include scheduleId | Task 1: ALTER TABLE + rowToCapture | COVERED |
| Per-tenant schedule limit (429) | Task 1: countSchedules + getEffectiveScheduleLimit; Task 2: 429 response | COVERED |
| Web UI (list, create, delete) | Task 4: ui-schedules.js | COVERED |
| Coralogix logs per execution | Task 3: schedule.execute log event | COVERED |
| --- | --- | --- |
| PATCH /v1/schedules/:id | Task 2: handleUpdateSchedule | NOT REQUESTED |
| GET /v1/schedules/:id | Task 2: handleGetSchedule | NOT REQUESTED (minor) |
| Pause/resume | Tasks 1-6: paused column, PATCH, UI toggle | EXPLICITLY OUT OF SCOPE |
| Required `name` field | Task 1-2: schema CHECK, 400 on missing | NOT REQUESTED |

---

## Summary of Required Changes Before Execution

1. **Remove pause/resume** from all tasks (schema column, PATCH handler, UI toggle, tests, docs). This is the prompt's explicit scope exclusion.
2. **Remove PATCH endpoint** -- its primary justification was pause/resume. Without that, the remaining PATCH fields (cron, name) are not requested.
3. **Make `name` optional** or remove it as a required field. The prompt specifies "URL and cron expression" as the create payload.
4. **GET-by-ID** can stay -- it is low-cost, follows CRUD convention, and supports the UI detail linking in Task 4.

These changes reduce the plan's surface area and bring it into alignment with the stated scope. The core architecture (D1 schema, cron handler fan-out, queue integration, UI panel) is sound.
