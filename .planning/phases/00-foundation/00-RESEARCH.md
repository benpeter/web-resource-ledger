# Phase 0: Foundation - Research

**Researched:** 2026-04-30
**Domain:** Production hygiene + capture-quality measurement baseline
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**URL Battery (AUDIT-01)**
- **D-01:** Battery is hand-curated; planner/researcher proposes the candidate list from web research on the current CMP and paywall landscape, not from production traffic mining.
- **D-02:** Diversity is the explicit selection criterion. No two URLs should fail the same way. Spread across distinct CMP vendors (OneTrust, Cookiebot, Sourcepoint, TrustArc, Usercentrics, Quantcast Choice, custom), distinct paywall types, distinct bot-protection providers (Cloudflare, Akamai, PerimeterX, DataDome), distinct dynamic-content patterns (SPA/SSR/hybrid), and distinct regional contexts.
- **D-03:** Public-side only of paywalled sites — captures hit the article URL anonymously and record whatever an unauthenticated visitor sees. No test accounts, no authenticated captures.
- **D-04:** Include the "consent-or-pay" (PUR) pattern (canonical: spiegel.de). The autoconsent click-through must still function. Likely DACH publishers: spiegel.de, zeit.de, faz.net, sueddeutsche.de — pick one or two diverse representatives, not all four.
- **D-05:** Frozen for the milestone. Once `url-battery.md` is committed, the list does not change.

**"Before" Corpus Storage (AUDIT-05)**
- **D-06:** R2 references only. `capture_id` and R2 keys recorded in `.planning/audit/url-battery.md` (or sibling `before-corpus.md`). No WACZ/screenshot files committed to git.
- **D-07:** Production environment. Captures hit `https://api.webresourceledger.com` against operator's own tenant.
- **D-08:** End-of-milestone re-capture only. Each intermediate phase performs its own area-specific A/B comparison against the original "before" set.
- **D-09:** Future phases compare via existing `/v1/captures/{id}/artifacts/*` endpoints.

**Coralogix Baseline (AUDIT-02)**
- **D-10:** Last 30 days, aggregated is the baseline window. Compute p50/p95/p99 capture duration, partial-capture rate, consent detection rate (overall + per-CMP), `MAX_PAGE_HEIGHT` and `MAX_SUBRESOURCES` cap-hit rates, settleMs and consentMs distributions, browser-hour consumption.
- **D-11:** Per-tenant breakout NOT required. Aggregate numbers only.
- **D-12:** Coralogix queries embedded verbatim in `AUDIT.md` alongside numeric results.

**Plan Partition**
- **D-13:** Two plans matching the roadmap estimate:
  - **Plan A (small): Pre-flight fixes.** PRE-01, PRE-02, PRE-03 in a single PR with three atomic commits. Deploy to staging, smoke test via `scripts/smoke-test.sh`, promote to production.
  - **Plan B (medium): Audit.** AUDIT-01..05.
