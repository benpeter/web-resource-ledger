# Margo Complexity Review -- Scheduled Captures Cron

## Verdict: ADVISE

The plan is well-structured, follows existing codebase patterns closely, and
makes sound architectural choices (pre-computed `next_run_at`, CAS-based
dedup, queue reuse). The overall approach is proportional to the feature.
Three findings below -- one scope expansion that should be deferred, one
dependency that is justified, and one minor schema hygiene item.

---

## Finding 1: Pause/Resume and PATCH Are Out of Scope (BLOCK-worthy if not addressed)

**What:** The plan includes a `paused` column in the schema, a full
`updateSchedule` DB function, a `PATCH /v1/schedules/:id` HTTP endpoint
with pause/resume/cron-update/name-update support, and UI pause/resume
toggle buttons.

**Why it is accidental complexity:** The issue scope explicitly says:

> Out: Sub-hourly schedules, change detection / diff between scheduled captures, **schedule pause/resume**, schedule-specific webhook events

The success criteria list three operations: POST (create), GET (list), and
DELETE. No PATCH. No pause. No resume. No update.

This adds to the plan:
- 1 extra DB function (`updateSchedule` with dynamic field building)
- 1 extra HTTP handler (`handleUpdateSchedule`) with multi-field validation
- 1 extra route registration
- `paused` column + `WHERE paused = 0` filter on the fan-out index
- UI toggle buttons with optimistic update and rollback logic
- Additional test cases for PATCH (6+ tests in the CRUD suite)
- OpenAPI paths and schemas for the PATCH endpoint

Rough estimate: ~150-200 lines of code for a feature the issue explicitly
excludes.

**Simpler alternative:** Remove `paused`, `updateSchedule`, `PATCH` endpoint,
and UI pause/resume entirely. Users who want to stop a schedule delete it and
recreate later. The schema stays simpler (no `paused` column, simpler fan-out
index without partial filter). If pause/resume is needed later, adding a
column and endpoint is straightforward -- that is the kind of change that is
cheap to add when justified, not the kind that requires early investment.

If the team *wants* to keep pause/resume despite the issue scope, at minimum
the `paused` column should be kept in the schema (cheap insurance -- a
nullable boolean column costs nothing) but the PATCH endpoint, UI toggle, and
associated test surface should be deferred. This keeps the migration
forward-compatible without shipping code for an out-of-scope feature.

**Recommendation:** Remove PATCH/pause/resume from Tasks 1-5. Keep the
`paused` column in the migration if you want schema forward-compatibility,
but default the fan-out query to not filter on it (since all rows will be
`paused = 0`). Remove `updateSchedule` from db.js, remove
`handleUpdateSchedule` from schedules.js, remove PATCH route, remove UI
toggle, remove PATCH tests.

---

## Finding 2: `croner` Dependency Is Justified

**What:** The plan adds `croner` (~6KB, 0 transitive dependencies) for cron
expression parsing, validation, and next-run computation.

**Assessment:** This is the correct call. A hand-rolled 5-field cron parser
with sub-hourly detection, next-run computation, and edge-case handling
(month boundaries, leap years, day-of-week vs day-of-month interaction)
would be 200-400 lines of bug-prone code. `croner` is:
- Zero transitive dependencies (no supply chain fan-out)
- ~6KB (negligible bundle impact)
- Well-maintained with Workers runtime compatibility
- Covers the exact three functions needed: parse, validate, compute-next

This passes the dependency test: "What does this give me that I can't do in
10 lines of vanilla code?" Answer: correct cron semantics including calendar
math, which is genuinely non-trivial.

**No action needed.**

---

## Finding 3: `name` Field -- Mild Scope Expansion, Acceptable

**What:** The plan adds a required `name` field to schedules. The issue
success criteria say "POST creates a schedule with URL and cron expression"
-- no mention of `name`.

**Assessment:** This is borderline. A name field is cheap (one TEXT column,
one CHECK constraint, one regex validation) and genuinely useful for
distinguishing schedules in the list view ("Homepage daily" vs
"Pricing page weekly"). Without it, the list would show only URLs, which is
functional but harder to scan.

The cost is ~10 lines of code across schema + validation + display. The
usability benefit is real and immediate. This is not YAGNI -- it is a
one-line schema addition that makes the feature usable from day one.

**No action needed.** Making `name` required (rather than optional) is the
right call -- it forces users to label their schedules, which pays for itself
in list readability.

---

## Complexity Budget Tally

| Item | Column | Cost |
|------|--------|------|
| `croner` dependency | Managed | 1 |
| New `src/cron.js` module | -- | 0 (thin wrapper) |
| New `src/schedules.js` handlers | -- | 0 (follows webhook pattern) |
| New `src/scheduler.js` handler | -- | 0 (follows queue consumer pattern) |
| Cron Trigger config | Managed | 0 (one line in wrangler.toml) |
| D1 migration (schedules table) | -- | 0 (standard table) |
| **PATCH endpoint + pause/resume** | **--** | **3 (new abstraction layer: dynamic field update)** |

Without pause/resume: **1 point** (the croner dependency). Proportional.
With pause/resume: **4 points** for a feature the issue scopes out. Not proportional.

---

## Summary

The plan is solid engineering that follows established patterns. The single
substantive issue is shipping pause/resume when the issue explicitly excludes
it. Remove PATCH/pause/resume, and this plan is an APPROVE. With it included,
I am issuing ADVISE rather than BLOCK because the `paused` column in the
schema is low-cost insurance and the PATCH code follows existing patterns
(it is not architecturally novel) -- but it is still ~200 lines of code,
tests, and docs for a feature that is out of scope.

Everything else -- the `croner` choice, the CAS dedup, the queue reuse, the
fan-out query design, the UI patterns, the test strategy -- is well-reasoned
and proportional.
