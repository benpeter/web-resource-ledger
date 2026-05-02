# Phase 0: Foundation - Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** 11 (3 modify, 8 create)
**Analogs found:** 11/11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ui/ui-billing.js` (modify) | UI component (concatenated string) | request-response (DOM render) | `src/ui/ui-detail.js` (already-prefixed pattern) | exact |
| `src/scheduler.js` (modify, line ~138) | scheduler / cron handler | event-driven (cron tick) | `src/scheduler.js:161-172` (`schedule.execute_fail` block — same file, sibling pattern) | exact |
| `src/ui/ui-submit.js` (modify) | UI component (concatenated string) | request-response (DOM render) | `src/ui/ui-detail.js` (prefixing convention) | exact |
| `.planning/audit/AUDIT.md` (create) | audit doc | n/a (artifact) | `.planning/codebase/CONCERNS.md` (sectioned audit-style markdown) | role-match |
| `.planning/audit/url-battery.md` (create) | audit data table | n/a (artifact) | RESEARCH.md §URL Battery Design template | role-match |
| `.planning/audit/before-corpus.csv` (create) | data manifest | n/a (artifact) | RESEARCH.md §Capture procedure template | role-match |
| `test/integration/audit/cdp-availability.test.js` (create) | integration test | request-response (browser binding) | `test/integration/capture-pipeline.test.js` | exact |
| `test/scheduled-handler.test.js` (extend, optional) | unit test | event-driven (cron tick) | `test/scheduled-handler.test.js` (existing describe blocks 74–) | exact (self-extension) |
| `docs/evolution/0108-pre-flight-cleanup/{prompt,decisions,outcome}.md` (create) | evolution log | n/a (artifact) | `docs/evolution/0107-stripe-authoritative-billing/` | exact |
| `docs/evolution/0109-foundation-audit/{prompt,decisions,outcome}.md` (create) | evolution log | n/a (artifact) | `docs/evolution/0107-stripe-authoritative-billing/` | exact |
| `docs/backlog.md` (modify) | backlog doc | n/a (artifact) | `docs/backlog.md` (self) | exact (self-extension) |

**Phase number note:** Per RESEARCH.md A6 + auto-memory `project_evolution_phase.md`, the most recent on disk is `0107-stripe-authoritative-billing/`. Plan A claims `0108`, Plan B claims `0109`. Planner must verify max number with `ls docs/evolution/` immediately before committing — autonomous runs have caused gaps.

## Pattern Assignments

### `src/ui/ui-billing.js` (modify, PRE-01)

**Analog:** `src/ui/ui-detail.js` (do **not** modify — its `buildStatusBanner` keeps the unprefixed name; only billing-side is renamed per RESEARCH.md PRE-01)

**Existing UI module structure pattern** (`src/ui/ui-detail.js:25-54`):
```js
function buildBackLink() {
  var back = document.createElement('a');
  back.href = '#/captures';
  back.className = 'detail-back-link';
  back.textContent = 'Back to captures';
  return back;
}

