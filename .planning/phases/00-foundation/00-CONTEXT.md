# Phase 0: Foundation - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Two parallel-ish workstreams that establish the measurement and code-hygiene baseline for the rest of the milestone:

1. **Pre-flight cleanup (PRE-01/02/03):** three surgical bug fixes in existing
   files — UI scope-collision rename for `buildStatusBanner`, replacement of a
   silent catch in the scheduler with proper logging, and a view-prefix rename
   for the duplicate `formatDate` helper. No behavioral additions; this is
   strictly hygiene to land before any audit measurements run, so baselines
   reflect a clean system.

2. **Capture-quality audit (AUDIT-01..05 + QG-04..07):** a hand-curated URL
   battery committed to `.planning/audit/url-battery.md`, a "before" capture
   corpus produced through the production WRL API, a Coralogix-derived
   baseline document at `.planning/audit/AUDIT.md` covering the AUDIT-02
   metric list, a prioritized failure-mode ranking, and a CDP-availability
   spike that gives Phase 7 a yes/no answer on `Network.getResponseBody` via
   `@cloudflare/playwright`.

Out of scope: any pipeline harness work (Phase 1), any capture-behavior
changes (Phases 2–7), any infrastructure or tenancy changes. QG-04..07 are
existing CLAUDE.md conventions — phase outcomes must comply, but no new
gating mechanism is being designed here.

</domain>

<decisions>
## Implementation Decisions

### URL Battery (AUDIT-01)
- **D-01:** Battery is **hand-curated**, but the planner/researcher proposes
  the candidate list. The list emerges from web research on the current CMP
  and paywall landscape, not from production traffic mining.
- **D-02:** **Diversity is the explicit selection criterion.** No two URLs
  should fail the same way. Spread across distinct CMP vendors (OneTrust,
  Cookiebot, Sourcepoint, TrustArc, Usercentrics, Quantcast Choice, custom),
  distinct paywall types, distinct bot-protection providers (Cloudflare,
  Akamai, PerimeterX, DataDome), distinct dynamic-content patterns
  (SPA/SSR/hybrid), and distinct regional contexts.
- **D-03:** **Public-side only of paywalled sites** — captures hit the
  article URL anonymously and record whatever an unauthenticated visitor
  sees (paywall overlay, partial content, hard wall). No test accounts, no
  authenticated captures.
- **D-04:** **Include the "consent-or-pay" (PUR) pattern** — sites where the
  CMP modal forces an Accept-All-or-Pay choice (canonical example:
  spiegel.de). The acceptance path through autoconsent must still function
  for these. Likely DACH publishers in the battery: spiegel.de, zeit.de,
  faz.net, sueddeutsche.de — pick one or two diverse representatives, not
  all four.
- **D-05:** **Frozen for the milestone.** Once `url-battery.md` is committed,
  the list does not change. Subsequent phases reference it but do not add or
  swap URLs — preserves A/B comparability across the whole milestone.

### "Before" Corpus Storage (AUDIT-05)
- **D-06:** **R2 references only.** Each URL in the battery is captured
  through the production API; the resulting `capture_id` and R2 keys are
  recorded in `.planning/audit/url-battery.md` (or a sibling
  `before-corpus.md`). No WACZ or screenshot files are committed to git.
- **D-07:** **Production environment.** Captures are submitted to
  `https://api.webresourceledger.com` against the operator's own tenant, not
  staging. Reflects real production code paths and signing keys. Volume is
  trivial vs. operator's normal usage.
- **D-08:** **End-of-milestone re-capture only.** The audit produces the
  "before" set once. The full battery is re-captured only at end of
  milestone for the headline before/after delta. Each intermediate phase
  performs its own area-specific A/B comparison against the original
  "before" set — no full-battery re-runs in between.
- **D-09:** Future phases compare via the existing `/v1/captures/{id}/artifacts/*`
  endpoints. This relies on WRL's "we never delete captures" retention
  guarantee, which is a product invariant, not a Phase 0 concern.