- **D-14:** Plan A must merge and deploy before Plan B starts measuring (PRE-02's logging fix changes Coralogix signal).

### Claude's Discretion
- **CDP spike form factor (AUDIT-04):** Persistent test file under `test/audit/cdp-availability.test.js` (or similar). Calls `page.context().newCDPSession(page)` and `Network.getResponseBody` against a known-good fixture URL and asserts both are usable. Test format (not one-shot script) so future `@cloudflare/playwright` upgrades auto-revalidate the assumption Phase 7 depends on.
- **`AUDIT.md` structure:** four sections — (1) Baselines table (AUDIT-02 metric list), (2) Failure-mode prioritization (AUDIT-03), (3) CDP spike result with code reference (AUDIT-04), (4) Coralogix queries used.
- **`@cloudflare/playwright` `^1.1.2 → ^1.3.0` upgrade:** Defer to Phase 1 — keeps Plan A's pre-flight scope pure (bug fixes only).
- **PRE-03 disambiguation:** If both `formatDate` callsites are equally valid, prefer renaming `ui-submit.js`'s copy (newer, fewer references) — but planner should grep before deciding.
- **PRE deploy gate:** Plan A's promotion to production gated on `scripts/smoke-test.sh` passing against staging, plus visual confirmation that the billing-grace-period banner now renders for at least one tenant in that state (or a synthetic preview if no real tenant is currently in grace period).

### Deferred Ideas (OUT OF SCOPE)
- `@cloudflare/playwright` `^1.1.2 → ^1.3.0` upgrade — deferred to Phase 1.
- Authenticated captures via test accounts — rejected for this milestone.
- Per-tenant baseline breakout — not in scope; aggregates only.
- URL-battery refresh during the milestone — frozen for A/B comparability.
- Capture-tagging for the audit batch — only "if the API supports it"; no requirement to add.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRE-01 | Resolve `buildStatusBanner` collision (`ui-billing.js:198` vs `ui-detail.js:34`); rename billing-side to `billing_buildStatusBanner`; banner renders again for grace_period/blocked tenants | §PRE-01 below — exact files, exact rename, callsite list |
| PRE-02 | `src/scheduler.js:138` no longer uses `.catch(() => {})`; failure logs via `log(env, 5, 'schedule', { event: 'schedule.advance_failed', ... })` | §PRE-02 below — exact line, replacement code |
| PRE-03 | `formatDate` duplicate (`ui-settings.js:22` and `ui-submit.js:25`) resolved by view-prefix rename; no behavioral change | §PRE-03 below — both bodies are identical, prefer rename in `ui-submit.js` per CONTEXT.md |
| AUDIT-01 | ≥20 representative URLs covering all six #257 areas; committed to `.planning/audit/url-battery.md`; referenced by every subsequent phase | §URL Battery Design |
| AUDIT-02 | `.planning/audit/AUDIT.md` reports p50/p95/p99 capture duration, partial-capture rate, consent detection rate (overall + per-CMP), cap-hit rates, settleMs/consentMs distributions, browser-hour consumption | §Audit Methodology — DataPrime queries with verbatim text |
| AUDIT-03 | Audit doc includes prioritized failure-mode list ranked by frequency × severity | §Audit Methodology — failure-mode ranking method |
| AUDIT-04 | CDP-availability spike answers: does `@cloudflare/playwright` (current pinned version, `1.1.2`) expose `page.context().newCDPSession(page)` and does `Network.getResponseBody` work? Result + code ref in `AUDIT.md`. Gates `SUB-*`. | §CDP Spike Approach — expected result is NO on 1.1.2 |
| AUDIT-05 | "Before" sample: every battery URL captured under current production code; resulting `capture_id`s + R2 keys recorded in audit doc | §URL Battery Design — capture procedure |
| QG-04 | Every phase produces `docs/evolution/NNNN-short-name/{prompt.md, decisions.md, outcome.md}` | §Process Convention Enforcement |
| QG-05 | `docs/backlog.md` reviewed and updated after every phase | §Process Convention Enforcement |
| QG-06 | All new logging uses `log(env, severity, subsystem, data)` from `src/log.js`; no `console.*` in non-exempt files; no silent `catch {}` | §Process Convention Enforcement — PRE-02 is the canonical demo of this rule |
| QG-07 | Any new function added to `src/ui/` is view-prefixed and grep-checked for collision before commit | §Process Convention Enforcement — PRE-01 + PRE-03 are canonical demos |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

| Directive | Source | Phase 0 application |
|-----------|--------|---------------------|
| **Helix Manifesto:** YAGNI, KISS, vanilla over framework, latency <300ms | CLAUDE.md §Engineering Philosophy | All PRE fixes are surgical; no scope creep |
| **Log to Coralogix, never `console.*`** via `log(env, severity, subsystem, data)` | CLAUDE.md §Engineering Philosophy | PRE-02 must use `log()`; QG-06 enforcement target |
| **Fail loudly, degrade intentionally; no silent `catch {}`** | CLAUDE.md §Engineering Philosophy | PRE-02 is exactly this; QG-06 |
| **Test the real boundaries** (don't mock the browser for integration) | CLAUDE.md §Engineering Philosophy | CDP spike is an integration-style test against the real browser binding |
| **Dashboard UI flat-scope warning, prefix functions, grep before adding** | CLAUDE.md §Dashboard UI Architecture | PRE-01, PRE-03; QG-07 enforcement |
| **Evolution log:** `docs/evolution/NNNN-short-name/{prompt,decisions,outcome}.md`, sequentially numbered | CLAUDE.md §Evolution Log | QG-04 — both Plan A and Plan B produce phase entries |
| **Backlog review after every phase** | CLAUDE.md §Evolution Log | QG-05 |
| **Don't run `npm test` casually** (8 GB RAM, never two in parallel) | CLAUDE.local.md §Testing | Spike test under `test/audit/` runs as integration suite, not unit; document this |
| **Debugging: evidence first, hypothesis second** | CLAUDE.local.md §Debugging Discipline | Audit baselines are evidence-based; queries are repeatable |
| **`~/.cf-wrl-token` is for REST API, NOT for wrangler** | CLAUDE.local.md | Not applicable here — no zone changes in Phase 0 |
| **Cloudflare Worker secrets do NOT use `WRL_` prefix; GH Actions/local cache do** | `.claude/rules/gh-secrets-naming.md` | No new secrets in Phase 0 |
| **`gh issue/pr create --body-file` must use a temp file**, not heredoc on stdin | `.claude/rules/gh-cli-body-file.md` | Plan A PR creation must follow this |

## Overview

Phase 0 is two parallel-ish workstreams that establish the measurement and code-hygiene baseline for the rest of the milestone:

1. **Pre-flight cleanup (PRE-01/02/03):** three surgical bug fixes in existing files. Strictly hygiene to land before any audit measurements run, so baselines reflect a clean system. PRE-01 is an active production bug (billing banner broken for grace_period/blocked tenants); PRE-02 is a silent catch swallowing DB failures in the scheduler; PRE-03 is duplicate-name harmless-today (both bodies identical) but violates the prefix rule.
2. **Capture-quality audit (AUDIT-01..05):** hand-curated URL battery committed to `.planning/audit/url-battery.md`, "before" capture corpus produced through the production WRL API (R2-key references only, no WACZs in git), Coralogix-derived 30-day baseline document at `.planning/audit/AUDIT.md`, prioritized failure-mode ranking, and a CDP-availability spike that gives Phase 7 a yes/no answer on `Network.getResponseBody` via `@cloudflare/playwright`. **Expected spike result on the pinned `1.1.2`: NO** — CDP support landed in v1.3.0 [VERIFIED: WebSearch + npm view] and the upgrade is deferred to Phase 1 per CONTEXT.md §"Claude's Discretion" (`@cloudflare/playwright` upgrade defer).

Plus QG-04..07 process conventions: this phase establishes the standard (evolution log, backlog review, log discipline, UI prefix) and is the first to be evaluated against it.

**Primary recommendation:** Two plans, exactly as CONTEXT.md D-13 states. Plan A is three atomic commits in a single PR (one per PRE-NN), deployed to staging then promoted to production after smoke + visual banner check. Plan B is the audit work — battery, baselines, failure ranking, CDP spike, "before" corpus — with `AUDIT.md` carrying the four sections from CONTEXT.md's discretion clause.

## PRE-01: buildStatusBanner Collision

**Confidence:** HIGH (verified via grep on `src/ui/`)

### Files involved [VERIFIED: grep src/ui/]

| File | Line | Function | Signature | Body |
|------|------|----------|-----------|------|
| `src/ui/ui-billing.js` | 198 | `buildStatusBanner(usageData)` | object | Returns `<div class="billing-status-banner alert">` for `usageData.billingStatus === 'grace_period' \|\| 'blocked'`; returns `null` otherwise |
| `src/ui/ui-detail.js` | 34 | `buildStatusBanner(status)` | string | Returns `<div class="detail-status-banner">` with status label; falls through to "Status: Pending" for unknown values |

### Concatenation order in `src/ui/ui-shell.js` [VERIFIED: read shell file]

`SETTINGS_JS` → `BILLING_JS` → `SUBMIT_VIEW_JS` → `DETAIL_VIEW_JS`. Last definition wins → **`ui-detail.js`'s version is the survivor in production**.

### Active production bug

The single billing call site (`src/ui/ui-billing.js:169`):

```js
var banner = buildStatusBanner(usageData);
if (banner) view.appendChild(banner);
```

Passes an object. The detail-view function only matches the string `'complete'`/`'failed'` and falls through to "Status: Pending" for anything else. Result: when a tenant is in `grace_period` or `blocked` billing state, the dashboard renders a stray "Status: Pending" detail banner instead of the intended billing alert. The grace-period/blocked alert never appears.

### Fix (per CONTEXT.md and REQUIREMENTS.md PRE-01)

Rename **only** `ui-billing.js`'s function to `billing_buildStatusBanner`. Do not touch `ui-detail.js`. The detail-view callers (`ui-detail.js:412, 552, 642`) keep working unchanged.

**Diff (illustrative):**

```js
// src/ui/ui-billing.js:169
- var banner = buildStatusBanner(usageData);
+ var banner = billing_buildStatusBanner(usageData);

// src/ui/ui-billing.js:198
- function buildStatusBanner(usageData) {
+ function billing_buildStatusBanner(usageData) {
```

**Total edits:** 2 lines in `src/ui/ui-billing.js`. No other files touched. No test changes required (UI string code is not unit-tested).

### Pre-commit verification (per QG-07)

```bash
grep -nE "function +billing_buildStatusBanner\b|\bbilling_buildStatusBanner\b" src/ui/*.js
```

Should return exactly the rename target (line 198) and the call site (line 169) — both in `ui-billing.js`. Then:

```bash
grep -nE "\bbuildStatusBanner\b" src/ui/*.js
```

Should return only the four `ui-detail.js` matches (line 34 declaration + lines 412/552/642 callers).

### Visual confirmation (per CONTEXT.md PRE deploy gate)

After staging deploy, confirm the grace-period banner renders for at least one tenant in that state. Path: dashboard → settings/billing view → tenant with `billing_status='grace_period'` in D1. If no real tenant is in grace period, set one synthetically via D1 console for a single-test session, observe the rendered alert, revert.

## PRE-02: Scheduler Silent Catch

**Confidence:** HIGH (verified via Read on `src/scheduler.js`)

### Exact line [VERIFIED: read src/scheduler.js:135-148]

```js
// src/scheduler.js — current
const threat = await checkUrl(schedule.url, env).catch(() => ({ safe: true, degraded: true }));
if (!threat.safe) {
  nextRunAt = nextRunAfter(schedule.cron, new Date(controller.scheduledTime));
  await advanceSchedule(env.DB, schedule.id, nextRunAt, null, 'blocked').catch(() => {});  // ← line 138
  ctx.waitUntil(log(env, 4, 'schedule', {
    event: 'schedule.blocked_threat',
    scheduleId: schedule.id,
    tenantId,
    url: schedule.url,
    threatTypes: threat.threatTypes,
  }) ?? Promise.resolve());
  skippedCount++;
  continue;
}
```

### Behavioral problem

If `advanceSchedule` (a D1 write) fails, the catch swallows the error. The schedule's `next_run_at` is not advanced. The cron tick (`*/1 * * * *`) reruns this same blocked schedule **every minute**, re-emitting `schedule.blocked_threat` events forever and continuously hammering D1. This is invisible in Coralogix today.

### Fix (per CONTEXT.md and REQUIREMENTS.md PRE-02)

Replace the silent catch with a structured `log(env, 5, 'schedule', { event: 'schedule.advance_failed', ... })` call. The success criterion (ROADMAP.md success criterion #2) names the event `scheduler:advance_failed` informally; the established subsystem convention is `'schedule'` (not `'scheduler'`) per CONCERNS.md and existing scheduler events. Use `'schedule.advance_failed'` for the dotted event name.

**Replacement code (matches existing `schedule.execute_fail` pattern at lines 161-172):**

```js
// src/scheduler.js:138 — replacement
await advanceSchedule(env.DB, schedule.id, nextRunAt, null, 'blocked').catch((err) => {
  ctx.waitUntil(log(env, 5, 'schedule', {
    event: 'schedule.advance_failed',
    scheduleId: schedule.id,
    tenantId,
    url: schedule.url,
    blockReason: 'threat',
    errorClass: err?.constructor?.name,
    errorMessage: String(err?.message ?? '').slice(0, 128),
  }) ?? Promise.resolve());
});
```

Notes:
- **Severity 5 (`error`)** matches the established convention for D1 write failures (see `auth.js:151` `security.kv_error`).
- **Subsystem `'schedule'`** matches every other event in this file (`schedule.blocked_threat`, `schedule.execute_fail`, `schedule.tick`).
- **Truncation `.slice(0, 128)`** matches the project-wide error-message clamp documented in CONVENTIONS.md §4.
- **`ctx.waitUntil(... ?? Promise.resolve())`** matches the project-wide `log()` envelope pattern (CONVENTIONS.md §4) — `log()` returns `undefined` when Coralogix bindings are absent.
- **Field name `blockReason: 'threat'`** distinguishes this from the upcoming `schedule.execute_fail` site, in case future block reasons are added (quota, paused, etc.).

### Verification

After staging deploy, attempt to drive a `schedule.advance_failed` log entry. Easiest path: the smoke test should NOT introduce a real D1 outage; instead, verify by inspection that:
1. The `await ... .catch(() => {})` at line 138 is gone.
2. A `grep -n "\.catch(() => {})" src/scheduler.js` returns zero matches.
3. Coralogix DataPrime query for `$d.event == 'schedule.advance_failed'` returns no logs (because no failure has happened yet) — but the search succeeds, confirming the field is reachable.

### Operational impact

When this lands, **previously-silent D1 write failures on threat-blocked schedule advances will start showing up in Coralogix**. CONTEXT.md D-14 calls this out: "PRE-02's logging fix is the only PRE change that could affect baselines (currently-swallowed `scheduler:advance_failed` errors will start appearing in Coralogix). Run baselines against the cleaned-up system so the numbers reflect post-fix behavior." This is why Plan A must merge and deploy before Plan B starts measuring.

## PRE-03: Third Pre-Flight Fix

**Confidence:** HIGH (verified via grep + REQUIREMENTS.md)

### Cited from REQUIREMENTS.md PRE-03

> `formatDate` duplicate name across `src/ui/ui-settings.js:22` and `src/ui/ui-submit.js:25` is resolved (one or both renamed with a view prefix per `CLAUDE.md`); no behavioral change.

### Both bodies are byte-identical [VERIFIED: read both files]

```js
// src/ui/ui-settings.js:22 AND src/ui/ui-submit.js:25 — IDENTICAL
function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return isoStr;
  }
}
```

Concatenation order: `SETTINGS_JS` (concatenated 56) → `SUBMIT_VIEW_JS` (concatenated 71). Last wins → submit's copy is the survivor today, but because the bodies are byte-identical, no behavior is broken. This is harmless duplication that violates the prefix rule.

### Fix (per CONTEXT.md PRE-03 disambiguation)

CONTEXT.md says: *"prefer renaming `ui-submit.js`'s copy (it's the newer one and is referenced from fewer places per typical WRL UI structure) — but planner should grep before deciding."*

Confirmed callsite count [VERIFIED: grep]:
- `ui-settings.js`: **3 callers** (lines 291, 372, 723)
- `ui-submit.js`: **1 caller** (line 438)

Renaming the submit-side has the smaller blast radius (fewer edits). Rename to `submit_formatDate`.

**Diff:**
```js
// src/ui/ui-submit.js:25
- function formatDate(isoStr) {
+ function submit_formatDate(isoStr) {

// src/ui/ui-submit.js:438
- var resetDate = data.resetsAt ? formatDate(data.resetsAt) : '';
+ var resetDate = data.resetsAt ? submit_formatDate(data.resetsAt) : '';
```

**Total edits:** 2 lines in `src/ui/ui-submit.js`. `ui-settings.js` is untouched. After the rename, the only `formatDate` symbol in `src/ui/` is the one in `ui-settings.js`.

### Pre-commit verification (per QG-07)

```bash
grep -nE "function +formatDate\b" src/ui/*.js
# Should return only ui-settings.js:22

grep -nE "function +submit_formatDate\b|\bsubmit_formatDate\b" src/ui/*.js
# Should return ui-submit.js:25 (decl) and ui-submit.js:438 (call)
```

### Why not also rename `ui-settings.js`?

CONTEXT.md leaves this to planner discretion. Since the bodies are identical, renaming both would be redundant cosmetic work. The prefix rule is satisfied as long as no two views declare the same name; renaming the smaller-footprint copy achieves that.

## Audit Methodology

**Confidence:** HIGH for query shape (matches existing log emission); MEDIUM for exact percentile syntax in DataPrime (verify in execute-phase against the live service).

### Coralogix configuration [VERIFIED: ops-runbook skill, .secrets, wrangler.toml]

| Property | Value |
|----------|-------|
| Region | EU2 (Stockholm) |
| Query API | `https://ng-api-http.eu2.coralogix.com/api/v1/dataprime/query` |
| Auth header | `Authorization: Bearer $WRL_CORALOGIX_API_KEY` |
| Application | `wrl` |
| Subsystems used | `capture`, `schedule`, `security`, `billing`, `email`, `verify`, `admin` |
| Tier | `TIER_FREQUENT_SEARCH` (per ops-runbook example) |
| Quoting trap | DataPrime uses `$` for fields; **always write query to a temp file** with `<< 'EOF'` |

### Existing log fields available [VERIFIED: grep src/]

These already land in Coralogix today; no new instrumentation needed for AUDIT-02:

| Event | Subsystem | Fields used by AUDIT-02 |
|-------|-----------|-------------------------|
| `capture.success` | `capture` | `durationMs`, `consentDurationMs`, `tenantId`, `captureId` |
| `capture.partial` | `capture` | `durationMs`, `tenantId`, `captureId` |
| `capture.fail` | `capture` | `errorClass`, `errorMessage`, `stage` |
| `render.default.complete` | `capture` | `durationMs`, `partial: false`, `captureId` |
| `render.default.partial_complete` | `capture` | `screenshotMs`, `screenshotBytes`, `contentMs`, `durationMs` |
| `render.default.settle_complete` | `capture` | `settleMs`, `settleReason`, `pendingAtCap` |
| `render.default.consent_result` | `capture` | `status` (`'dismissed'`/`'none'`/`'timeout'`/`'failed'`), `cmp`, `consentMs` |
| `render.default.viewport_capped` | `capture` | `originalHeight`, `cappedHeight` (= `MAX_PAGE_HEIGHT` cap-hit) |

### `MAX_SUBRESOURCES` cap-hit signal [CITED: src/capture.js:504-505]

```js
if (subresourceCount > MAX_SUBRESOURCES) {
  limitExceeded = `Page exceeded ${MAX_SUBRESOURCES} subresource limit`;
```

The cap-hit produces a `limitExceeded` field on the partial capture path. The DataPrime query for AUDIT-02's "MAX_SUBRESOURCES cap-hit rate" filters on `$d.event == 'capture.partial' && $d ~~ 'subresource limit'` — see queries below. **[ASSUMED]** that this is the most reliable signal — verify in execute-phase by sampling a few `capture.partial` log entries; if `limitExceeded` is its own structured field, prefer field equality over `~~` substring match. (Promote to HIGH after the executor confirms.)

### DataPrime queries (verbatim, paste into `AUDIT.md`)

**Window:** `2026-04-01T00:00:00.000Z` to `2026-05-01T00:00:00.000Z` (last 30 days, executor adjusts at run time).

```dataprime
// 1. p50 / p95 / p99 capture duration (full successes)
source logs
| filter $l.applicationname == 'wrl'
       && $l.subsystemname == 'capture'
       && $d.event == 'capture.success'
| extract $d.durationMs as duration:number
| groupby true aggregate
    percentile(0.5, duration) as p50,
    percentile(0.95, duration) as p95,
    percentile(0.99, duration) as p99,
    count() as n
```

```dataprime
// 2. Partial-capture rate (over total accepted capture starts)
source logs
| filter $l.applicationname == 'wrl' && $l.subsystemname == 'capture'
       && ($d.event == 'capture.success' || $d.event == 'capture.partial' || $d.event == 'capture.fail')
| groupby $d.event aggregate count() as n
// Compute: rate_partial = n[capture.partial] / sum(n)
```

```dataprime
// 3. Consent detection rate — overall
source logs
| filter $l.applicationname == 'wrl' && $l.subsystemname == 'capture'
       && $d.event == 'render.default.consent_result'
| groupby $d.status aggregate count() as n
// status values: 'dismissed' | 'none' | 'timeout' | 'failed'
// detection_rate = (dismissed + timeout + failed) / total  // any CMP detected
// success_rate   = dismissed / total                       // CMP detected AND opted out
```

```dataprime
// 4. Consent detection rate — per CMP (only when CMP was detected)
source logs
| filter $l.applicationname == 'wrl' && $l.subsystemname == 'capture'
       && $d.event == 'render.default.consent_result'
       && $d.cmp != null
| groupby $d.cmp, $d.status aggregate count() as n
```

```dataprime
// 5. MAX_PAGE_HEIGHT cap-hit rate
source logs
| filter $l.applicationname == 'wrl' && $l.subsystemname == 'capture'
       && $d.event == 'render.default.viewport_capped'
| groupby true aggregate count() as cap_hits
// Divide by total capture starts (capture.success + capture.partial + capture.fail) for rate
```

```dataprime
// 6. MAX_SUBRESOURCES cap-hit rate (best-effort substring match)
source logs
| filter $l.applicationname == 'wrl' && $l.subsystemname == 'capture'
       && $d.event == 'capture.partial'
       && $d ~~ 'subresource limit'
| groupby true aggregate count() as cap_hits
```

```dataprime
// 7. settleMs distribution (p50/p95/p99)
source logs
| filter $l.applicationname == 'wrl' && $l.subsystemname == 'capture'
       && $d.event == 'render.default.settle_complete'
| extract $d.settleMs as settleMs:number
| groupby true aggregate
    percentile(0.5, settleMs) as p50,
    percentile(0.95, settleMs) as p95,
    percentile(0.99, settleMs) as p99,
    count() as n
```

```dataprime
// 8. consentMs distribution (p50/p95/p99)
source logs
| filter $l.applicationname == 'wrl' && $l.subsystemname == 'capture'
       && $d.event == 'render.default.consent_result'
| extract $d.consentMs as consentMs:number
| groupby true aggregate
    percentile(0.5, consentMs) as p50,
    percentile(0.95, consentMs) as p95,
    percentile(0.99, consentMs) as p99,
    count() as n
```

```dataprime
// 9. Browser-hour consumption proxy: total successful capture wall time / 3600000
source logs
| filter $l.applicationname == 'wrl' && $l.subsystemname == 'capture'
       && ($d.event == 'capture.success' || $d.event == 'capture.partial')
| extract $d.durationMs as duration:number
| groupby true aggregate sum(duration) as total_ms, count() as n
// browser-hours ≈ total_ms / 3600000
```

**Note on browser-hour accuracy:** This is a proxy. True browser-hour consumption is what Cloudflare bills against the Browser Rendering binding, which is the wall time the browser session is held open per session, not just per capture. The proxy above is the closest approximation possible from emitted logs without adding new instrumentation. **[ASSUMED]** that this is acceptable for "establishing a comparison floor" per AUDIT-02 — the executor should call this out as a proxy in `AUDIT.md`.

### Failure-mode prioritization (AUDIT-03)

The audit doc must rank #257 areas by frequency × severity. **Frequency** comes from the queries above (e.g., partial-capture rate, consent-failed rate per CMP, cap-hit rate). **Severity** is a qualitative judgement informed by the audit's "before" corpus inspection (does the failure produce a useless screenshot? a legally inadequate WACZ? a metadata-only annotation?).

Recommended ranking template for `AUDIT.md` §2:

| #257 Area | Frequency signal | Severity signal | Rank |
|-----------|------------------|-----------------|------|
| Area 1 — Dynamic content | Partial-rate + non-zero `pendingAtCap` distribution | Visual: placeholder/broken-image bands in screenshots | TBD by executor |
| Area 2 — Cookie consent | `status` distribution (none/timeout/failed) per CMP | Visual: banner still visible in after-consent screenshot | TBD |
| Area 3 — Screenshot/settle | `settleReason: 'cap'` rate; FOIT incidents in corpus | Visual: font fallbacks; incomplete screenshots | TBD |
| Area 4 — Subresource fidelity | n/a (no signal until SUB exists) | Replay fidelity in ReplayWeb.page on corpus WACZs | Inherently low rank for Phase 0 — gated by AUDIT-04 |
| Area 5 — Bot protection | `capture.partial` rate on known bot-protected URLs | Capture is unusable as evidence | TBD |
| Area 6 — Render-failure resilience | `capture.fail` rate by `errorClass`/`stage` | Operator can't distinguish slow/blocked/broken | TBD |

The executor fills the Rank column by applying frequency weights (from queries) and severity weights (from corpus inspection). The roadmap order (Phase 2: Screenshot → Phase 3: Dynamic → ... → Phase 7: Subresource) is **not** the same as the AUDIT-03 ranking; AUDIT-03 informs scoping inside each phase, not phase order.

### `AUDIT.md` structure (per CONTEXT.md Claude's Discretion)

```markdown
# WRL Capture-Quality Audit (Milestone Baseline)

**Window:** 2026-04-01 → 2026-05-01
**Source:** Coralogix EU2 (subsystem `capture` + corpus inspection)

## 1. Baselines (AUDIT-02)
[Table: metric | value | n (sample size) | source query]

## 2. Failure-mode Prioritization (AUDIT-03)
[Ranked table per #257 area]

## 3. CDP Availability Spike (AUDIT-04)
[Result: yes/no | Code reference: test/audit/cdp-availability.test.js | Stack trace if no]

## 4. Coralogix Queries
[Verbatim DataPrime, one fenced block per query, with the query name as heading]
```

## CDP Spike Approach

**Confidence:** HIGH (CDP support in `@cloudflare/playwright` v1.3.0 verified; pinned version is v1.1.2)

### Verified facts [VERIFIED: WebSearch + npm view]

- `@cloudflare/playwright` versions on npm: `0.0.x → 1.0.0 → 1.1.0 → 1.1.1 → 1.1.2 → 1.2.0 → 1.3.0`. Latest is `1.3.0` (published 2026-04-15).
- The project is pinned to `^1.1.2` in `package.json`; the resolved version in `node_modules/@cloudflare/playwright/package.json` is exactly `1.1.2`.
- Per WebSearch + Cloudflare announcement (April 2026): **"Browser Run now has full CDP support, so starting with @cloudflare/playwright version 1.3.0, the library uses the standard CDP internally."**
- Therefore, the spike running on the project's current pinned `1.1.2` is **expected to fail** — `page.context().newCDPSession(page)` either does not exist or throws.

### Spike form factor (per CONTEXT.md Claude's Discretion)

A persistent test file under `test/audit/cdp-availability.test.js`. Test-file format (not a one-shot script) so future `@cloudflare/playwright` upgrades automatically re-validate the assumption Phase 7 depends on. Land it as part of the integration suite (`test/integration/`-style) so it has access to the real `BROWSER` binding via miniflare, not the mocked one.

**Recommended location:** `test/integration/cdp-availability.test.js` (so it inherits the integration setup with `globalSetup` fixture server, real browser binding). The CONTEXT.md path `test/audit/cdp-availability.test.js` is fine too if the executor wants to keep audit work isolated; the integration config's `include: ['test/integration/**/*.test.js']` would need broadening (or change the path to `test/integration/audit/cdp-availability.test.js` to keep the include glob).

### Minimal probe script

```js
// test/integration/cdp-availability.test.js
import { env } from 'cloudflare:test';
import { describe, it, expect, inject } from 'vitest';
import { acquire, connect } from '@cloudflare/playwright';

describe('AUDIT-04 -- CDP availability on @cloudflare/playwright', () => {
  it('exposes page.context().newCDPSession(page) and Network.getResponseBody', async () => {
    const port = inject('testServerPort');
    const session = await acquire(env.BROWSER, { keep_alive: 60000 });
    const browser = await connect(env.BROWSER, session.sessionId);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    let cdpSession;
    let cdpAvailable = false;
    let cdpError = null;
    try {
      // Step 1: can we even create a CDP session?
      expect(typeof page.context().newCDPSession).toBe('function');
      cdpSession = await page.context().newCDPSession(page);
      cdpAvailable = true;
    } catch (err) {
      cdpError = { name: err?.constructor?.name, message: String(err?.message ?? '').slice(0, 256) };
    }

    // Record the result regardless of outcome — the audit needs the evidence.
    console.log(JSON.stringify({ test: 'AUDIT-04', cdpSessionAvailable: cdpAvailable, cdpError }));

    if (!cdpAvailable) {
      expect.fail(`newCDPSession unavailable on @cloudflare/playwright 1.1.2: ${JSON.stringify(cdpError)}`);
    }

    // Step 2: can we enable Network and get a response body?
    await cdpSession.send('Network.enable');

    const fixtureUrl = `http://127.0.0.1:${port}/fast.html`;
    const responsePromise = new Promise((resolve) => {
      cdpSession.on('Network.responseReceived', (params) => {
        if (params.response.url === fixtureUrl) resolve(params.requestId);
      });
    });

    await page.goto(fixtureUrl);
    const requestId = await responsePromise;

    const { body, base64Encoded } = await cdpSession.send('Network.getResponseBody', { requestId });
    expect(typeof body).toBe('string');
    expect(body.length).toBeGreaterThan(0);

    await ctx.close();
    await browser.close();
  });
});
```

### Decision criteria for Phase 7

| Spike outcome | Phase 7 (Subresource) decision |
|---------------|--------------------------------|
| **Pass on 1.1.2** | Use CDP `Network.getResponseBody` directly; SUB-02 path A. (Unexpected — CDP support is announced for 1.3.0.) |
| **Fail on 1.1.2** (expected) | Two follow-up paths: (a) bump `@cloudflare/playwright` to `^1.3.0` in Phase 1 and re-run this same test as part of CI; if it then passes, SUB-02 path A is unlocked. (b) If it still fails on 1.3.0, SUB-02 falls back to `page.on('response')` + `response.body()` per REQUIREMENTS.md SUB-02 fallback clause. |
| **Pass on 1.3.0 in Phase 1** | Path A unlocked. |

The audit only needs to record the **current** answer (yes/no on 1.1.2) and the test code reference. Phase 1's harness work is what re-runs the spike on the upgraded version.

### What `AUDIT.md` records for AUDIT-04

```markdown
## 3. CDP Availability Spike (AUDIT-04)

