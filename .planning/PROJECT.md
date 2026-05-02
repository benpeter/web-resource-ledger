# Web Resource Ledger — Capture Quality Push

## What This Is

Web Resource Ledger (WRL) is an evidence-grade web capture service: it
takes a URL, captures the page in a Cloudflare-rendered browser, bundles
the result into a WACZ archive, signs it with Ed25519, and timestamps it
with an RFC 3161 TSA. Customers — legal, compliance, brand-protection,
and journalism teams — get a cryptographic, court-defensible record that
a specific URL returned specific content at a specific moment.

This milestone is **not** building WRL from scratch. WRL is a mature
brownfield product (Acts 1–3 shipped: foundation, evidence-grade
signing/timestamps, multi-tenant infrastructure). This milestone — the
**Capture Quality Push** — deepens the product's core moat: the fidelity
of the capture itself.

## Core Value

The captured page must be a faithful representation of what a human
visitor would see. Every gap in fidelity — a missing lazy-loaded image,
a cookie banner obscuring content, a render that fails silently —
undermines the evidentiary value the entire product is built on.

## Requirements

### Validated

Existing shipped capabilities (inferred from `.planning/codebase/`,
locked by the codebase itself; full inventory in `STACK.md`,
`ARCHITECTURE.md`, `INTEGRATIONS.md`):

- ✓ Browser-based capture via Cloudflare Browser Rendering + Playwright — existing
- ✓ WACZ archive bundling per spec v1.1.1 — existing
- ✓ Ed25519 signing of captures with key versioning + `/.well-known/signing-keys` — existing
- ✓ RFC 3161 qualified timestamps via Sectigo TSA — existing
- ✓ Multi-tenant per-tenant API keys with KV-backed lookup + rotation — existing
- ✓ GitHub OAuth self-serve signup with dual-auth (session + API key) — existing
- ✓ Web dashboard (vanilla JS, single-script concatenation) — existing
- ✓ MCP server with 11 tools over Streamable HTTP transport — existing
- ✓ Cloudflare Queue-based capture pipeline with retries + DLQ — existing
- ✓ Stripe usage-based billing with invoice cache — existing
- ✓ Email notifications with per-event preferences (Resend) — existing
- ✓ Threat-checked URL submission with autoconsent CMP dismissal — existing
- ✓ Audit logging + Coralogix observability — existing
- ✓ Per-tenant rate limiting (CF + KV + IP guard) — existing
- ✓ Webhooks for capture events with HMAC signing — existing
- ✓ Diff and rescan flows — existing
- ✓ Scheduled captures — existing
- ✓ FRE 902(13) certificate generation — existing
- ✓ Forward-only D1 migrations (0001–0017) — existing

### Active

This milestone's scope. Sequencing-B (value-first):

