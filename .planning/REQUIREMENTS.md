# Requirements: WRL — Capture Quality Push

**Defined:** 2026-04-30
**Core Value:** The captured page must be a faithful representation of what a human visitor would see; every gap in fidelity undermines the evidentiary value the entire product is built on.
**Sources:** PROJECT.md, .planning/research/SUMMARY.md (post-review synthesis), GitHub issues #257 / #206 / #143 / #156 / #149 / #42, CLAUDE.md.

---

## v1 Requirements

Requirements for this milestone. Each maps to exactly one phase via the Traceability table at the bottom (filled by the roadmapper).

REQ-ID format: `[CATEGORY]-[NUMBER]`. Categories:
- **PRE** — Pre-flight cleanup (drive-by fixes before Phase 1)
- **AUDIT** — Capture-quality audit deliverables (#257 AC #1)
- **HARNESS** — `#206` pluggable-pipeline experimentation harness
- **SCRN** — `#257` Area 3: Screenshot quality / settle / timing
- **DYN** — `#257` Area 1: Dynamic content handling
- **RES** — `#257` Area 6: Render-failure resilience
- **BOT** — `#257` Area 5: Bot-protection annotation
- **CON** — `#257` Area 2: Cookie consent / overlays
- **SUB** — `#257` Area 4: WACZ subresource experiment
- **QG** — Quality gates (cross-cutting: no regression, evidence per change)

### PRE — Pre-flight Cleanup

- [ ] **PRE-01**: `buildStatusBanner` collision between `src/ui/ui-billing.js:198` and `src/ui/ui-detail.js:34` is resolved (rename the billing-side function to `billing_buildStatusBanner` per the project's prefix rule); the billing grace-period/blocked banner once again renders for tenants in those billing states.
- [ ] **PRE-02**: `src/scheduler.js:138` no longer uses `.catch(() => {})` to swallow DB write failures on threat-blocked schedule advance; on failure the error is logged via `log(env, 'error', ...)` and surfaced in observable form.
- [ ] **PRE-03**: `formatDate` duplicate name across `src/ui/ui-settings.js:22` and `src/ui/ui-submit.js:25` is resolved (one or both renamed with a view prefix per `CLAUDE.md`); no behavioral change.

### AUDIT — Capture-Quality Audit Deliverables

- [ ] **AUDIT-01**: Operator has a documented URL battery of ≥20 representative real-world URLs covering all six `#257` areas (SPA, CMP, tall page, image-heavy, bot-protected, autoconsent-known-failure, paywall, etc.); battery is committed under `.planning/audit/url-battery.md` (or equivalent) and referenced by every subsequent `#257` phase's verification step.
- [ ] **AUDIT-02**: Capture-quality audit document at `.planning/audit/AUDIT.md` reports current production baselines from Coralogix: p50 / p95 / p99 capture duration, partial-capture rate, consent detection rate (overall + per-CMP), `MAX_PAGE_HEIGHT` cap-hit rate, `MAX_SUBRESOURCES` cap-hit rate, `settleMs` distribution, `consentMs` distribution, browser-hour consumption.
- [ ] **AUDIT-03**: Audit document includes a prioritized failure-mode list — which `#257` areas are failing in production today, ranked by frequency × severity — informing per-phase scoping.
- [ ] **AUDIT-04**: A dedicated CDP-availability spike answers: does `@cloudflare/playwright` (current pinned version) expose `page.context().newCDPSession(page)` and does `Network.getResponseBody` work? Result is recorded in `AUDIT.md` with code reference. This gates `SUB-*` requirements.
- [ ] **AUDIT-05**: Audit captures a "before" sample: every URL in the battery is captured under current production code; resulting WACZs and screenshots are stored under `.planning/audit/before/` (or referenced via R2 keys in the audit doc) for use as the comparison baseline in every subsequent phase.

### HARNESS — Pluggable Pipeline Experimentation Harness (#206)

- [ ] **HARNESS-01**: A `CapturePipeline` interface is defined and documented (JSDoc or TypeScript-style signature) with at minimum `name`, `canHandle(env, input)`, `capture(env, input) → CaptureOutput`. Interface lives in `src/pipelines/types.js` (or equivalent location).
- [ ] **HARNESS-02**: The existing browser-based capture flow is refactored to implement the `CapturePipeline` interface as the `default` variant; `performCapture()` becomes a thin orchestrator (target ≤ ~50 lines) that resolves a pipeline and calls `pipeline.capture(...)`. All existing tests pass without modification.
- [ ] **HARNESS-03**: A pipeline registry exists (object map keyed by name) with a `resolvePipeline(env, input)` factory function. All call sites that need to choose a pipeline go through the factory; no direct env-var reads outside the factory.
- [ ] **HARNESS-04**: Capture-time pipeline selection is supported via at least one of: (a) request body / query param `pipeline=<name>`, (b) request header `X-WRL-Pipeline: <name>`, or (c) admin-pinned tenant config. Operator can run two captures of the same URL using different pipelines and compare results.
- [ ] **HARNESS-05**: The selected pipeline name is persisted in capture metadata (`captureSettings.pipeline` or equivalent) and visible in capture detail responses.
- [ ] **HARNESS-06**: Adding a new pipeline variant (registering a new entry in the registry) requires changes only to the registry file and the new pipeline module — no edits to `performCapture()`, `index.js` queue handler, or any cross-cutting orchestration code.
- [ ] **HARNESS-07**: An end-to-end integration test exists that registers a trivial second `noop` pipeline (returns a fixed minimal `CaptureOutput`), routes a capture through it, and asserts the result reflects the noop pipeline (proves the harness actually routes).

### SCRN — Screenshot Quality / Settle / Timing (#257 Area 3)

- [ ] **SCRN-01**: A `scrn-v2` (or similarly named) pipeline variant exists that gates screenshots on `document.fonts.ready` with a 2s timeout fallback; on timeout the screenshot proceeds and `render.fontsReady = false` is recorded.
- [ ] **SCRN-02**: The `waitForSettle` heuristic in the variant returns structured metadata `{ settleMs, settleReason, fontsReady, pendingAtCap, ignoredTypes }` instead of just a duration; the new fields appear in capture metadata.
- [ ] **SCRN-03**: `beacon` and `ping` resource types are excluded from the settle-pending count alongside the existing `websocket` and `eventsource` exclusions in the variant.
- [ ] **SCRN-04**: A `deviceScaleFactor` evaluation is documented in the audit/phase outcome with side-by-side screenshot comparisons at 2x vs 4x for ≥5 URLs of varying height; a recommended default is decided based on memory/visual-fidelity tradeoff and applied to the variant.
- [ ] **SCRN-05**: A/B comparison of the variant against the audit "before" baseline shows measurable visual fidelity improvement (font rendering correctness on ≥3 known FOIT-affected URLs) with no regression in capture duration p95 beyond the per-area perf budget.
- [ ] **SCRN-06**: After A/B evidence supports it, the variant is promoted to `default` (or an explicit decision is recorded in the phase outcome to keep both variants available).

### DYN — Dynamic Content Handling (#257 Area 1)

- [ ] **DYN-01**: A pipeline variant exists that extends `triggerLazyLoading` to handle non-`loading="lazy"` patterns: `data-src`, `data-lazy-src`, `data-original`, `data-bg`, and `srcset` placeholders.
- [ ] **DYN-02**: A wall-clock cap (≤5s) on the scroll loop is in place in the variant, independent of the existing `MAX_SCROLL_HEIGHT` height cap; cap-hit is logged and recorded in render metadata.
- [ ] **DYN-03**: SPA-hydration detection exists: variant checks for framework markers (`__NEXT_DATA__`, `__NUXT__`, `window.__REMIX_CONTEXT__`, etc.) and waits for `document.readyState === 'complete'` plus a hydration signal; result is recorded as `render.spaDetected: true|false`.
- [ ] **DYN-04**: A/B comparison against audit baseline shows reduced placeholder/broken-image bands in screenshots for ≥3 known image-heavy or SPA URLs in the battery; settle/screenshot p95 stays within perf budget.
- [ ] **DYN-05**: Variant promoted to default after evidence supports it (or explicit decision to keep both recorded).

### RES — Render-Failure Resilience (#257 Area 6)

- [ ] **RES-01**: A pipeline variant exists that classifies render failures into `{ failureClass: 'slow' | 'blocked' | 'broken' | 'limit_exceeded' }` based on observable signals (timeout + bytes received, error-page DOM markers, response status, etc.); class is recorded in render metadata.
- [ ] **RES-02**: Render metadata for partial captures includes structured stage flags: `domLoaded`, `loadFired`, `contentReceived`, plus `partialReason: string`.
- [ ] **RES-03**: Long-polling XHR/fetch detection exists in the variant: requests in-flight >10s are reclassified as long-lived and removed from the settle-pending count; reclassification count is logged.
- [ ] **RES-04**: An evaluation is documented (in the phase outcome) on whether to bundle partial WACZs with `renderQuality: 'partial'` clearly marked in `datapackage.json`; if implemented, the partial WACZ structure is documented.
- [ ] **RES-05**: A/B comparison shows the variant produces meaningfully more useful metadata for the slow/blocked/broken URLs in the battery vs. the baseline (operator can distinguish them from metadata alone, no manual screenshot inspection needed).
- [ ] **RES-06**: Variant promoted to default (or decision recorded).

### BOT — Bot-Protection Annotation (#257 Area 5)

- [ ] **BOT-01**: Bot-protection signal detection exists for at minimum: Cloudflare challenge (`#challenge-running`, `#challenge-form`, `cf-mitigated` header), Akamai (`_abck` cookie + reference-ID page), DataDome (`datadome` cookie + interstitial), PerimeterX/HUMAN (`_px*` cookies + interstitial), generic CAPTCHA (`g-recaptcha`, `h-captcha`, `cf-turnstile`).
- [ ] **BOT-02**: Detection requires ≥2 corroborating signals before flagging (e.g. cookie + DOM marker, or header + interstitial pattern); single-signal matches are recorded as low-confidence but do not flag.
- [ ] **BOT-03**: Capture metadata includes `render.botProtection: { detected: boolean, confidence: 'low'|'medium'|'high', provider: string|null, signals: string[] }`; default for non-protected captures is `{ detected: false, confidence: null, provider: null, signals: [] }`.
- [ ] **BOT-04**: No code change in this milestone modifies `User-Agent`, `navigator.webdriver`, Canvas/WebGL fingerprint, TLS fingerprint, or any other detection-evasion surface. A CI check (grep or equivalent) blocks PRs that introduce stealth-related imports (`puppeteer-extra-plugin-stealth`, `playwright-stealth`, etc.) or `navigator.webdriver`/`navigator.userAgent` overrides in `context.addInitScript()`.
- [ ] **BOT-05**: False-positive rate is empirically measured on a test set including ≥10 known-protected URLs and ≥10 known-clean URLs that contain bot-protection-adjacent strings (e.g. blog posts about Cloudflare, error-page testing tools); FP rate is documented.
- [ ] **BOT-06**: Bot-protection metadata is surfaced in the dashboard capture detail view and in the API response for `GET /v1/captures/{id}`.

### CON — Cookie Consent / Overlays (#257 Area 2)

- [ ] **CON-01**: `captureSettings.consent.result` is extended to distinguish at minimum: `success`, `noCmpDetected`, `noRejectOption` (CMP detected but only accept option available), `optOutFailed` (rejection attempted but failed), `timeout`, `dismissed`. Schema change is backward-compatible (existing captures still parse).
- [ ] **CON-02**: A pipeline variant exists ("aggressive consent") that increases the consent timeout to 3s and adds a debug log when cross-origin frame injection rejects (replacing silent `.catch(() => {})`); a parallel "safe-shot" variant uses the existing 2s timeout and behavior.
- [ ] **CON-03**: A/B comparison of the two variants on consent-banner URLs in the audit battery records the consent-detection delta and the visual delta (banner present in after-screenshot or not); operator decides which variant becomes the new default based on data.
- [ ] **CON-04**: A generic non-CMP overlay heuristic exists in metadata-only form: detect `position:fixed` elements covering >30% of viewport after consent has run; record `render.nonConsentOverlayDetected: true|false` and a brief structural fingerprint of the overlay. **No dismissal attempted** in this milestone.
- [ ] **CON-05**: A paywall annotation heuristic exists: detect common paywall indicators (`<meta name="robots" content="noindex">` plus truncated content, `.paywall-overlay`, `data-paywall`, Piano/Tinypass/Zuora DOM elements); record `render.paywallSuspected: true|false` plus signals. **No bypass attempted.**
- [ ] **CON-06**: Selected variant promoted to default after evidence supports it.

### SUB — WACZ Subresource Experiment (#257 Area 4)

- [ ] **SUB-01**: A WACZ-determinism unit test exists in `test/wacz.test.js` that builds a WACZ twice with identical inputs and asserts byte-equal output; the test must pass before any subresource-bearing WACZ is generated.
- [ ] **SUB-02**: A `subresources-on` pipeline variant exists that captures a controlled subset of subresources (CSS + web fonts + `<img>`-referenced images by default; configurable per-variant) into the WARC as proper `response` records via the chosen mechanism (CDP `Network.getResponseBody` if `AUDIT-04` confirms availability; `page.on('response')` + `response.body()` fallback otherwise).
- [ ] **SUB-03**: Per-resource and aggregate size budgets are enforced in the variant: per-resource skip if body > 2MB; aggregate skip if total bytes > existing `MAX_PAGE_BYTES`; cap-hits are logged and reflected in metadata.
- [ ] **SUB-04**: WACZs produced by the variant verify successfully via `packages/verify/` CLI; verify CLI is updated if needed to handle the new record types.
- [ ] **SUB-05**: WACZs produced by the variant load and render in ReplayWeb.page (manual smoke test on ≥3 URLs documented in phase outcome).
- [ ] **SUB-06**: The phase outcome explicitly answers the should-we question: based on audit-corpus comparison of `default` vs. `subresources-on` WACZs (size, replay fidelity, capture duration, signature integrity, evidence-grade value), the operator records a decision — promote, keep available as opt-in variant, or shelve.
- [ ] **SUB-07**: If shelved, the variant code is preserved (not deleted) and a follow-up backlog item is filed; `MAX_SUBRESOURCES` and `MAX_PAGE_BYTES` limits are documented in `OPERATIONS.md` as the current safety valves.

### QG — Quality Gates (cross-cutting)

- [ ] **QG-01**: At every variant-promotion (or area-completion) gate, before/after evidence is committed under the phase's evolution-log directory: screenshots, WACZ inspection notes, or Coralogix metric deltas. No promotion lands without evidence.
- [ ] **QG-02**: Overall capture-success rate at end of milestone is ≥ baseline measured in `AUDIT-02`. Per-phase verification asserts no regression from the immediately prior phase.
- [ ] **QG-03**: p95 capture duration at end of milestone is ≤ baseline + an explicit, documented per-phase budget that sums to no more than +2.0s overall. Each phase outcome must show p95 measurement and budget consumption.
- [ ] **QG-04**: Every phase produces `docs/evolution/NNNN-short-name/{prompt.md, decisions.md, outcome.md}` per `CLAUDE.md`; outcome includes the QG metric snapshot.
- [ ] **QG-05**: Backlog (`docs/backlog.md`) is reviewed and updated after every phase per `CLAUDE.md`; any deferred or newly-discovered items are recorded with activation triggers.
- [ ] **QG-06**: All new logging uses `log(env, severity, subsystem, data)` from `src/log.js` per project convention. No `console.*` introduced in non-exempt files. No silent `catch {}` introduced.
- [ ] **QG-07**: Any new function added to `src/ui/` is view-prefixed and grep-checked for collision before commit (per `CLAUDE.md` UI architecture rule).

---

## v2 Requirements

Tracked but deferred. May or may not become a future milestone.

### Capture pipeline

- **V2-PIPE-01**: Per-tenant pipeline selection (UI for tenants to opt into experimental variants, or admin-pinned per-tenant config).
- **V2-PIPE-02**: Pipeline marketplace / external registration (security-reviewed only; not for tenant-uploaded code).

### Capture fidelity (further iterations)

- **V2-FID-01**: Generic non-CMP overlay *dismissal* (this milestone only annotates).
- **V2-FID-02**: Custom per-site behaviors (Browsertrix-style pluggable behavior scripts).
- **V2-FID-03**: Visual stability verification (pixel-diff between two screenshots taken seconds apart).
- **V2-FID-04**: Provenance summary attachment in the WACZ (Scoop-style — system info, network info, configuration, blocklist hits).
- **V2-FID-05**: PDF snapshot attachment (Scoop-style).
- **V2-FID-06**: Promote `subresources-on` variant to default (only if `SUB-06` shelved it).
- **V2-FID-07**: Configurable viewport dimensions per-capture.

### Process / infrastructure

- **V2-PROC-01**: D1 backups + disaster-recovery strategy (#149) — activate when paying customers exist or are imminent.
- **V2-PROC-02**: `captureSettings` schema versioning (`version: N`) with explicit cutover plan — activate if external API consumers depend on the schema and the schema needs a breaking change.
- **V2-PROC-03**: Big-file refactors (`src/index.js` 2544 LOC, `src/db.js` 2131 LOC, `src/mcp.js` 1349 LOC) — activate when a real change is impeded by file size.
- **V2-PROC-04**: Admin self-revocation guard (`src/admin.js:210` TODO, #42) — activate when admin auth moves from shared `ADMIN_KEY` to per-key KV.
- **V2-PROC-05**: Legacy `CAPTURE_API_KEY` retirement — activate when `security.legacy_auth_used` Coralogix metric stays at zero for 7 days.
- **V2-PROC-06**: `screenshotVersion` field with diff-detection cutover — activate when rescan-using customers exist.

### Issue #143

- **V2-FETCH-01**: Fetch-based capture pipeline for non-HTML resources (PDF, images, JSON, XML, plain text, binary) — activation trigger from #143's own body: "Build this when a concrete use case arrives."

---

## Out of Scope

| Feature | Reason |
|---|---|
| `#143` fetch-based capture | Issue's own activation trigger says "build when a concrete use case arrives." No tenant demand exists today. The pluggable harness (HARNESS-*) makes adding a fetch variant later straightforward. |
| D1 backups + DR (#149) | Backlog gates this on "before first paying customer." None yet. |
| Per-tenant pipeline selection | `#206`'s own scope explicitly limits to per-environment / per-capture; per-tenant is later work. Per-capture (`HARNESS-04`) is sufficient for experimentation. |
| Big-file refactors (`index.js`, `db.js`, `mcp.js`) | YAGNI. None blocks this milestone. |
| Admin self-revocation guard | Pre-condition not met (admin auth still single shared `ADMIN_KEY`). |
| Legacy `CAPTURE_API_KEY` retirement | Operator-driven, gated on observed Coralogix metric. |
| Internal `@deprecated` cleanup (`setTenantTier`, `DEFAULT_TIER`, `TIER_QUOTAS`) | Test backward compat; no API surface. |
| GTM issues (#250 Chrome ext, #253 Zapier, #251 Link Rot Checker, #256 i18n) | Different milestone — capture quality first, reach later. |
| UX polish (#147 Stripe embed) | Different milestone, low priority pre-revenue. |
| Coralogix DLQ alert (#159 queue compat flag) | Operational hygiene, not blocking. |
| Multi-page / site-level crawling | Explicit out per `#257` scope. WRL captures single URLs. |
| WACZ spec compliance beyond v1.1.1 | Explicit out per `#257` scope. |
| Generic non-CMP overlay *dismissal* | This milestone annotates only (`CON-04`). Dismissal is a v2 feature. |
| Bot-protection bypass (UA changes, stealth plugins, fingerprint modification) | Explicitly forbidden — would undermine evidence-grade positioning (FRE 901(b)(9), CFAA exposure). `BOT-04` adds a CI guard. |
| Paywall bypass / circumvention | Same reasoning as bot-protection bypass. `CON-05` annotates only. |
| `screenshotVersion` field for diff-detection cutover | Per-PROJECT.md decision: no rescan-using customers exist; the diff-flood concern doesn't apply yet. |

---

## Traceability

Each v1 requirement maps to exactly one phase. Phase assignments derived from ROADMAP.md (2026-04-30).

| Requirement | Phase | Status |
|---|---|---|
| PRE-01 | Phase 0: Foundation | Pending |
| PRE-02 | Phase 0: Foundation | Pending |
| PRE-03 | Phase 0: Foundation | Pending |
| AUDIT-01 | Phase 0: Foundation | Pending |
| AUDIT-02 | Phase 0: Foundation | Pending |
| AUDIT-03 | Phase 0: Foundation | Pending |
| AUDIT-04 | Phase 0: Foundation | Pending |
| AUDIT-05 | Phase 0: Foundation | Pending |
| HARNESS-01 | Phase 1: Pipeline Harness | Pending |
| HARNESS-02 | Phase 1: Pipeline Harness | Pending |
| HARNESS-03 | Phase 1: Pipeline Harness | Pending |
| HARNESS-04 | Phase 1: Pipeline Harness | Pending |
| HARNESS-05 | Phase 1: Pipeline Harness | Pending |
| HARNESS-06 | Phase 1: Pipeline Harness | Pending |
| HARNESS-07 | Phase 1: Pipeline Harness | Pending |
| SCRN-01 | Phase 2: Screenshot & Settle | Pending |
| SCRN-02 | Phase 2: Screenshot & Settle | Pending |
| SCRN-03 | Phase 2: Screenshot & Settle | Pending |
| SCRN-04 | Phase 2: Screenshot & Settle | Pending |
| SCRN-05 | Phase 2: Screenshot & Settle | Pending |
| SCRN-06 | Phase 2: Screenshot & Settle | Pending |
| DYN-01 | Phase 3: Dynamic Content | Pending |
| DYN-02 | Phase 3: Dynamic Content | Pending |
| DYN-03 | Phase 3: Dynamic Content | Pending |
| DYN-04 | Phase 3: Dynamic Content | Pending |
| DYN-05 | Phase 3: Dynamic Content | Pending |
| RES-01 | Phase 4: Render-Failure Resilience | Pending |
| RES-02 | Phase 4: Render-Failure Resilience | Pending |
| RES-03 | Phase 4: Render-Failure Resilience | Pending |
| RES-04 | Phase 4: Render-Failure Resilience | Pending |
| RES-05 | Phase 4: Render-Failure Resilience | Pending |
| RES-06 | Phase 4: Render-Failure Resilience | Pending |
| BOT-01 | Phase 5: Bot-Protection Annotation | Pending |
| BOT-02 | Phase 5: Bot-Protection Annotation | Pending |
| BOT-03 | Phase 5: Bot-Protection Annotation | Pending |
| BOT-04 | Phase 5: Bot-Protection Annotation | Pending |
| BOT-05 | Phase 5: Bot-Protection Annotation | Pending |
| BOT-06 | Phase 5: Bot-Protection Annotation | Pending |
| CON-01 | Phase 6: Cookie Consent & Overlays | Pending |
| CON-02 | Phase 6: Cookie Consent & Overlays | Pending |
| CON-03 | Phase 6: Cookie Consent & Overlays | Pending |
| CON-04 | Phase 6: Cookie Consent & Overlays | Pending |
| CON-05 | Phase 6: Cookie Consent & Overlays | Pending |
| CON-06 | Phase 6: Cookie Consent & Overlays | Pending |
| SUB-01 | Phase 7: Subresource Experiment | Pending |
| SUB-02 | Phase 7: Subresource Experiment | Pending |
| SUB-03 | Phase 7: Subresource Experiment | Pending |
| SUB-04 | Phase 7: Subresource Experiment | Pending |
| SUB-05 | Phase 7: Subresource Experiment | Pending |
| SUB-06 | Phase 7: Subresource Experiment | Pending |
| SUB-07 | Phase 7: Subresource Experiment | Pending |
| QG-01 | Phase 2: Screenshot & Settle | Pending |
| QG-02 | Phase 7: Subresource Experiment | Pending |
| QG-03 | Phase 3: Dynamic Content | Pending |
| QG-04 | Phase 0: Foundation | Pending |
| QG-05 | Phase 0: Foundation | Pending |
| QG-06 | Phase 0: Foundation | Pending |
| QG-07 | Phase 0: Foundation | Pending |

**Coverage:**
- v1 requirements: 58 total
- Mapped to phases: 58
- Unmapped: 0 ✓

---

*Requirements defined: 2026-04-30 after research synthesis + post-review reframe (sequencing-B, #143 parked, #206 as early experimentation harness, Area 4 as should-we experiment, no rescan-customer concerns). Traceability populated: 2026-04-30 by roadmapper.*