**Pinned version tested:** `@cloudflare/playwright@1.1.2`
**Test file:** `test/integration/cdp-availability.test.js`
**Result:** [PASS | FAIL]

[If FAIL: paste the JSON error log line — `{"test":"AUDIT-04","cdpSessionAvailable":false,"cdpError":{"name":"...","message":"..."}}`]

**Implication for Phase 7:**
- CDP available → SUB-02 implements `Network.getResponseBody` path.
- CDP unavailable → SUB-02 falls back to `page.on('response') + response.body()` OR Phase 1 upgrades `@cloudflare/playwright` to `^1.3.0` and the test re-runs as part of harness CI.

**Decision rule:** Phase 7 must NOT ship CDP-based capture without a green run of this test against the version of `@cloudflare/playwright` that will be deployed.
```

## URL Battery Design

**Confidence:** MEDIUM (battery composition is curated by humans + research; the framework here is HIGH confidence)

### Selection criterion (per CONTEXT.md D-02)

**Failure-orthogonal, not topic-orthogonal.** Don't pick five news sites and call it diverse — pick five sites that fail in five *different* ways. The 20-URL list spans CMP vendor, paywall type, bot-protection provider, dynamic-content pattern, and regional context. Each URL must justify its inclusion with a unique failure-mode hypothesis.

### Six #257 areas + ≥20 URLs target

| #257 Area | Min URLs | Site-type examples | Distinct failure modes |
|-----------|----------|--------------------|------------------------|
| Area 1 — Dynamic content (SPA / lazy load / infinite scroll) | 3 | Twitter/X (SPA), Pinterest (image masonry), Reddit (infinite scroll) | Hydration timing; data-src lazy patterns; scroll loop |
| Area 2 — Cookie consent | 6 | OneTrust, Cookiebot, Sourcepoint, TrustArc, Usercentrics, custom DACH PUR | Each CMP has distinct DOM markers; PUR-modal forces accept-or-pay |
| Area 3 — Tall page / screenshot | 2 | Wikipedia long article, GitHub README of a large repo | MAX_PAGE_HEIGHT clamp; FOIT |
| Area 4 — Image-heavy | 2 | NYT photo essay, Unsplash | Subresource count; lazy patterns; settleMs spike |
| Area 5 — Bot-protected | 4 | Cloudflare-challenged site, Akamai-protected site, DataDome site, PerimeterX site | Each provider has distinct interstitial + cookie pattern |
| Area 6 — Paywall (incl. PUR) | 3+ | NYT (US metered), spiegel.de (DACH PUR), FT (UK hard) | Hard wall, soft wall, consent-or-pay hybrid |
| **Total** | **20+** | | |

The Area 2 + Area 6 overlap is intentional — DACH PUR sites (spiegel.de, zeit.de) belong to both. Per CONTEXT.md D-04, pick one or two DACH PUR representatives, not all four.

### Capture procedure (per CONTEXT.md D-06, D-07, D-08)

For each URL in the battery:

```bash
source ~/.secrets  # WRL_CAPTURE_API_KEY in scope (per CLAUDE.md)
RESPONSE=$(curl -s -X POST https://api.webresourceledger.com/v1/captures \
  -H "Authorization: Bearer $WRL_CAPTURE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$URL\"}")
