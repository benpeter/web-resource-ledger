# Process: R26 Tenant Quotas

## TL;DR

Seven specialists planned a per-tenant quota system, six reviewers vetted the
architecture, and five execution agents built it in six tasks across two approval
gates. 132 new tests, 2410 lines added, one code review bug caught and fixed.
The interesting decisions: overruling security-minion on dual-check enforcement,
resolving a naming conflict between security and UX ("free" vs "Starter"), and
the Lucy-triggered team expansion that added two specialists before planning began.

## Team Composition

### The Lucy Intervention

The initial meta-plan proposed five specialists: data-minion, api-design-minion,
iac-minion, frontend-minion, and security-minion. Lucy (running as autonomous
gate decision-maker) flagged that two cross-cutting agents were missing:

- **ux-strategy-minion**: Quotas are a user-facing concept touching multiple UI
  surfaces (settings, submit form, 429 error). Journey coherence analysis needed.
- **software-docs-minion**: The distinction between rate limits (per-minute,
  Cloudflare rate limiter) and quotas (per-month, D1 counters) is subtle enough
  to confuse API consumers. Documentation planning needed upfront.

Both were flagged as "ALWAYS include" in the cross-cutting checklist. This
triggered a Phase 1 re-run with the expanded team, regenerating all planning
questions to account for the new specialists' domains. The re-run was substantive,
not cosmetic -- the ux-strategy-minion's planning question asked about cognitive
load in the capture submission flow, warning thresholds, and tier naming, none of
which the original five-agent plan addressed.

### Planning Agents (Phase 2)

All seven specialists ran in parallel:

1. **data-minion** argued for tier as a real column (not JSON), quotas as code
   constants (not D1), and `db.batch()` for single-roundtrip quota checks. Clean
   consensus -- no pushback from other agents.

2. **api-design-minion** recommended RFC 9457 Problem Detail with `limitType:
   'quota'` discriminator, whole-batch rejection, and placement after rate limit
   but before body parse. The key insight: two types of 429 (rate limit vs quota)
   need a clean discriminator, and the existing `problemResponse` helper already
   supports `extra` fields.

3. **iac-minion** confirmed D1 reads are sub-5ms for PK lookups, well within the
   10ms latency budget. Explicitly recommended against KV caching -- YAGNI. This
   was the simplest recommendation but arguably the most important: it prevented
   a caching layer that would have added complexity without demonstrated need.

4. **frontend-minion** recommended usage as a settings section (not new route),
   a dedicated `GET /v1/account/usage` endpoint (not inline in session), and
   vanilla CSS progress bars with threshold classes. The routing decision was
   obvious in hindsight -- two progress bars don't justify their own page.

5. **security-minion** identified the key threat vectors: quota bypass via
   multiple API keys (ruled out -- quotas are per-tenant, not per-key), overage
   exploitation via concurrent requests (bounded by rate limit), and information
   disclosure via tier names in errors. The dual-check recommendation (enforce
   quota at both HTTP handler and queue consumer) was the most contentious -- it
   was ultimately overruled.

6. **ux-strategy-minion** made three recommendations that shaped the final product:
   (a) warning thresholds at 80% and 95% (three-state visual), (b) "Starter" not
   "Free" for the tier display name (psychological framing), and (c) no quota
   info on the submit form unless approaching limits (cognitive load reduction).

7. **software-docs-minion** recommended consolidating rate limits and quotas into
   a single "Limits & Quotas" guide rather than separate docs. This avoided the
   confusion of two documents covering related-but-different enforcement
   mechanisms.

### Architecture Reviewers (Phase 3.5)

Six reviewers: five mandatory (security-minion, test-minion, ux-strategy-minion,
lucy, margo) plus one discretionary (accessibility-minion, for progress bar WCAG).
All returned ADVISE (zero BLOCKs).

Key advisories that changed the implementation:

- **security-minion**: The existing `handlePutTenantConfig` catch block only
  matched errors starting with `rateLimit.` or `Invalid tenantId`. New quota
  validation errors (starting with `quotas.`) would fall through as 500s. Added
  to the catch condition in Task 1.

- **lucy + margo**: Both independently flagged that the usage endpoint (Task 3)
  would duplicate the exact D1 batch query from `checkQuota`. Solution: call
  `checkQuota(db, tenantId, 0)` -- the `count=0` turns it into a usage-only
  query. A fallback path handles the over-limit edge case.