### Coralogix Baseline (AUDIT-02)
- **D-10:** **Last 30 days, aggregated** is the baseline window. p50/p95/p99
  capture duration, partial-capture rate, consent detection rate (overall +
  per-CMP), `MAX_PAGE_HEIGHT` and `MAX_SUBRESOURCES` cap-hit rates, settleMs
  and consentMs distributions, and browser-hour consumption are all computed
  over the 30-day window. This is the comparison floor for QG-02 (no
  regression) and QG-03 (p95 budget) for the rest of the milestone.
- **D-11:** Per-tenant breakout is **not** required in `AUDIT.md`. Aggregate
  numbers only. Fidelity work is system-wide, so per-tenant noise dilutes
  the signal. (If a future phase needs per-tenant numbers it can run its own
  query — the queries themselves are documented in `AUDIT.md` for re-use.)
- **D-12:** **Coralogix queries are embedded verbatim** in `AUDIT.md`
  alongside the numeric results. Repeatability matters more than concision —
  later phases re-run the same queries to compute the milestone-end "after"
  numbers, and any Coralogix dashboard rebuild needs the queries available
  here.

### Plan Partition
- **D-13:** **Two plans, matching the roadmap estimate.**
  - **Plan A (small): Pre-flight fixes.** PRE-01, PRE-02, PRE-03 in a single
    PR with three atomic commits. Deploy to staging, run smoke tests via
    `scripts/smoke-test.sh`, then promote to production.
  - **Plan B (medium): Audit.** AUDIT-01 (battery), AUDIT-02 (baselines),
    AUDIT-03 (failure-mode ranking), AUDIT-04 (CDP spike), AUDIT-05 (before
    corpus). Single phase deliverable, can be one PR or split internally.
- **D-14:** **Plan A must merge and deploy before Plan B starts measuring.**
  PRE-02's logging fix is the only PRE change that could affect baselines
  (currently-swallowed `scheduler:advance_failed` errors will start
  appearing in Coralogix). Run baselines against the cleaned-up system so
  the numbers reflect post-fix behavior.

### Claude's Discretion
- **CDP spike form factor (AUDIT-04):** Land the spike as a persistent test
  file under `test/audit/cdp-availability.test.js` (or similar path). The
  test calls `page.context().newCDPSession(page)` and `Network.getResponseBody`
  against a known-good fixture URL and asserts both are usable. Keeping it
  as a test rather than a one-shot script means future
  `@cloudflare/playwright` upgrades automatically re-validate the assumption
  Phase 7 depends on.
- **`AUDIT.md` structure:** four sections — (1) Baselines table (the AUDIT-02
  metric list), (2) Failure-mode prioritization (AUDIT-03), (3) CDP spike
  result with code reference (AUDIT-04), (4) Coralogix queries used.
- **`@cloudflare/playwright` `^1.1.2 → ^1.3.0` upgrade:** STACK.md
  recommends this. **Defer to Phase 1** — keeps Plan A's pre-flight scope
  pure (bug fixes only, no dependency churn) and the upgrade is more
  naturally bundled with the pipeline-harness work that will exercise the
  new CDP plumbing anyway.
- **PRE-03 disambiguation:** If both `formatDate` callsites are equally
  valid candidates for the prefix, prefer renaming `ui-submit.js`'s copy
  (it's the newer one and is referenced from fewer places per typical
  WRL UI structure) — but planner should grep before deciding.
- **PRE deploy gate:** Plan A's promotion to production is gated on
  `scripts/smoke-test.sh` passing against staging, plus visual confirmation
  that the billing-grace-period banner now renders for at least one tenant
  in that state (or via a synthetic preview if no real tenant is currently
  in grace period).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning
- `.planning/PROJECT.md` §Context — capture pipeline current state, caps,
  engineering culture
