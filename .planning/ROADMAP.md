# Roadmap: WRL — Capture Quality Push

**Created:** 2026-04-30
**Total phases:** 8 (numbered 0–7)
**Total v1 requirements:** 58 (all mapped)
**Granularity:** standard
**Execution:** parallel where possible

---

## Phase Overview

| # | Phase | Goal | REQ-IDs | Success Criteria | Plans (rough) |
|---|---|---|---|---|---|
| 0 | Foundation | Fix known production bugs and establish capture-quality baselines | PRE-01–03, AUDIT-01–05, QG-04–07 (12) | 5 | 2 (small+medium) |
| 1 | Pipeline Harness | Ship a thin pipeline abstraction enabling per-capture variant selection | HARNESS-01–07 (7) | 3 | 3 (medium) |
| 2 | Screenshot & Settle | Gate screenshots on font readiness; return structured settle metadata | SCRN-01–06, QG-01 (7) | 4 | 3 (medium) |
| 3 | Dynamic Content | Reduce placeholder/broken-image artifacts on SPA and image-heavy sites | DYN-01–05, QG-03 (6) | 4 | 2 (medium) |
| 4 | Render-Failure Resilience | Classify render failures into actionable categories via metadata | RES-01–06 (6) | 4 | 2 (medium) |
| 5 | Bot-Protection Annotation | Detect and annotate bot-protection interference without evasion | BOT-01–06 (6) | 4 | 2 (medium) |
| 6 | Cookie Consent & Overlays | Enrich consent metadata; annotate non-CMP overlays and paywalls | CON-01–06 (6) | 4 | 2 (medium) |
| 7 | Subresource Experiment | Build a subresources-on variant; make an evidence-based ship/shelve decision | SUB-01–07, QG-02 (8) | 4 | 3 (large) |

---

## Phase Details

### Phase 0: Foundation

**Goal:** Fix three known production bugs to establish a clean measurement baseline, then audit current capture quality across all six #257 areas using production data and a representative URL battery.

**Maps to:** PRE-01, PRE-02, PRE-03, AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05, QG-04, QG-05, QG-06, QG-07

**Pre-conditions:** None

**Plans:** 2 plans

Plans:

**Wave 1**
- [ ] 00-01-PLAN.md — Pre-flight cleanup: PRE-01/02/03 atomic-commit PR + staging→prod deploy gate + evolution log 0108

**Wave 2** *(blocked on Wave 1 deploy + 24h Coralogix observation — PRE-02 logging fix must be live before audit measurement)*
- [ ] 00-02-PLAN.md — Capture-quality audit: URL battery (≥20 URLs), before corpus, Coralogix 30-day baselines, failure-mode ranking, CDP-availability spike + evolution log 0109

**Cross-cutting constraints:**
- QG-04 (evolution log per phase) and QG-05 (backlog review per phase) appear in both plans
- QG-06 (Coralogix logging discipline) demonstrated by PRE-02 in Plan A; enforced by grep on `console.warn/error` going forward
- QG-07 (UI prefix rule for `src/ui/*.js`) demonstrated by PRE-01 (`billing_*`) and PRE-03 (`submit_*`) in Plan A
- Test execution constraint: `npm test` consumes ~8 GB and may not run concurrently — Wave 2 enforces serial execution against Wave 1's targeted vitest run

**Success criteria:**
1. Billing grace-period/blocked banner renders correctly for tenants in those billing states — the `buildStatusBanner` collision is eliminated and the billing-side function responds to `usageData` as designed.
2. A scheduled capture that hits a threat-blocked URL and fails to advance the schedule logs an error in Coralogix (`scheduler:advance_failed` or equivalent) instead of silently swallowing the DB write failure.
3. Audit document at `.planning/audit/AUDIT.md` reports p50/p95/p99 capture duration and partial-capture rate from production Coralogix data, establishing the numeric baseline every subsequent phase measures against.
4. A "before" capture corpus of ≥20 URLs exists with stored WACZs and screenshots, covering SPA, CMP, tall-page, image-heavy, bot-protected, and paywall site types, available for A/B comparison in every subsequent phase.
5. CDP-availability spike has a definitive yes/no answer with code evidence, recorded in the audit document, unblocking Phase 7's approach decision for subresource capture.