**Pre-flight cleanup** (drive-by, before Phase 1):
- [ ] Fix `buildStatusBanner` collision between `src/ui/ui-billing.js:198` and `src/ui/ui-detail.js:34` (active production bug — billing grace-period/blocked banner is silently replaced by detail's "Status: Pending")
- [ ] Fix `scheduler.js:138` `.catch(() => {})` swallowing DB write failures on threat-blocked schedule advance
- [ ] Resolve `formatDate` duplicate name across `src/ui/ui-settings.js:22` and `src/ui/ui-submit.js:25` (prefix-rule violation per `CLAUDE.md`)

**Audit deliverable:**
- [ ] Capture-quality audit: URL battery against diverse sites (news, SPA, JS-heavy, overlays) plus Coralogix-driven failure-mode analysis, output is a prioritized fix list with evidence

**Issue #257 — six-area fidelity push** (each area ships at least one improvement with before/after evidence):
- [ ] Area 1 — Dynamic content handling (SPA / client-rendered pages, lazy-load patterns beyond `loading="lazy"`, infinite-scroll cap, web fonts / FOIT-FOUT in screenshots)
- [ ] Area 2 — Cookie consent and overlay dismissal (autoconsent timeout/failure cases, non-standard CMPs, paywalls, newsletter popups; enriched consent metadata distinguishing "no CMP" / "no reject option" / "opt-out failed", builds on #156)
- [ ] Area 3 — Screenshot quality and timing (settle heuristic for heavy-JS sites, font-load gating, evaluate `deviceScaleFactor: 4` and `MAX_PAGE_HEIGHT: 8000` defaults across site types)
- [ ] Area 4 — WACZ subresource capture completeness (currently only HTML + screenshots; evaluate including key subresources for offline replay; revisit `MAX_SUBRESOURCES: 500` and `MAX_PAGE_BYTES: 50MB`)
- [ ] Area 5 — Bot-protection and anti-headless annotation (extend `detectRenderFailure()` to flag captures where bot protection may have affected content — metadata enrichment only, NOT bypass)
- [ ] Area 6 — Render-failure resilience (better partial-capture strategy beyond the current 2s deadline after 20s nav timeout; capture-metadata distinction between "site is slow" / "site blocked us" / "site is broken"; improve `waitForSettle` heuristic for long-lived connections)

**Issue #206 — pluggable capture pipeline architecture:**
- [ ] Define pipeline interface/contract (input: URL + options; output: WACZ + metadata + status)
- [ ] Refactor existing browser pipeline (now improved per #257 areas above) to implement that interface
- [ ] Pipeline selection configurable per-environment (wrangler.toml / env var)
- [ ] Adding a future pipeline must require no changes to core orchestration code

**Quality gates (per #257 acceptance criteria):**
- [ ] No regression in overall capture success rate
- [ ] No regression in p95 capture duration
- [ ] Each improvement carries before/after evidence (screenshots, WACZ inspection, Coralogix metrics)
- [ ] Capture metadata (`captureSettings`, `render` object) reflects new quality signals

### Out of Scope

- **Issue #143 (fetch-based capture for non-HTML resources)** — parked. The issue's own activation trigger states "Build this when a concrete use case arrives. Don't build speculatively." No tenant-facing demand exists today. Revisit when a tenant requests PDF / API / image capture.
- **D1 backups + disaster recovery (#149)** — backlog calls this `[consider]: Before first paying customer`. No paying customers yet → defer. Re-evaluate when revenue is imminent.
- **Per-tenant pipeline selection** — `#206`'s own scope deliberately limits this milestone to per-environment selection. Per-tenant is explicitly later work.
- **Big-file refactors** (`src/index.js` 2544 lines, `src/db.js` 2131 lines, `src/mcp.js` 1349 lines) — YAGNI. None of these block the planned changes. Refactor when a real change is impeded, not preemptively.
- **Admin self-revocation guard (`src/admin.js:210` TODO)** — pre-condition not yet met. Admin is currently a single shared `ADMIN_KEY`; the guard has nothing to guard until admin scope moves to per-key KV.
- **Legacy `CAPTURE_API_KEY` retirement** — operator-driven and gated on `security.legacy_auth_used` Coralogix metric reaching zero for 7 days. Cannot be forced from a code change.
- **Internal-only `@deprecated` cleanup** (`setTenantTier`, `DEFAULT_TIER`, `TIER_QUOTAS`) — kept for test backward compat. No API surface, no urgency.
- **GTM / distribution issues** (#250 Chrome extension, #253 Zapier/n8n/Make, #251 Link Rot Checker, #256 i18n) — different milestone. Capture quality first, reach later.
- **UX polish (#147 Stripe embed)** — different milestone, low priority pre-revenue.
- **Coralogix DLQ alert (#159 queue compat flag)** — operational hygiene, not blocking.
- **Multi-page / site-level crawling** — explicitly out per `#257` scope. WRL captures single URLs.
- **WACZ spec compliance beyond v1.1.1** — out per `#257` scope.

## Context

**Project posture:**
- Brownfield. Codebase fully mapped at `.planning/codebase/` (2026-04-30): `STACK.md`, `INTEGRATIONS.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `CONCERNS.md`.
- Acts 1 (Foundation), 2 (Evidence-Grade), 3 (Infrastructure) all shipped per `docs/backlog.md`.
- Current active surface is Acts 4–6 (self-serve onboarding, monetization, GTM/polish). This milestone bypasses that progression to deepen the product moat first.
- Pre-revenue. No paying customers yet, but Stripe billing fully shipped and ready (Phase 0107: Stripe-authoritative billing).
- ~107 evolution phases shipped, documented under `docs/evolution/`. Every phase here will follow the same documentation discipline (mandated by `CLAUDE.md`).

**Engineering culture:**
- Helix manifesto applies: YAGNI, KISS, lean & mean, latency budget (<300ms uncached), vanilla over framework.
- All error/warning logging via `log(env, severity, subsystem, data)` from `src/log.js`. Never `console.*` in production code (limited documented exceptions).
- "Fail loudly, degrade intentionally" — no silent catches, distinguish service-unavailable from misconfigured.
- "Test the real boundaries" — integration tests must exercise real browser/network/third-party services, not mocks.
- `src/ui/` files share global JS scope (concatenated by `src/ui/ui-shell.js`); name prefixing is mandatory. The active `buildStatusBanner` bug we're fixing pre-flight is a direct consequence of violating this rule.

**Capture pipeline current state (the substrate this milestone improves):**
- Cloudflare Browser Rendering binding via `@cloudflare/playwright`.
- Adaptive settle heuristic, scroll for lazy-loaded images, autoconsent CMP dismissal (2s timeout).
- Dual screenshots (pre- and post-consent), partial-capture fallback after 20s nav timeout + 2s deadline.
- WACZ bundling, R2 storage, KV/D1 status tracking.
- Caps: `MAX_PAGE_HEIGHT: 8000`, `deviceScaleFactor: 4`, `MAX_SUBRESOURCES: 500`, `MAX_PAGE_BYTES: 50MB`.
- Subresources (CSS/JS/images) currently NOT bundled into WARC — only HTML + screenshots are persisted.

**Reference issues / threads (not all in scope this milestone):**
- `#257` — Improve capture quality and fidelity (umbrella for areas 1–6 above)
- `#206` — Design architecture for pluggable capture pipelines
- `#143` — R42: Fetch-based capture for non-HTML web resources (parked)
- `#156` — Investigate paywall and accept-only CMP handling (consent subset; informs Area 2)
- `#159` — Queue consumer performance (operational, separate)
- `#149` — Disaster recovery + D1 backups (deferred until paying customers)
- `#42` — Self-revocation guard (deferred until admin auth moves to per-key)

## Constraints

- **Tech stack**: Must run on Cloudflare Workers. No Node.js-only dependencies. JavaScript preferred over TypeScript per project convention.
- **Performance**: No regression in p95 capture duration. No regression in capture success rate. Both monitored via Coralogix.
- **Compatibility**: WACZ output must remain spec-compliant (v1.1.1) and verifiable by existing `packages/verify/` CLI without changes.
- **Security**: No bypass of bot-protection mechanisms. Annotation only — captures must remain honest about what was retrieved.
- **Architecture (#206)**: Pipeline selection mechanism must allow future addition of pipelines with zero changes to core capture orchestration.
- **Process**: Every phase must produce an evolution log entry under `docs/evolution/NNNN-short-name/` with `prompt.md`, `decisions.md`, `outcome.md`, and (when produced via nefario orchestration) `process.md`. Backlog must be reviewed and updated after each phase.
- **Logging discipline**: All new logging via `log(env, severity, subsystem, data)`. No `console.*` in non-exempt files. No silent catches.
- **UI discipline**: Any new function in `src/ui/` must be view-prefixed (`detail_*`, `submit_*`, etc.) and grep-checked for collisions before adding.

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Sequencing-B: value-first (`#257` curated → `#206` → `#143` parked) | Capture quality is product moat; deliver visible fidelity wins before architectural refactor. Pluggable pipeline abstraction is better-informed by the quality push than vice-versa. | - Pending |
| Park `#143` (fetch-based capture) | The issue's own activation trigger says "build when a concrete use case arrives." No tenant demand today. | - Pending |
| Audit step IS in scope (Phase 1 of #257 work) | `#257` AC explicitly requires it. Without an audit, area-prioritization within #257 is intuition rather than evidence. Coralogix data + targeted URL battery feeds the rest of the milestone. | - Pending |
| All six `#257` areas in scope (not a subset) | User wants the full umbrella delivered. AC requires "at least one improvement per area" — six areas, six+ improvements. | - Pending |
| Pre-flight cleanup IS in scope (3 surgical commits before Phase 1) | `buildStatusBanner` is an active production bug; `scheduler.js:138` is a real ops risk; `formatDate` is a CLAUDE.md rule violation. ~45 min total — no reason to defer. | - Pending |
| Defer DR / D1 backups | Backlog gates this on "before first paying customer." No paying customers exist yet. | - Pending |
| Defer big-file refactors (`index.js`, `db.js`, `mcp.js`) | YAGNI. None blocks this milestone. Refactor when a real change is impeded. | - Pending |
| `#206` scope = per-environment pipeline selection (not per-tenant) | `#206`'s own scope deliberately limits this. Per-tenant is later work. | - Pending |
| Bot protection (`#257` Area 5) = annotate only, not bypass | Honesty over coverage. Bypass would create legal/ToS exposure inconsistent with evidence-grade positioning. | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-30 after initialization (Capture Quality Push milestone)*