CAPTURE_ID=$(echo "$RESPONSE" | jq -r '.id')
echo "$URL,$CAPTURE_ID" >> .planning/audit/before-corpus.csv
```

Wait for completion (poll `GET /v1/captures/{id}` until `status === 'complete' || 'partial' || 'failed'`), then record the R2 keys:

```
captures/{captureId}/screenshot.png
captures/{captureId}/rendered.html
captures/{captureId}/headers.json
captures/{captureId}/capture.wacz
```

These are accessible via the existing artifact endpoints (no new API surface needed):

```
GET /v1/captures/{captureId}/artifacts/screenshot
GET /v1/captures/{captureId}/artifacts/html
GET /v1/captures/{captureId}/artifacts/wacz
```

### Storage convention (per CONTEXT.md D-06)

`.planning/audit/url-battery.md` (or sibling `before-corpus.md`) is a Markdown table with one row per URL:

```markdown
| # | URL | Site-type tags | capture_id | Status | Notes |
|---|-----|----------------|------------|--------|-------|
| 1 | https://www.spiegel.de/... | paywall, PUR, sourcepoint, dach | cap_abc123... | complete | DACH PUR rep |
| 2 | https://example-onetrust... | cmp, onetrust, news | cap_def456... | complete | |
| ... | | | | | |
```

No WACZ, screenshot, or HTML artifact files committed to git. Comparison phases re-fetch via the existing artifact endpoints.

### Ethical / legal constraints (per CONTEXT.md D-03)

- Captures hit URLs **anonymously** — no test-account credentials, no logged-in sessions.
- Public-side only of paywalled sites — record whatever an unauthenticated visitor sees (paywall overlay, partial content, hard wall).
- No bypass attempts — bot-protection and paywall captures may legitimately fail or produce partial content; **that's a real failure to record, not an excuse to skip the URL** (per CONTEXT.md §specifics).
- No CFAA / copyright concerns from anonymous viewing of public URLs that are reachable via a stock browser. The captures are the same content any reader could see.

### Where the candidate list comes from

The actual 20-URL list is a **planner output**, not a research output. The planner builds it during planning by:

1. Web research on **current** CMP vendor market share (OneTrust, Cookiebot, etc. — verify with publicly-listed example sites).
2. Web research on **current** bot-protection provider examples (each provider's marketing pages list customer logos).
3. DACH publisher list for PUR — spiegel.de is canonical per CONTEXT.md.
4. Cross-check that no two URLs fail the same way (per D-02).

**The researcher does not commit a 20-URL list here.** That belongs in PLAN-A or PLAN-B's task output, after a fresh round of web research at planning time. Doing it here would freeze stale URLs into research that is supposed to outlast this phase.

## Process Convention Enforcement

**Confidence:** HIGH (rules already documented in CLAUDE.md, evolution log structure verified by `ls docs/evolution/`)

QG-04..07 are **existing CLAUDE.md conventions**. Phase 0 is the first phase that must comply, not the phase that designs them. Per CONTEXT.md §domain: *"QG-04..07 are existing CLAUDE.md conventions — phase outcomes must comply, but no new gating mechanism is being designed here."*

### QG-04 — Evolution log per phase

**Rule (CLAUDE.md):** `docs/evolution/NNNN-short-name/{prompt.md, decisions.md, outcome.md}`. Sequentially numbered (4-digit zero-padded). After every nefario orchestration that produces a PR, also write `process.md`.

**Verified [Read]:** Existing logs e.g. `0107-stripe-authoritative-billing/` contain `prompt.md`, `decisions.md`, `outcome.md` (and `process.md`). Numbering is currently up to **0107** but auto-memory `project_evolution_phase.md` notes inconsistency from autonomous runs.

**Phase 0 plan tasks (MUST):**
- **Task A1:** Plan A creates `docs/evolution/NNNN-pre-flight-cleanup/` with `prompt.md` (the Plan A briefing), `decisions.md` (PRE-01 rename target choice, PRE-03 disambiguation rationale, deploy gate decisions), `outcome.md` (what shipped, smoke result, banner-render confirmation).
- **Task B1:** Plan B creates `docs/evolution/NNNN-foundation-audit/` with same three files.
- The phase number suffix continues from current max in `docs/evolution/`. Planner determines actual number at planning time; expected next is **0108** (most recent on disk is `0107-stripe-authoritative-billing/`).
- Update `docs/evolution/README.md` index for both phases.

### QG-05 — Backlog review per phase

**Rule (CLAUDE.md):** Review and update `docs/backlog.md` after every phase. Add deferred items, remove resolved items, adjust tiers if evidence warrants. If no changes, **say so explicitly in `outcome.md`** ("the absence is the record").

**Phase 0 plan tasks (MUST):**
- **Task A2:** Plan A's `outcome.md` includes a `## Backlog changes` section. Likely empty (the three PRE fixes are not on the backlog) — still must say so.
- **Task B2:** Plan B's `outcome.md` includes a `## Backlog changes` section. Audit findings will likely reveal items worth filing — for example, if AUDIT-03 ranks bot-protection low frequency but the corpus reveals a fixable pattern, that pattern goes in the backlog.