**Inherited risks:**
- (HIGH) Dashboard UI global-scope collision is an active production bug — billing banner broken for grace-period/blocked tenants (CONCERNS.md §Scope Collision). Fixed by PRE-01.
- (MEDIUM) `scheduler.js:138` silent catch swallows DB write failures, causing blocked schedules to potentially re-fire every minute (CONCERNS.md §Silent Catch). Fixed by PRE-02.
- (LOW) Coralogix data access for some audit metrics (`settleMs` distribution, per-CMP consent detection rate) may require custom queries not readily available from existing dashboards (SUMMARY.md §Open Questions).

**Notes:**
- Pre-flight fixes (PRE-01–03) are three surgical commits; deploy before running the audit so baselines reflect a clean system.
- QG-04 through QG-07 are process conventions (evolution log, backlog review, logging discipline, UI prefix rule) that take effect starting with this phase and apply to every subsequent phase. They are mapped here because this is where the standard is established and first enforced.
- The CDP spike (AUDIT-04) is a focused experiment, not production code — write a test script that attempts `page.context().newCDPSession(page)` and `Network.getResponseBody` on the current `@cloudflare/playwright` version.

---

### Phase 1: Pipeline Harness

**Goal:** Ship a thin pipeline abstraction that enables per-capture variant selection, so all subsequent fidelity experiments can be developed and compared as named pipeline variants.

**Maps to:** HARNESS-01, HARNESS-02, HARNESS-03, HARNESS-04, HARNESS-05, HARNESS-06, HARNESS-07

**Pre-conditions:** Phase 0 complete (audit baselines established; existing capture flow understood from audit work)

**Estimated plans:** 3 (medium: interface + registry design; refactor extraction; integration test + routing)

**Success criteria:**
1. Operator can submit two captures of the same URL — one with `pipeline=default`, one with `pipeline=noop` — and both complete successfully with different `captureSettings.pipeline` values in the API response.
2. The full existing test suite passes without modification after the refactor — `performCapture()` is now a ≤50-line orchestrator that delegates to the resolved pipeline.
3. A developer adding a new pipeline variant creates one module file and one registry entry — no edits to `performCapture()`, `index.js` queue handler, or any cross-cutting orchestration code required.

**Inherited risks:**
- (MEDIUM) Pipeline interface may leak browser-specific assumptions (e.g., screenshot-shaped output contract instead of generic `artifacts` map). Mitigate by keeping the `CaptureOutput` shape generic from the start (SUMMARY.md §Architecture Direction).
- (MEDIUM) Test breakage during refactor of `src/capture.js` (886 LOC) — the pluggable renderer injection seam (`renderer` parameter on `performCapture()`) must be preserved through the refactor (ARCHITECTURE.md §Key Abstractions).
- (LOW) Premature generalization — resist adding lifecycle hooks, plugin events, or multi-stage pipeline composition. The interface is `name` + `canHandle` + `capture`, nothing more (SUMMARY.md §Pipeline Interface).

**Notes:**
- This is the #206 experimentation harness reframed per SUMMARY.md synthesis adjustments — it exists to enable A/B comparison of capture strategies, not to support a production multi-pipeline system.
- Selection is per-capture (request param / header), not per-environment. This is an intentional departure from the original #206 scope, driven by the owner's experimentation goals.
- Every subsequent phase (2–7) ships its fidelity work as a new pipeline variant, then promotes to default once evidence supports it.

---

### Phase 2: Screenshot & Settle

**Goal:** Gate screenshots on font readiness and refactor the settle heuristic to return structured metadata, shipped as a pipeline variant with before/after evidence.

**Maps to:** SCRN-01, SCRN-02, SCRN-03, SCRN-04, SCRN-05, SCRN-06, QG-01

**Pre-conditions:** Phase 1 complete (pipeline harness available for variant registration)

**Estimated plans:** 3 (medium: settle refactor + font gating; DPR evaluation; A/B comparison + promotion decision)

**Success criteria:**
1. Operator running the same URL through `default` and `scrn-v2` pipelines sees different `render.fontsReady` values in the capture metadata response for a URL with web fonts — `true` when fonts loaded within timeout, `false` when the 2s fallback fired.
2. Capture metadata from the `scrn-v2` variant includes `settleReason`, `fontsReady`, `pendingAtCap`, and `ignoredTypes` fields — structured settle diagnostics visible in the API response without log diving.
3. Side-by-side screenshots at 2x vs 4x DPR for ≥5 URLs of varying height are documented in the phase outcome with a recommended default and rationale based on memory/visual-fidelity tradeoff.
4. A/B comparison on ≥3 FOIT-affected URLs from the audit battery shows visually improved font rendering in the variant's screenshots, with capture duration p95 within the per-phase perf budget.