- `.planning/PROJECT.md` §Key Decisions — Sequencing-B rationale, why audit-first
- `.planning/REQUIREMENTS.md` §PRE — exact rename targets and line numbers
  for PRE-01/02/03
- `.planning/REQUIREMENTS.md` §AUDIT — full AUDIT-01..05 acceptance text
- `.planning/REQUIREMENTS.md` §QG — QG-04..07 phase compliance gates
- `.planning/ROADMAP.md` §"Phase 0: Foundation" — success criteria,
  inherited risks, plan estimates
- `.planning/research/SUMMARY.md` §"Synthesis Adjustments After Review
  (2026-04-30)" — updated phase sequence; CDP gating rationale; stack decisions
- `.planning/research/SUMMARY.md` §"Recommended Stack Decisions" — `@cloudflare/playwright`
  upgrade recommendation; CDP `Network.getResponseBody` rationale; deviceScaleFactor
  cutover note (irrelevant to this phase but flags Phase 2's blast radius)

### Codebase maps
- `.planning/codebase/STACK.md` — capture-pipeline dependencies, WARC builder,
  Playwright version
- `.planning/codebase/ARCHITECTURE.md` — capture pipeline structure
- `.planning/codebase/CONCERNS.md` §Scope Collision — root cause for PRE-01
- `.planning/codebase/CONCERNS.md` §Silent Catch — root cause for PRE-02
- `.planning/codebase/CONVENTIONS.md` — view-prefix rule (PRE-03 enforcement)
- `.planning/codebase/TESTING.md` — test layout and conventions for the CDP
  spike test file

### Engineering rules (always-on)
- `CLAUDE.md` §"Dashboard UI Architecture" — view-prefix rule (PRE-01, PRE-03,
  QG-07)
- `CLAUDE.md` §"Engineering Philosophy" — `log()` requirement (PRE-02, QG-06),
  "fail loudly, degrade intentionally" (PRE-02), "test the real boundaries"
- `CLAUDE.md` §"Evolution Log" — QG-04 deliverable structure
- `CLAUDE.md.local` §"Local Secrets" — credential names if the audit script
  needs to authenticate

### External issues (context only)
- GitHub issue **#257** — six-area capture-quality umbrella (the basis for
  AUDIT-01's six categories)
- GitHub issue **#206** — pluggable capture pipeline (Phase 1; informs
  AUDIT-04 framing because it gates SUB requirements that #206 enables)

### Source files referenced by name in PRE
- `src/ui/ui-billing.js:198` — current `buildStatusBanner` (rename target)
- `src/ui/ui-detail.js:34` — colliding `buildStatusBanner` (winner per
  load order; do not touch)
- `src/scheduler.js:138` — silent catch site
- `src/ui/ui-settings.js:22` and `src/ui/ui-submit.js:25` — duplicate
  `formatDate` callsites
- `src/log.js` — required logger entry point for PRE-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/log.js` `log(env, severity, subsystem, data)`:** the logger PRE-02
  must use. Already wired to Coralogix; the new `scheduler:advance_failed`
  log line will appear in production immediately after deploy.
- **`scripts/smoke-test.sh`:** existing staging smoke-test entrypoint. Plan
  A's promotion gate.
- **`/v1/captures/{id}/artifacts/{type}` endpoints:** already exist for
  `screenshot`, `html`, `headers`, `wacz`, `certificate`. The "before"
  corpus is just capture IDs + R2 keys; future phases re-fetch via these
  endpoints. No new API surface needed.
- **Coralogix existing dashboards / log indices:** capture-pipeline events
  are already emitted (settle outcomes, consent attempts, partial-capture
  fallbacks). AUDIT-02 mostly composes existing fields; it does not require
  new instrumentation.
- **`src/ui/ui-shell.js`:** the concatenator that produces the global-scope
  collision PRE-01 fixes. Useful context for verifying the rename is
  complete (grep for any remaining `buildStatusBanner` callsites that need
  updating).

### Established Patterns
- **View-prefix rule (`CLAUDE.md` §"Dashboard UI Architecture"):**
  `<view>_<function>` (e.g., `billing_buildStatusBanner`,
  `submit_formatDate`). PRE-01 and PRE-03 must follow it; QG-07 mandates
  grep-before-commit for any new UI functions added in this phase.
- **`log(env, severity, subsystem, data)` pattern:** never `console.*` in
  production paths (limited documented exceptions in CLAUDE.md). Subsystem
  string for the new line should be `scheduler` per existing convention; an
  event-name field like `event: 'advance_failed'` matches the
  `scheduler:advance_failed` shape called out in success criterion #2.
- **Atomic-commit-per-fix:** Plan A is three atomic commits in one PR (one
  per PRE-NN), not three PRs. Matches WRL's typical pre-flight cadence.
- **Production captures via API key:** the audit's "before" corpus runs as
  a normal authenticated capture batch. Use the operator-tenant's
  production API key (per `~/.secrets`); no special "audit tenant" needed.

### Integration Points
- **Coralogix:** read-only for AUDIT-02 queries (operator API key in
  `~/.secrets` as `WRL_CORALOGIX_API_KEY`). Write side already in place via
  the worker's `WRL_CORALOGIX_SEND_KEY`.
- **R2:** read-only via the existing artifacts endpoints — no direct R2
  binding access from the audit work.
- **Production worker:** capture submissions hit `api.webresourceledger.com`,
  which is the live worker. Treat the audit batch as production traffic
  (it is); volume is small but emit a tag (e.g., `metadata: {audit: "v1"}`
  or similar) only if the existing capture API supports a free-form tag —
  if not, no-op, the capture IDs alone are sufficient lineage.

</code_context>

<specifics>
## Specific Ideas

- **DACH PUR-Modell coverage:** the user explicitly called out spiegel.de
  as the canonical "consent-or-pay + paywall hybrid" the battery must
  exercise. The autoconsent click-through must still complete on these
  sites; if it doesn't, that's a real failure to record, not an excuse to
  skip the URL.
- **"Diverse" means failure-orthogonal, not topic-orthogonal.** Don't pick
  five news sites and call it diverse — pick five sites that fail in five
  different ways (one OneTrust failure, one Sourcepoint failure, one
  paywall, one bot-block, one infinite-scroll trap), even if some are news.
- **CDP spike is yes/no with code evidence.** A passing test is the "yes";
  a thrown error with the stack trace recorded in `AUDIT.md` is the "no".
  Don't expand the spike into "evaluate alternatives" — Phase 7 will choose
  the alternative if the answer is no, that's not Phase 0's call.

</specifics>

<deferred>
## Deferred Ideas

- **`@cloudflare/playwright` `^1.1.2 → ^1.3.0` upgrade.** STACK.md
  recommends it; deferred from this phase to **Phase 1 (Pipeline Harness)**
  to keep Plan A's pre-flight as pure bug fixes and to bundle the upgrade
  with the pipeline work that exercises the new CDP behavior.
- **Authenticated captures via test accounts.** Considered and rejected for
  this milestone — keeps audit scope focused on what real anonymous WRL
  callers see. Could become its own future capability if a paying customer
  asks for credentialed captures.
- **Per-tenant baseline breakout.** Not in scope; aggregate numbers are
  sufficient for fidelity work. If a future phase needs per-tenant numbers
  the queries are documented in `AUDIT.md` for re-use.
- **URL-battery refresh during the milestone.** Rejected — the battery is
  frozen for the milestone to preserve A/B comparability. A new milestone
  can rebuild it.
- **Capture-tagging for the audit batch.** Mentioned only as a "if the API
  supports it" — not a requirement. If the existing capture API has no free-
  form tag/label field, do nothing; capture IDs alone are sufficient
  lineage.

</deferred>

---

*Phase: 0-foundation*
*Context gathered: 2026-04-30*