### QG-06 — Logging discipline

**Rule (CLAUDE.md):** All new logging via `log(env, severity, subsystem, data)` from `src/log.js`. No new `console.*` in non-exempt files. No new silent `catch {}`.

**Verified [Read CONCERNS.md]:** Currently, six `.catch(() => {})` Promise handlers exist in `src/`. PRE-02 eliminates one (`scheduler.js:138`). The other five (in `src/consent.js`) are documented as "non-fatal cross-origin frame evaluate" and not in scope for Phase 0.

**Phase 0 plan tasks (MUST):**
- **Task A3:** Plan A's PRE-02 commit is the canonical demonstration of QG-06 — replaces a silent catch with `log(env, 5, 'schedule', { event: 'schedule.advance_failed', ... })`.
- **Pre-commit grep gate (Plan A overall):** Before committing, run:
  ```bash
  grep -nE "\.catch\(\(\) ?=> ?\{\}\)" src/scheduler.js
  # Must return zero.
  grep -nE "console\.(log|warn|error|debug)" src/$(filename touched)
  # Must return zero (or only documented exceptions per CONCERNS.md table).
  ```

### QG-07 — UI prefix rule + grep before adding

**Rule (CLAUDE.md):** Any new function in `src/ui/` is view-prefixed (`<view>_<name>` or globally unique). Grep all `src/ui/*.js` before committing.