**Inherited risks:**
- (HIGH) DPR change from 4x→2x (if recommended) reduces pixel density — must demonstrate evidence-grade visual fidelity is preserved at 2x. Tall pages at 4x approach CF's 128MB Worker memory limit (SUMMARY.md §Stack Decisions).
- (MEDIUM) Font CDN unreachability could cause `document.fonts.ready` to hang indefinitely without the timeout wrapper — Playwright issues #28995, #35972 document this pattern (SUMMARY.md §Architecture Direction).
- (LOW) `beacon` and `ping` exclusion from settle-pending count changes settle timing subtly — monitor for settle regressions on beacon-heavy analytics pages.

**Notes:**
- QG-01 (before/after evidence at promotion gates) is mapped here because this is the first phase that produces a variant and faces a promotion decision. The evidence discipline established here carries forward to all subsequent phases.
- The settle heuristic refactor is the foundation that Phases 3, 4, and 7 build on — improved settle makes dynamic-content handling, failure resilience, and subresource timing more reliable.
- `screenshotVersion` field was originally proposed but dissolved in SUMMARY.md synthesis adjustments — no rescan customers exist, so diff-detection breakage is not a concern.

---

### Phase 3: Dynamic Content

**Goal:** Reduce broken-image and placeholder artifacts in captures of SPA and image-heavy sites by extending lazy-load triggers and adding SPA-hydration detection, shipped as a pipeline variant.

**Maps to:** DYN-01, DYN-02, DYN-03, DYN-04, DYN-05, QG-03

**Pre-conditions:** Phase 2 complete (improved settle heuristic provides the foundation for scroll/lazy-load timing)

**Estimated plans:** 2 (medium: lazy-load extension + SPA detection + scroll cap; A/B comparison + promotion decision)

**Success criteria:**
1. A known image-heavy URL from the audit battery captured with the variant shows fewer placeholder/broken-image bands in the screenshot compared to the `default` baseline — visual improvement documented with side-by-side evidence.
2. An SPA URL (Next.js, Nuxt, or Remix) captured with the variant includes `render.spaDetected: true` in the API response metadata, confirming the framework marker detection is operational.
3. The scroll loop terminates within the ≤5s wall-clock cap even on infinite-scroll pages, and `render.scrollCapHit: true` (or equivalent) appears in capture metadata when the cap fires.
4. p95 capture duration for the variant stays within the per-phase perf budget — budget consumption is documented in the phase outcome with cumulative running total against the +2.0s overall limit.

**Inherited risks:**
- (HIGH) Performance budget — the scroll loop and extended lazy-load triggers add latency. The ≤5s wall-clock cap exists specifically to bound this, but the default case (non-infinite pages) must not regress (PITFALLS §Performance Budget).
- (MEDIUM) Lazy-load patterns beyond `loading="lazy"` (data-src, data-bg, srcset placeholders) may trigger re-renders that delay settle — monitor settle duration delta carefully.
- (LOW) SPA framework detection via global markers (`__NEXT_DATA__`, `__NUXT__`, etc.) may produce false negatives for custom SSR frameworks or false positives for pre-rendered static exports.

**Notes:**
- QG-03 (p95 capture duration ≤ baseline + budget) is mapped here because this is the first phase that adds non-trivial processing time (scroll loop, extended lazy-load triggers). The budget accounting framework established here carries forward.
- The scroll loop's wall-clock cap (DYN-02) is independent of `MAX_SCROLL_HEIGHT` — both caps are active; whichever fires first terminates the loop.

---

### Phase 4: Render-Failure Resilience

**Goal:** Classify render failures into actionable categories so operators can distinguish slow sites from blocked or broken ones using capture metadata alone, without inspecting screenshots.

**Maps to:** RES-01, RES-02, RES-03, RES-04, RES-05, RES-06

**Pre-conditions:** Phase 2 complete (settle heuristic improvements provide better pending-request classification for the long-polling detection in RES-03)

**Estimated plans:** 2 (medium: failure classification + partial metadata + long-polling detection; A/B comparison + partial-WACZ evaluation)