function buildStatusBanner(status) {
  var banner = document.createElement('div');
  banner.className = 'detail-status-banner';
  // ...
}
```
Detail-view uses no `detail_` prefix today (its name will become globally unique once billing renames). Billing-side adopts the prefix.

**Current bug callsite** (`src/ui/ui-billing.js:168-170`):
```js
// Section A: Status banner (conditional)
var banner = buildStatusBanner(usageData);
if (banner) view.appendChild(banner);
```

**Function declaration to rename** (`src/ui/ui-billing.js:198-200`):
```js
function buildStatusBanner(usageData) {
  var status = usageData.billingStatus;
  if (status !== 'grace_period' && status !== 'blocked') return null;
```

**Exact diff (per RESEARCH.md):** rename to `billing_buildStatusBanner` at line 198 + line 169. Total 2 lines changed in this file. No other files touched.

**Pre-commit grep gate (QG-07):**
```bash
grep -nE "function +buildStatusBanner\b" src/ui/*.js
# Must return only ui-detail.js:34
grep -nE "\bbilling_buildStatusBanner\b" src/ui/*.js
# Must return ui-billing.js:169 (call) + ui-billing.js:198 (decl)
```

---

### `src/scheduler.js` (modify, PRE-02, line 138)

**Analog:** `src/scheduler.js:161-172` — the **same file's** `schedule.execute_fail` block. Reusing the sibling pattern is mandated by RESEARCH.md PRE-02.

**Sibling pattern to copy** (`src/scheduler.js:161-172`):
```js
} catch (err) {
  ctx.waitUntil(log(env, 5, 'schedule', {
    event: 'schedule.execute_fail',
    scheduleId: schedule.id,
    tenantId,
    url: schedule.url,
    captureId: captureId ?? null,
    errorMessage: String(err?.message ?? '').slice(0, 128),
  }) ?? Promise.resolve());
  skippedCount++;
  continue;
}
```

**Surrounding context for the new emit** (`src/scheduler.js:135-148`):
```js
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

**Replacement code** (RESEARCH.md verbatim):
```js
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

**Pattern conventions copied verbatim from sibling block:**
- Severity `5` (error) — matches `schedule.execute_fail`.
- Subsystem `'schedule'` — matches every event in this file (`schedule.blocked_threat`, `schedule.execute_fail`, `schedule.tick`, `schedule.execute`).
- `String(err?.message ?? '').slice(0, 128)` — same 128-char clamp.
- `ctx.waitUntil(... ?? Promise.resolve())` envelope — `log()` returns `undefined` when bindings absent.

**Pre-commit grep gate (QG-06):**
```bash
grep -nE "\.catch\(\(\) ?=> ?\{\}\)" src/scheduler.js
# Must return zero (the threat-block silent catch is gone).
```

---

### `src/ui/ui-submit.js` (modify, PRE-03)

**Analog:** `src/ui/ui-detail.js` (existing `buildStatusBanner` is the closest "same role, no-prefix-yet" peer; PRE-03 prefixes the duplicate-named submit copy first because it has fewer call sites — 1 vs settings' 3).

**Existing duplicated function** (`src/ui/ui-submit.js:25-32`, byte-identical to `ui-settings.js:22`):
```js
function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return isoStr;
  }
}
```

**Diff (per RESEARCH.md PRE-03):**
```js
// src/ui/ui-submit.js:25
- function formatDate(isoStr) {
+ function submit_formatDate(isoStr) {

// src/ui/ui-submit.js:438
- var resetDate = data.resetsAt ? formatDate(data.resetsAt) : '';
+ var resetDate = data.resetsAt ? submit_formatDate(data.resetsAt) : '';
```

Total: 2 lines in `src/ui/ui-submit.js`. `ui-settings.js` untouched (3 callers there stay simpler).

**Pre-commit grep gate (QG-07):**
```bash
grep -nE "function +formatDate\b" src/ui/*.js
# Must return only ui-settings.js:22
grep -nE "\bsubmit_formatDate\b" src/ui/*.js
# Must return ui-submit.js:25 (decl) + ui-submit.js:438 (call)
```

---

### `test/integration/audit/cdp-availability.test.js` (create, AUDIT-04)

**Analog:** `test/integration/capture-pipeline.test.js`

**Imports pattern** (`test/integration/capture-pipeline.test.js:20-24`):
```js
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, inject } from 'vitest';
import { acquire, connect } from '@cloudflare/playwright';
import { performCapture } from '../../src/capture.js';
import { createCapture, getCapture } from '../../src/db.js';
```
The CDP spike imports the **same** `acquire`/`connect`/`env`/`inject`/`describe` set. Drop the `performCapture`/`createCapture` imports (not needed) and add nothing new.

**Browser session pre-acquisition pattern** (`test/integration/capture-pipeline.test.js:40-46`):
```js
async function ensureBrowserSession() {
  const session = await acquire(env.BROWSER, { keep_alive: 120000 });
  // Warm-up: connect then disconnect to confirm the browser is ready.
  const browser = await connect(env.BROWSER, session.sessionId);
  await browser.close();
}
```
Required because miniflare's browser binding doesn't implement `limits()`. Same pattern applies to the CDP spike — pre-acquire session in `beforeEach` so `acquire` inside the test finds a free session.

**Test body shape (from RESEARCH.md §CDP Spike Approach, lines 488-541) — copy verbatim into the new file:**
```js
describe('AUDIT-04 -- CDP availability on @cloudflare/playwright', () => {
  it('exposes page.context().newCDPSession(page) and Network.getResponseBody', async () => {
    const port = inject('testServerPort');
    const session = await acquire(env.BROWSER, { keep_alive: 60000 });
    const browser = await connect(env.BROWSER, session.sessionId);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // ... CDP probe ...
  });
});
```

**Fixture URL pattern** (`test/integration/capture-pipeline.test.js:78`):
```js
const port = inject('testServerPort');
await performCapture(env, `http://127.0.0.1:${port}/fast.html`, ...);
```
The CDP spike points at the same `/fast.html` fixture served by `test/integration/global-setup.js` (already handles this path — see `fixtureMap` at lines 42-49 of global-setup.js).

**Path placement decision (per RESEARCH.md Open Q5):** put the file at `test/integration/audit/cdp-availability.test.js`. The integration glob `test/integration/**/*.test.js` (verified in `vitest.integration.config.js:16`) auto-includes it. No config change needed.

**Run command:**
```bash
npm run test:integration -- test/integration/audit/cdp-availability.test.js
```

---

### `test/scheduled-handler.test.js` (extend — optional, only if existing case missing)

**Analog:** `test/scheduled-handler.test.js` itself (extend its existing describe pattern).

**Existing test setup pattern** (`test/scheduled-handler.test.js:32-68`):
```js
function makeController(scheduledTime = Date.now()) {
  return {
    scheduledTime,
    cron: '*/1 * * * *',
    noRetry() {},
  };
}

async function runScheduled(controller = makeController()) {
  const ctx = createExecutionContext();
  await worker.scheduled(controller, env, ctx);
}

beforeEach(async () => {
  await cleanDb(env.DB);
  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'default', scopes: ['capture', 'read'] });
});
```

**Existing describe block convention** (`test/scheduled-handler.test.js:74-90`):
```js
describe('scheduled handler -- no due schedules', () => {
  it('creates no captures when no schedules are due', async () => {
    await seedSchedule(env.DB, SCHEDULE_A, {
      tenantId: 'default',
      url: 'https://example.com',
      cron: '0 * * * *',
      nextRunAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    await runScheduled(makeController(Date.now()));
    const captures = await env.DB.prepare('SELECT * FROM captures').all();
    expect(captures.results.length).toBe(0);
  });
});
```

**For PRE-02 — new describe block to add (only if no equivalent exists):**
```js
describe('scheduled handler -- threat-blocked + advanceSchedule fails', () => {
  it('logs schedule.advance_failed when advanceSchedule throws on a blocked schedule', async () => {
    // Seed a schedule, force checkUrl to flag (or stub), force advanceSchedule to throw,
    // assert the log() emission shape.
  });
});
```
Verify-then-add: planner runs `grep -nE 'advance_failed|threat-block' test/scheduled-handler.test.js` first; only add if zero matches.

---

### `docs/evolution/0108-pre-flight-cleanup/{prompt,decisions,outcome}.md` (create, QG-04)

**Analog:** `docs/evolution/0107-stripe-authoritative-billing/`

**`prompt.md` pattern** (`docs/evolution/0107-stripe-authoritative-billing/prompt.md:1-26`):
```markdown
# Phase 0107: Stripe-Authoritative Billing Amounts

## Task

Make the billing UI show Stripe's actual upcoming invoice amount instead of
a locally computed estimate.

[problem statement, 1-2 paragraphs]

## Approach

[1 paragraph — high-level approach]

## Prior Work

- Calendar month billing anchor (phase 0102)
- Draft invoice hold via `invoice.created` webhook
```

**`decisions.md` pattern** (`docs/evolution/0107-stripe-authoritative-billing/decisions.md:1-40`):
```markdown
# Decisions -- Phase 0107

## Cache on `tenants` vs `usage_counters`

**Decision**: Cache invoice data on `tenants` table.

[1-2 paragraph rationale]

## GET param fix in `stripeRequest`

**Decision**: Fix `stripeRequest` to put params in query string for GET requests.

[rationale]
```
One H2 per discrete decision. **Decision** in bold, then rationale paragraph(s).

**`outcome.md` pattern** (`docs/evolution/0107-stripe-authoritative-billing/outcome.md:1-60`):
```markdown
# Outcome -- Phase 0107

## What was built

[Numbered list of behavioral changes, 3-5 bullets]

## Files changed

| File | Change |
|------|--------|
| `src/stripe.js` | Fixed GET param handling in `stripeRequest`; added `getUpcomingInvoice` |
| `src/db.js` | Added `cacheStripeInvoice`, `clearStripeInvoiceCache` |

## Backlog changes

- **Deferred**: Daily full-refresh for inactive tenants (acceptable staleness)
```
Note the `## Backlog changes` section is the QG-05 hook — Plan A's outcome must include this section even if empty (then it explicitly says "no changes").

---

### `docs/evolution/0109-foundation-audit/{prompt,decisions,outcome}.md` (create, QG-04)

**Analog:** identical to Plan A's evolution log (`docs/evolution/0107-stripe-authoritative-billing/`). Same three files, same H2 conventions. Plan B's `outcome.md` will likely have non-empty `## Backlog changes` (audit findings → backlog items).

---

### `.planning/audit/AUDIT.md` (create, AUDIT-02/03/04)

**Analog:** `.planning/codebase/CONCERNS.md` (closest existing sectioned-audit markdown in the repo).

**Heading structure pattern** (`.planning/codebase/CONCERNS.md:1-10`):
```markdown
# Concerns & Technical Debt

Date of scan: 2026-04-30. Source: ripgrep/grep over `src/`, `test/`, `migrations/`,
`landing/`, `packages/` (excluding `node_modules`, `.wrangler`, `src/vendor/`),
plus `CLAUDE.md`, `OPERATIONS.md`, ...

---

## Known Fragile Areas
```
Open with metadata block (date, source/window, scope), then `---`, then numbered or named H2 sections.

**Section convention from CONCERNS.md** — each H2 is one audit topic, each H3 is a subdivision, tables for data:
```markdown
## Forbidden Pattern Violations

### Silent catch blocks

| File:Line | Context |
|---|---|
| `src/scheduler.js:138` | `await advanceSchedule(...).catch(() => {})` ... |
```

**`AUDIT.md` final structure (per CONTEXT.md Claude's Discretion + RESEARCH.md):**
```markdown
# WRL Capture-Quality Audit (Milestone Baseline)

**Window:** 2026-04-01 → 2026-05-01
**Source:** Coralogix EU2 (subsystem `capture` + corpus inspection)

## 1. Baselines (AUDIT-02)
[Table: metric | value | n (sample size) | source query]

## 2. Failure-mode Prioritization (AUDIT-03)
[Ranked table per #257 area]

## 3. CDP Availability Spike (AUDIT-04)
[Result: yes/no | Code reference: test/integration/audit/cdp-availability.test.js | Stack trace if no]

## 4. Coralogix Queries
[Verbatim DataPrime, one fenced block per query, with the query name as heading]
```

---

### `.planning/audit/url-battery.md` (create, AUDIT-01)

**Analog:** structural template from RESEARCH.md §URL Battery Design lines 627-635.

**Pattern:**
```markdown
| # | URL | Site-type tags | capture_id | Status | Notes |
|---|-----|----------------|------------|--------|-------|
| 1 | https://www.spiegel.de/... | paywall, PUR, sourcepoint, dach | cap_abc123... | complete | DACH PUR rep |
| 2 | https://example-onetrust... | cmp, onetrust, news | cap_def456... | complete | |
```

**Coverage rule (per RESEARCH.md table at lines 582-590):** ≥20 URLs spanning the six #257 areas (Dynamic 3+, CMP 6+, Tall 2+, Image-heavy 2+, Bot 4+, Paywall 3+).

**Diversity rule (per CONTEXT.md D-02):** failure-orthogonal — no two URLs may fail the same way.

**Frozen-for-milestone rule (per CONTEXT.md D-05):** once committed, the file does not change for the milestone.

---

### `.planning/audit/before-corpus.csv` (create, AUDIT-05)

**Analog:** RESEARCH.md §Capture procedure lines 596-606.

**Storage convention (per CONTEXT.md D-06):** R2 references only — no WACZ/screenshot/HTML committed to git. Rows are `URL,capture_id` and the planner can fetch artifacts later via the existing endpoints. Alternative: merge into `url-battery.md`'s table — both are acceptable per CONTEXT.md.

**R2 key convention (verified `src/capture.js:152-160, 197-211`):**
```
captures/{captureId}/screenshot.png
captures/{captureId}/screenshot-before.png   # if before-image present
captures/{captureId}/rendered.html
captures/{captureId}/headers.json
captures/{waczHash}.wacz                     # content-addressed (NOT under {captureId}/)
```
Note that `.wacz` is **content-addressed at the top level**, not nested under `captures/{captureId}/` — important if the corpus manifest tries to predict R2 keys. The audit corpus should only store `capture_id` and use the existing `/v1/captures/{id}/artifacts/*` endpoints to retrieve artifacts (per CONTEXT.md D-09); it should NOT try to compute R2 keys directly.

---

### `docs/backlog.md` (modify, QG-05)

**Analog:** `docs/backlog.md` itself.

**Existing tier convention (`docs/backlog.md:8-12`):**
```markdown
- **[must:condition]** -- required before a stated condition (e.g., `[must:multi-user]`
  means "must ship before a second user touches WRL"). Not unconditionally urgent.
- **[should]** -- strong consensus it's needed, no hard commitment yet
- **[consider]** -- may or may not be needed; parked with activation trigger
```

**Item format example (from same file):**
```markdown
- ~~#38 **R8: Auth identity enrichment** [S]~~ -- DONE: internal refactor, prerequisite for R1
```
Closed items are struck through (`~~ ... ~~`) and append `-- DONE: <one-line outcome>`. Open items omit the strikethrough.

**Phase 0 obligation:** both Plan A and Plan B `outcome.md` files must include a `## Backlog changes` section. If the phase produced no backlog deltas, the section says so explicitly ("the absence is the record" — CLAUDE.md §Evolution Log Rule 4).

---

## Shared Patterns

### Logging (PRE-02 + any future log emission added in Phase 0)

**Source:** `src/log.js` + sibling pattern in `src/scheduler.js:161-172` and `src/scheduler.js:188-194` and `src/scheduler.js:139-145`.
**Apply to:** PRE-02. Also any log() emit added by AUDIT work (none expected — audit is read-only against existing emit fields).

**Canonical envelope (from `src/scheduler.js:139-145`):**
```js
ctx.waitUntil(log(env, 4, 'schedule', {
  event: 'schedule.blocked_threat',
  scheduleId: schedule.id,
  tenantId,
  url: schedule.url,
  threatTypes: threat.threatTypes,
}) ?? Promise.resolve());
```

**Severity convention (from CONCERNS.md + scheduler.js usage):**
- `3` — info / lifecycle (e.g., `schedule.execute`)
- `4` — warning / non-error notable event (e.g., `schedule.blocked_threat`)
- `5` — error / D1 write failure (e.g., `schedule.execute_fail`, new `schedule.advance_failed`)

**Subsystem string convention:** dotted event names use the subsystem as prefix — `'schedule'` subsystem → `'schedule.advance_failed'` event. Do **not** use `'scheduler'` (the success criterion in ROADMAP.md uses `scheduler:advance_failed` informally; the established subsystem in the codebase is `'schedule'` — match the codebase, not the informal prose).

**Error truncation:** `String(err?.message ?? '').slice(0, 128)` — 128-char clamp is project-wide (CONVENTIONS.md §4 per RESEARCH.md).

---

### UI Prefix Rule (PRE-01 + PRE-03 + any new UI function in Phase 0)

**Source:** `CLAUDE.md` §"Dashboard UI Architecture" + the rename targets PRE-01/PRE-03 establish.
**Apply to:** PRE-01, PRE-03, and any new function added to `src/ui/*.js` in Plan A or Plan B (none expected for audit work).

**Convention:** `<view>_<function>` where `<view>` matches the file's view name without the `ui-` prefix. So `src/ui/ui-billing.js` adds prefix `billing_`, `src/ui/ui-submit.js` adds `submit_`, etc.

**Pre-add grep gate (QG-07, mandated in CLAUDE.md):**
```bash
# Before adding any new function `foo` to a UI file:
grep -nE "function +foo\b" src/ui/*.js
# Must return zero or only the file you're about to edit.
```

**Phase 0 specifics:** PRE-01 renames `buildStatusBanner` → `billing_buildStatusBanner` (only in `ui-billing.js`); PRE-03 renames `formatDate` → `submit_formatDate` (only in `ui-submit.js`). The detail-side `buildStatusBanner` and settings-side `formatDate` are intentionally left unprefixed — they become globally unique once their twin is prefixed.

---

### Evolution Log Triple (QG-04)

**Source:** `CLAUDE.md` §"Evolution Log" + `docs/evolution/0107-stripe-authoritative-billing/` as concrete shape.
**Apply to:** Plan A creates `0108-pre-flight-cleanup/`; Plan B creates `0109-foundation-audit/`. Numbers verified at planning time with `ls docs/evolution/`.

**Required files per directory:**
- `prompt.md` — phase task briefing (see analog above)
- `decisions.md` — H2 per discrete decision; **Decision** in bold; rationale paragraph (see analog above)
- `outcome.md` — what shipped + `## Files changed` table + `## Backlog changes` section (see analog above)

**Index update:** also append entry to `docs/evolution/README.md`.

**Process doc:** if either plan is delivered via a nefario orchestration that produces a PR, also write `process.md` per CLAUDE.md §"Process Documentation" + CLAUDE.local.md §"Process Documentation Style".

---

### Backlog Update (QG-05)

**Source:** `docs/backlog.md` + CLAUDE.md §Evolution Log Rule 4.
**Apply to:** both plans' `outcome.md`.

**Mandatory section header in `outcome.md`:**
```markdown
## Backlog changes

[Either: explicit list of items added/removed/retiered, or:
 explicit "No backlog changes — three pre-flight fixes are not on the backlog."]
```

**Strikethrough-on-close convention from existing items:** `~~#XX **Item title** [SizeTag]~~ -- DONE: <one-line outcome>`.

---

### Smoke Test Gate (Plan A only)

**Source:** existing `scripts/smoke-test.sh` (per CONTEXT.md and RESEARCH.md).
**Apply to:** Plan A's staging→production promotion only.

**Gate sequence (per CONTEXT.md PRE deploy gate):**
1. Merge Plan A PR → auto-deploy to staging.
2. Run `./scripts/smoke-test.sh` against staging URL — must pass.
3. Visual confirmation: dashboard renders the grace-period banner for at least one tenant in `billing_status='grace_period'` (synthetic D1 row if no real tenant qualifies).
4. Promote to production via existing release path.
5. Observation window: 24h before declaring success (Risk 1 in RESEARCH.md — watch for `schedule.advance_failed` flood).

---

## No Analog Found

None. Every Phase 0 file has a strong codebase analog.

## Metadata

**Analog search scope:** `src/`, `src/ui/`, `test/`, `test/integration/`, `docs/evolution/`, `docs/backlog.md`, `.planning/codebase/`.
**Files scanned:** ~25 read; ~10 grep'd for callsites and existing patterns.
**Pattern extraction date:** 2026-04-30