- **margo**: Extract `computeQuotaReset()` as a named helper (was inline in
  checkQuota) and `buildQuotaHeaders()` for DRY header construction across single
  and batch endpoints. Classic margo -- eliminating duplication before it ships.

- **accessibility-minion**: Progress bars for storage bytes need `aria-valuenow`
  in human-readable format (`formatBytes(n)`) rather than raw byte counts. A
  screen reader announcing "214748364800 of 53687091200" is not useful.

## Conflict Resolutions

### Tier Naming (security-minion vs ux-strategy-minion)

**Conflict**: security-minion said never expose tier name anywhere user-visible
(information disclosure risk). ux-strategy-minion said show "Starter" / "Pro" in
the UI (users need to know their plan level).

**Resolution**: Three-layer naming. Internal code uses `free`/`pro` (the data
layer). API responses include `tierDisplay: 'Starter'`/`'Pro'` (the presentation
layer). Error responses never include tier information (the security layer). Both
agents' concerns are addressed without compromise.

### Queue Consumer Dual-Check (security-minion overruled)

**Conflict**: security-minion recommended enforcing quotas both at the HTTP
handler (before queueing) and at the queue consumer (before browser launch), to
prevent TOCTOU exploitation.

**Resolution**: Overruled. By the time the queue consumer runs, the 202 has
already been sent to the client. Rejecting in the consumer would silently drop
a capture the client thinks was accepted. The TOCTOU window is bounded by the
per-tenant rate limit -- at most a handful of concurrent requests can slip
through. The issue explicitly states "slight overages are acceptable."

This was the right call. The dual-check would have added complexity (the consumer
would need quota awareness and a failure reporting mechanism) to prevent a
scenario that is both bounded and acceptable by design.

## Human Interventions

This was a fully autonomous orchestration (no interactive user). Lucy agent made
all gate decisions:

- **Team gate**: Adjusted from 5 to 7 agents (added ux-strategy-minion and
  software-docs-minion).
- **Reviewer gate**: Approved 5 mandatory + 1 discretionary (accessibility-minion).
- **Execution plan gate**: Approved 6 tasks, 2 gates.
- **Task 1 gate**: Approved data layer (migration + quotas module).
- **Task 2 gate**: Approved pipeline integration.
- **Post-execution**: Selected "Run all" (code review, tests, documentation).
- **Calibration check**: Selected "Gates are fine."
- **PR gate**: Selected "Create PR."

No human changes were made to the plan or implementation. The autonomous gate
protocol worked as designed -- Lucy validated each gate against the issue's
success criteria and CLAUDE.md conventions.

## Phase 5 Bug Catch

Code review found a real bug in `formatBytes()` in `ui-settings.js`:

```js
// Bug: both ternary branches return 0
(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 0)

// Fix: second branch returns 1 (matching KB and GB patterns)
(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)
```

The MB branch silently discarded fractional precision (e.g., `1.5 MB` would
display as `2 MB`). The same pattern in the KB and GB branches correctly used
`? 0 : 1`. This was committed as a separate fix before the wrap-up.

## What Went Well

- **db.batch() performance**: The two-statement D1 batch (tenant tier + usage
  counters) was trivially fast. iac-minion's YAGNI call on KV caching was
  well-calibrated.

- **Auto-provisioning compatibility**: The `DEFAULT 'free'` on the tier column
  meant the OAuth signup flow from Phase 0055 needed zero changes. The
  `INSERT OR IGNORE INTO tenants(id)` picks up the default automatically.

- **Advisory quality**: All six Phase 3.5 reviewers returned substantive ADVISE
  (not rubber-stamp APPROVEs). The catch block fix, checkQuota reuse, and ARIA
  formatting were real improvements that would have been bugs or tech debt
  without the review.

## Where to Read More

- Full specialist discussions: `docs/history/nefario-reports/2026-03-23-030747-tenant-quotas/`
  - `phase2-*.md` -- seven specialist planning contributions
  - `phase3-synthesis.md` -- full delegation plan with task prompts
  - `phase3.5-*.md` -- six architecture review verdicts
  - `phase5-code-review-minion.md` -- code review findings
- Nefario report: `docs/history/nefario-reports/2026-03-23-030747-tenant-quotas.md`
- Design decisions: `docs/evolution/0056-tenant-quotas/decisions.md`
- PR: https://github.com/benpeter/web-resource-ledger/pull/135