**Success criteria:**
1. A capture of a URL that times out due to server slowness includes `render.failureClass: 'slow'` in metadata; a bot-challenge URL produces `'blocked'`; a site returning an error page produces `'broken'` — three distinct failure modes, three distinct metadata values.
2. Partial captures include `domLoaded`, `loadFired`, and `contentReceived` boolean stage flags in render metadata, enabling an operator to see exactly which loading stages completed before the capture deadline fired.
3. Long-polling XHR requests (in-flight >10s) are reclassified as long-lived and removed from the settle-pending count in the variant — a known long-polling URL settles within normal timeframe instead of timing out.
4. Operator can distinguish slow/blocked/broken failure modes from the `GET /v1/captures/{id}` API response alone, without inspecting the screenshot — verified on ≥3 distinct failure-mode URLs from the audit battery.

**Inherited risks:**
- (HIGH) Partial-capture rate may mask systematic failures if tracked only as a success sub-category. Must track as a distinct Coralogix metric, separate from success/failure, with alert threshold if >15% (PITFALLS §Partial Capture Rate).
- (MEDIUM) "Slow vs blocked" distinction relies on heuristic signal quality — e.g., a slow bot-challenge page could be classified as 'slow' instead of 'blocked'. The ≥2-signal corroboration rule from Phase 5 (BOT) can refine this retroactively.
- (LOW) RES-04 (partial WACZ evaluation) is a design decision, not an implementation commitment — the phase outcome documents the recommendation but may defer implementation to a future milestone.

**Notes:**
- This phase enriches the render metadata model that Phase 5 (BOT) builds on — failure classification and bot-protection annotation are complementary signals.
- The current partial-capture strategy is a 2s deadline after 20s navigation timeout (ARCHITECTURE.md). This phase doesn't necessarily change those timeouts — it enriches what's recorded when they fire.

---

### Phase 5: Bot-Protection Annotation

**Goal:** Detect and annotate bot-protection interference in capture metadata using multi-signal heuristics, without modifying any detection-evasion surface.

**Maps to:** BOT-01, BOT-02, BOT-03, BOT-04, BOT-05, BOT-06

**Pre-conditions:** Phase 1 complete (pipeline harness for variant registration). Phase 4 recommended but not strictly required — failure classification provides richer context for bot-protection correlation.

**Estimated plans:** 2 (medium: signal detection + CI guard + multi-signal logic; dashboard surfacing + false-positive evaluation)

**Success criteria:**
1. A capture of a Cloudflare-challenged URL includes `render.botProtection: { detected: true, confidence: 'high', provider: 'cloudflare', signals: [...] }` in the API response metadata.
2. A capture of a clean blog post *about* Cloudflare bot protection does NOT trigger a false positive — `render.botProtection.detected` remains `false` despite the page containing bot-protection-adjacent strings.
3. The CI stealth-import guard blocks a test PR that introduces `puppeteer-extra-plugin-stealth` or `navigator.webdriver`/`navigator.userAgent` overrides in `context.addInitScript()` — the bright line is enforced in CI, not just documented.
4. False-positive rate is documented on a test set of ≥10 known-protected URLs and ≥10 known-clean URLs that contain bot-protection-related content; the rate and methodology appear in the phase outcome.