**Phase 0 plan tasks (MUST):**
- **Task A4:** Plan A's PRE-01 + PRE-03 are canonical demonstrations of QG-07 — both rename pre-existing colliding functions to view-prefixed names.
- **Pre-commit grep gate:**
  ```bash
  # PRE-01 verification:
  grep -nE "function +buildStatusBanner\b" src/ui/*.js
  # Must return only ui-detail.js:34.

  # PRE-03 verification:
  grep -nE "function +formatDate\b" src/ui/*.js
  # Must return only ui-settings.js:22.
  ```

### Should there be a CI check for QG-06 / QG-07?

CONTEXT.md §domain explicitly says *"no new gating mechanism is being designed here"*. So **no** — Phase 0 does not introduce CI lint rules for these. They remain review-time + grep-at-commit conventions for this milestone. Phase 5 introduces a stealth-import CI guard for BOT-04, which is a separate (narrower) instance of CI-as-gate; it is not a QG-07 enforcement.

## Validation Architecture

> Per Nyquist validation. Phase 0's tests largely already exist; some new fixtures and one new audit test file are needed.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 + `@cloudflare/vitest-pool-workers` 0.12.21 |
| Config files | `vitest.config.js` (unit, default), `vitest.integration.config.js` (real browser), `vitest.sync.config.ts` (OpenAPI sync) |
| Quick run command | `npm test` (unit only — fast, mocked browser) |
| Full suite command | `npm test && npm run test:sync` (integration is non-blocking on CI; locally runs separately) |
| Smoke-test command | `./scripts/smoke-test.sh` (against staging, post-deploy gate) |