**Inherited risks:**
- (MEDIUM) Perverse incentive — once bot-protection detection exists, the natural next request is "can we bypass it?" The CI guard (BOT-04) and the locked PROJECT.md decision (annotation only, never bypass) are the structural guardrails (PITFALLS §Perverse Incentive, PROJECT.md §Key Decisions).
- (MEDIUM) False-positive rate with ≥2-signal corroboration is designed to be low, but novel bot-protection implementations (not in the known provider list) will produce false negatives. This is acceptable — the detection list is extensible (SUMMARY.md §Stack Decisions).
- (LOW) `render.botProtection` metadata adds fields to the API response — existing API consumers must tolerate additive schema changes (backward-compatible per CON-01's precedent).

**Notes:**
- This is primarily metadata enrichment — minimal pipeline execution impact compared to Phases 2–4.
- Bot-protection metadata surfacing in the dashboard (BOT-06) requires UI changes in `src/ui/ui-detail.js`. Apply the QG-07 UI prefix convention — grep all `src/ui/*.js` for any new function name before adding.
- No code in this milestone modifies `User-Agent`, `navigator.webdriver`, Canvas/WebGL fingerprint, TLS fingerprint, or any other detection-evasion surface. This is a hard constraint, not a guideline.

---

### Phase 6: Cookie Consent & Overlays

**Goal:** Enrich consent metadata to distinguish failure modes (no CMP, no reject option, opt-out failed, timeout) and annotate non-CMP overlays and paywalls — annotation only, no dismissal or bypass.

**Maps to:** CON-01, CON-02, CON-03, CON-04, CON-05, CON-06

**Pre-conditions:** Phase 1 complete (pipeline harness for variant registration). Independent of Phases 3–5 — consent flow operates on its own timeline separate from settle/scroll/render.

**Estimated plans:** 2 (medium: consent enrichment + safe-shot vs aggressive variants; overlay/paywall annotation + A/B comparison)

**Success criteria:**
1. A capture of a URL with a CMP that offers only an "Accept" button includes `consent.result: 'noRejectOption'` in the API response, distinct from `'noCmpDetected'`, `'success'`, `'optOutFailed'`, and `'timeout'` — five distinct consent outcomes in the schema.
2. A/B comparison of "safe-shot" (2s timeout) vs "aggressive consent" (3s timeout) variants on consent-banner URLs from the audit battery documents the consent-detection delta and visual delta (banner present in after-screenshot or not) with evidence committed in the evolution log.
3. A URL with a `position:fixed` newsletter popup covering >30% of the viewport after consent has run triggers `render.nonConsentOverlayDetected: true` in capture metadata.
4. A paywalled URL triggers `render.paywallSuspected: true` with specific signals (e.g., `Piano`, `paywall-overlay`, truncated content) listed in the metadata.

**Inherited risks:**
- (MEDIUM) Cross-origin iframe injection in `src/consent.js` has 5 silent `.catch(() => {})` handlers — the aggressive-consent variant (CON-02) replaces these with debug logging, which may surface currently-hidden failures at higher volume than expected (CONCERNS.md §Silent Catch).
- (MEDIUM) Autoconsent rule-format drift during the milestone window could break consent detection. The auto-update pipeline (Phase 0088) tracks upstream, but format changes (not just version bumps) would require reconciliation (SUMMARY.md §Open Questions).
- (LOW) The 2s→3s consent timeout increase (CON-02 aggressive variant) adds up to 1s to captures with CMPs — within the per-phase perf budget but must be measured and documented.

**Notes:**
- This phase is independent of Phases 3–5 and can run in parallel with Phase 3 (DYN) after Phase 2.
- Non-CMP overlay detection (CON-04) and paywall annotation (CON-05) are metadata-only — **no dismissal or bypass is attempted** in this milestone. Dismissal is deferred to V2-FID-01.
- Consent schema changes (CON-01) must be backward-compatible — existing captures with the old `consent.result` values must continue to parse correctly.

---

### Phase 7: Subresource Experiment

**Goal:** Build a `subresources-on` pipeline variant that captures CSS, fonts, and images into the WARC, evaluate replay fidelity and cost, and make an explicit evidence-based decision to promote, keep as opt-in, or shelve.

**Maps to:** SUB-01, SUB-02, SUB-03, SUB-04, SUB-05, SUB-06, SUB-07, QG-02

**Pre-conditions:** All prior fidelity phases (2–6) complete — the browser pipeline should have reached its final shape before adding subresource capture. AUDIT-04 (CDP availability) answered in Phase 0 — determines whether SUB-02 uses CDP `Network.getResponseBody` or falls back to `page.on('response')` + `response.body()`.

**Estimated plans:** 3 (large: WACZ determinism test + subresource capture mechanism; WARC/WACZ integration + verification; evaluation against audit corpus + ship/shelve decision)

**Success criteria:**
1. WACZ determinism test passes: building a WACZ twice with identical inputs produces byte-equal output — the fflate `zipSync` numeric-key ordering concern is confirmed resolved or mitigated.
2. A WACZ generated by the `subresources-on` variant successfully loads and renders in ReplayWeb.page, showing CSS styling, web fonts, and images that the `default`-pipeline WACZ cannot display in offline replay.
3. WACZs produced by the variant verify successfully via `packages/verify/` CLI — verification passes without modification to the CLI, or with minimal, documented updates to handle new WARC record types.
4. The phase outcome contains an explicit ship/shelve decision with quantified comparison data: WACZ size delta, capture duration delta, replay fidelity assessment, and signature-integrity confirmation across ≥5 URLs from the audit battery.

**Inherited risks:**
- (CRITICAL) fflate `zipSync` produces non-deterministic output for numeric-looking keys — the determinism unit test (SUB-01) is a hard pre-condition; no subresource WACZ generation begins until this test passes (PITFALLS §fflate Determinism).
- (HIGH) CDP availability unknown until AUDIT-04 resolves. If `@cloudflare/playwright` does not expose `page.context().newCDPSession(page)`, the fallback (`page.on('response')` + `response.body()`) re-fetches from cache rather than intercepting the original stream — still viable but different integrity properties (SUMMARY.md §CDP Availability).
- (HIGH) Memory budget pressure — subresource capture adds per-response body buffering on top of existing page rendering. Per-resource (2MB) and aggregate (`MAX_PAGE_BYTES`) caps exist as safety valves but must be validated against the audit corpus (SUMMARY.md §Pitfalls).
- (MEDIUM) Evidence-grade vs archive-grade value of offline replay is genuinely unresolved — the audit should have gathered signal but the answer may be "not needed for current customers." The ship/shelve decision (SUB-06) must be honest about this (SUMMARY.md §Open Questions, FEATURES.md).

**Notes:**
- QG-02 (overall capture-success rate ≥ baseline) is mapped here as the final cumulative gate — at the end of the last phase, the complete milestone's impact on success rate is validated.
- SUB-07 ensures that even if the experiment is shelved, the variant code is preserved and a backlog item is filed — the work is not wasted, just deferred.
- The `subresources-on` variant extends `src/warc.js` (200 LOC, no dependencies, Workers-compatible) — do NOT adopt `warcio.js` or `js-wacz` per SUMMARY.md stack decision.
- The CDXJ index (`src/cdxj.js`) may need expansion to index subresource records — evaluate during implementation.

---

## Coverage Validation

| Category | Total REQ-IDs | Mapped to phase(s) |
|---|---|---|
| PRE | 3 | Phase 0 |
| AUDIT | 5 | Phase 0 |
| HARNESS | 7 | Phase 1 |
| SCRN | 6 | Phase 2 |
| DYN | 5 | Phase 3 |
| RES | 6 | Phase 4 |
| BOT | 6 | Phase 5 |
| CON | 6 | Phase 6 |
| SUB | 7 | Phase 7 |
| QG | 7 | Phase 0 (QG-04–07), Phase 2 (QG-01), Phase 3 (QG-03), Phase 7 (QG-02) |

**Unmapped:** 0 (validated)

---

## Parallelization Notes

### Strict Sequential Chain

```
Phase 0 (Foundation) → Phase 1 (Pipeline Harness) → Phase 2 (Screenshot & Settle)
```

These three phases form the critical path. Every subsequent phase depends on the pipeline harness (Phase 1), and Phases 3–4 depend on the settle heuristic improvements from Phase 2.

### Parallel Opportunities After Phase 2

```
                    ┌─── Phase 3 (Dynamic Content) ──────┐
Phase 2 ───────────┤                                      ├──► Phase 4 (Render-Failure) ──► Phase 5 (Bot Annotation)
                    └─── Phase 6 (Consent & Overlays) ───┘
```

- **Phase 3 ∥ Phase 6**: Can run in parallel. DYN (scroll/lazy-load) and CON (consent timeout/overlay detection) operate on independent code paths and metadata fields. No merge-conflict risk — DYN touches `triggerLazyLoading`/`waitForSettle`; CON touches `consent.js` and overlay detection.
- **Phase 4 after Phase 3**: RES builds on Phase 2's settle refactor and benefits from Phase 3's scroll-cap and lazy-load improvements being stable before classifying failures.
- **Phase 5 after Phase 4** (soft): BOT benefits from RES's `failureClass` metadata for correlation but does not strictly require it. Could start after Phase 2 if schedule pressure demands it, at the cost of less-informed bot/failure correlation.

### Strict Final Phase

```
Phase 7 (Subresource Experiment) — runs after Phases 2–6 are all complete
```

Phase 7 must be last: subresource capture interacts with settle timing, consent flow, and render-failure handling. All fidelity improvements should be stable before adding WARC subresource complexity.

### Effective Critical Path

Without parallelization: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 (8 phases serial)

With parallelization: 0 → 1 → 2 → (3 ∥ 6) → 4 → 5 → 7 (**7 phases on critical path**, Phase 6 absorbs into Phase 3's wall time)

---

*Roadmap created: 2026-04-30. Derived from PROJECT.md, REQUIREMENTS.md, SUMMARY.md (post-review synthesis), ARCHITECTURE.md, CONCERNS.md.*