⚠️ **Per CLAUDE.local.md §Testing:** `npm test` consumes ~8 GB RAM. Don't run two in parallel. Don't run for CSS/copy-only changes.

### Phase Requirements → Test Map

| REQ ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|--------------|
| PRE-01 | Banner rename does not break detail view | manual visual + unit | manual: dashboard render check; unit: none | ✅ no automated test possible (UI is concatenated string, no DOM tests) |
| PRE-01 | Banner renders for grace_period tenant | manual visual | dashboard inspection on staging | ✅ visual gate |
| PRE-02 | Silent catch removed | grep gate | `grep -nE '\.catch\(\(\) ?=> ?\{\}\)' src/scheduler.js` returns empty | ✅ |
| PRE-02 | Failure path emits structured log | unit | `npm test -- test/scheduler.test.js` (covers `advanceSchedule` failure with mocked D1 throw) | ❌ Wave 0 — `test/scheduler.test.js` likely needs a new `it('logs schedule.advance_failed when advanceSchedule throws', ...)` case — verify in execute-phase whether the case already exists |
| PRE-03 | formatDate rename does not break submit view | grep gate | `grep -nE 'function +formatDate\b' src/ui/*.js` returns only `ui-settings.js:22` | ✅ |
| AUDIT-01 | Battery file exists with ≥20 URLs covering 6 areas | manual + automated | `wc -l .planning/audit/url-battery.md` ≥ 20 + manual area-coverage check | ✅ structural check |
| AUDIT-02 | AUDIT.md contains the metric table with values | manual | inspection | ✅ doc gate |
| AUDIT-03 | AUDIT.md contains the failure-mode ranking | manual | inspection | ✅ doc gate |
| AUDIT-04 | CDP spike test exists and runs | integration | `npm run test:integration -- test/integration/cdp-availability.test.js` | ❌ Wave 0 — must be created |
| AUDIT-05 | "before" corpus CSV/Markdown exists with ≥20 capture_ids | manual | `wc -l .planning/audit/before-corpus.csv` or equivalent | ✅ doc gate |
| QG-04 | Evolution log dirs exist for Plan A and Plan B | manual | `ls docs/evolution/NNNN-*/` shows three .md files | ✅ structural check |
| QG-05 | `docs/backlog.md` updated (or explicit "no changes") | manual | `git diff docs/backlog.md` or `outcome.md` says so | ✅ |
| QG-06 | No new silent catches or `console.*` introduced | grep gate | grep across changed files | ✅ |
| QG-07 | No new colliding UI function names | grep gate | `grep -nE 'function +<name>\b' src/ui/*.js` returns ≤1 per name | ✅ |

### Sampling Rate
- **Per task commit (Plan A):** `npm test -- test/scheduler.test.js test/auth.test.js` (the touched modules) — fast. **Do not run full `npm test` per commit unless `src/` changes meaningfully.**
- **Per Plan A merge:** `npm test` (full unit suite) + `npm run lint:api` + `npm run test:sync`. Gate.
- **Plan A staging deploy gate:** `./scripts/smoke-test.sh` against staging URL.
- **Plan A production deploy gate:** smoke pass against production URL + visual banner confirmation per CONTEXT.md.
- **Per Plan B merge:** `npm run test:integration -- test/integration/cdp-availability.test.js` (the new spike test). Phase gate.
- **Phase gate:** Both plans merged, all gates above green, `AUDIT.md` and `url-battery.md` committed, evolution log entries written.

### Wave 0 Gaps
- [ ] `test/integration/cdp-availability.test.js` — covers AUDIT-04. NEW FILE.
- [ ] `test/scheduler.test.js` may need a new `it()` for PRE-02 — verify whether existing scheduler tests already cover the threat-block error path; if not, add one. Check during execute-phase.
- [ ] No new framework install required.
- [ ] `.planning/audit/` directory creation — `mkdir -p .planning/audit/` before writing `url-battery.md`, `before-corpus.csv`, `AUDIT.md`.

## Risks & Landmines

### Risk 1: PRE-02 deploy floods Coralogix with previously-silent errors
**Severity:** MEDIUM. **Likelihood:** LOW (no evidence of widespread D1 advanceSchedule failures, but unknown until visible).
**Detection:** After staging deploy, query Coralogix for `$d.event == 'schedule.advance_failed'` for 24h. If counts spike, investigate the underlying D1 issue before promoting to production.
**Mitigation:** Stage-then-promote with a 24-hour observation window between, **not** a same-day staging→production promote. CONTEXT.md doesn't mandate the window length; recommend at least one full cron-tick day (24h) so blocked schedules have ample firing opportunity.

### Risk 2: PRE-01 banner re-emerges with the wrong content for non-billing-state tenants
**Severity:** LOW. **Likelihood:** LOW.
**Detection:** Visual confirmation per CONTEXT.md PRE deploy gate. The fix is two-line; the only failure mode is forgetting to update the call site at line 169.
**Mitigation:** Pre-commit grep gate listed under QG-07 catches this.

### Risk 3: PRE-03 bodies aren't actually identical
**Severity:** LOW. **Likelihood:** LOW (verified identical via Read).
**Detection:** Diff the two function bodies one more time at execute-time; if they're identical, the rename is a pure rename and zero behavior changes.
**Mitigation:** Verified at research time. Re-verify at execute time before committing.

### Risk 4: Coralogix percentile syntax doesn't match query templates above
**Severity:** MEDIUM. **Likelihood:** MEDIUM (DataPrime syntax for `percentile()` is plausible but untested in this session).
**Detection:** Run a single query against the live Coralogix endpoint with `LIMIT 5` to verify syntax before running all nine queries.
**Mitigation:** Execute-phase task: validate one query end-to-end first; iterate if `percentile()` is a different name in DataPrime (`approx_percentile`, `quantile`, etc.). The ops-runbook skill is the authoritative reference.

### Risk 5: CDP spike fails for a reason other than version (binding, fixture URL, miniflare quirk)
**Severity:** LOW. **Likelihood:** LOW.
**Detection:** If the spike fails on 1.1.2 (expected), the recorded error message and stack distinguish "method does not exist" from "method exists but threw on this fixture". The audit should record the **shape** of the failure, not just yes/no.
**Mitigation:** Test code captures `cdpError = { name, message }` regardless of outcome. Record both fields in AUDIT.md.

### Risk 6: Audit URL battery captures fail in unexpected ways and corrupt the "before" baseline
**Severity:** LOW. **Likelihood:** MEDIUM (some battery URLs *should* fail — that's the point).
**Detection:** Each capture's status is recorded (`complete | partial | failed`). A URL that produces `failed` is still data — it gates the post-milestone delta on whether the same URL still fails after fidelity work.
**Mitigation:** No remediation needed during audit; the entire point is to record current state.

### Risk 7: `MAX_SUBRESOURCES` cap-hit signal uses substring match
**Severity:** LOW. **Likelihood:** MEDIUM.
**Detection:** Sample a few `capture.partial` log entries to see whether `limitExceeded` is its own field or only embedded in the partial message body.
**Mitigation:** During execute-phase, prefer field equality over `~~` substring match if `limitExceeded` is a structured field. Record the actual query used in `AUDIT.md` §4.

### Risk 8: Audit is run against post-PRE-02 system but baseline is described as "current production"
**Severity:** NONE (this is the intended sequencing per CONTEXT.md D-14). Documented here for explicitness: the AUDIT-02 baselines are the **post-PRE-02** baselines. `AUDIT.md` should call this out: *"Baselines measured after PRE-01/02/03 deploy. The `schedule.advance_failed` event is now visible; pre-fix this was silent and would have been zero in any 30-day window."*

### Risk 9: Plan A's three-commit-PR is rejected by CI (e.g., test-version-sync hook failure)
**Severity:** LOW. **Likelihood:** LOW.
**Detection:** `scripts/check-version-sync.sh` runs in CI; mismatched version markers fail the build.
**Mitigation:** PRE fixes don't touch version markers, so this should be clean. If failure occurs, fix root cause (don't skip with `--no-verify`).

## Open Questions (RESOLVED)

1. **Exact DataPrime `percentile` function name.**
   **RESOLVED:** defer to execute-phase probe; B-03 task runs a single test query with `LIMIT 5` first to confirm function name before issuing the full query.
   - What we know: ops-runbook skill demonstrates DataPrime queries but does not use percentiles in its examples. The `groupby true aggregate percentile(...)` syntax is plausible Lucene-family DataPrime but unverified.
   - What's unclear: Whether the function is `percentile`, `approx_percentile`, `quantile`, or something else; whether it takes the percentile as 0-1 or 0-100.
   - Recommendation: Execute-phase task validates one query against the live Coralogix endpoint first, before paste-running all nine. Update `AUDIT.md` §4 with the verified syntax.

2. **`limitExceeded` field structure.**
   **RESOLVED:** defer to execute-phase; B-03 samples one `capture.partial` log first.
   - What we know: `src/capture.js:504-505` constructs a string `Page exceeded ${MAX_SUBRESOURCES} subresource limit` and assigns it to `limitExceeded`. We don't know whether this string lands as its own structured field in the Coralogix log payload or only as part of an enclosing message.
   - What's unclear: Whether to query with `$d.limitExceeded != null` or `$d ~~ 'subresource limit'`.
   - Recommendation: Execute-phase samples a `capture.partial` log entry to disambiguate.

3. **Browser-hour billing accuracy.**
   **RESOLVED:** labeled as proxy in AUDIT.md; cross-check against CF dashboard and note delta.
   - What we know: The proxy `sum(durationMs) / 3600000` over `capture.success + capture.partial` events is the closest available approximation.
   - What's unclear: Whether Cloudflare's actual billing meters something different (idle session time? per-page time? per-context time?).
   - Recommendation: Mark the value in `AUDIT.md` as "browser-hour proxy from emitted logs" and note the discrepancy from CF's billing readout if it's known.

4. **Which 20 URLs?**
   **RESOLVED:** defer to execute-phase per Plan B-02 checkpoint task; planner-at-execute-time selects from CONTEXT.md categories with developer approval.
   - What we know: The selection criteria, the area split, and the constraint that no two URLs fail the same way.
   - What's unclear: The actual URLs.
   - Recommendation: Defer to plan-time. The planner runs fresh web research and picks the list — committing it here would freeze stale URLs.

5. **`test/audit/` vs `test/integration/audit/` for the CDP spike.**
   **RESOLVED:** `test/integration/audit/cdp-availability.test.js` (matches existing integration include glob; chosen in Plan B-01).
   - What we know: CONTEXT.md suggests `test/audit/cdp-availability.test.js`. The integration config's `include` glob is `test/integration/**/*.test.js`.
   - What's unclear: Whether to broaden the include glob or move the file under `test/integration/`.
   - Recommendation: Place at `test/integration/audit/cdp-availability.test.js`. Inherits glob, no config change. Audit-related grouping is preserved via the subdirectory.

## Sources

### Primary (HIGH confidence)
- **Read:** `src/ui/ui-billing.js`, `src/ui/ui-detail.js`, `src/ui/ui-settings.js`, `src/ui/ui-submit.js`, `src/ui/ui-shell.js`, `src/scheduler.js`, `src/log.js`, `src/capture.js`, `src/consent.js`
- **Read:** `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/phases/00-foundation/00-CONTEXT.md`
- **Read:** `.planning/codebase/STACK.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/TESTING.md`
- **Read:** `.planning/research/SUMMARY.md` (relevant excerpts)
- **Read:** `CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules/*.md`, `.claude/skills/ops-runbook/SKILL.md`
- **Bash:** `grep` cross-checks for `buildStatusBanner`, `formatDate` callsites; npm registry check (`npm view @cloudflare/playwright versions`)

### Secondary (MEDIUM confidence)
- **WebSearch:** `@cloudflare/playwright newCDPSession Network.getResponseBody support v1.3.0` — confirmed CDP support landed in v1.3.0 (April 2026 announcement). Cross-reference: [npm @cloudflare/playwright](https://www.npmjs.com/package/@cloudflare/playwright), [Cloudflare Browser Run docs](https://developers.cloudflare.com/browser-run/playwright/), [GitHub cloudflare/playwright](https://github.com/cloudflare/playwright)

### Tertiary (LOW confidence)
- **[ASSUMED]** — DataPrime `percentile()` function syntax. Plausible but unverified in this session — see Open Question 1.
- **[ASSUMED]** — `limitExceeded` field structure in Coralogix payload — see Open Question 2.
- **[ASSUMED]** — Browser-hour proxy accuracy — see Open Question 3.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | DataPrime `percentile(0.5, field)` is the correct syntax for 50th-percentile aggregation | Audit Methodology — query 1, 7, 8 | Audit queries return errors; executor fixes syntax; no permanent damage |
| A2 | `MAX_SUBRESOURCES` cap-hit can be detected by substring match `$d ~~ 'subresource limit'` on `capture.partial` events | Audit Methodology — query 6 | Cap-hit rate misses some hits or includes false positives; refine in executor |
| A3 | Browser-hour proxy `sum(durationMs)/3600000` is acceptably close to actual CF billing | Audit Methodology — query 9 | Number in `AUDIT.md` differs from CF dashboard; document as proxy, not authoritative |
| A4 | `@cloudflare/playwright@1.1.2` does NOT support `newCDPSession` (CDP added in 1.3.0) | CDP Spike Approach | Spike unexpectedly passes on 1.1.2 — better outcome than expected; Phase 7 unblocked sooner |
| A5 | `test/integration/audit/cdp-availability.test.js` matches the integration include glob `test/integration/**/*.test.js` | CDP Spike Approach + Open Question 5 | Test doesn't run — easy fix in CI |
| A6 | The 4-digit phase number for the next evolution log entry is **0108** | Process Convention Enforcement — QG-04 | Numbering off-by-one — purely cosmetic, planner picks the next sequential number at planning time |

**User confirmation needed?** No — all assumptions are verifiable in execute-phase via cheap probes (one Coralogix query, one log inspection, one test run).

## Metadata

**Confidence breakdown:**
- PRE-01/02/03 fixes: **HIGH** — exact lines, exact diffs verified
- Audit query shapes: **MEDIUM** — DataPrime syntax for `percentile()` not session-verified
- CDP spike methodology: **HIGH** — version landscape + API shape verified
- URL battery framework: **HIGH** — selection criteria explicit; **MEDIUM** for the actual URL list (defers to planner)
- Process convention enforcement (QG-04..07): **HIGH** — rules already documented, evolution log structure verified

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (30 days for stable sources, sooner if `@cloudflare/playwright` ships 1.4.0 or Coralogix changes its DataPrime API)

## RESEARCH COMPLETE
