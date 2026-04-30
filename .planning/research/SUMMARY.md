# Research Summary — Capture Quality Push

**Synthesized:** 2026-04-30
**Source documents:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

## TL;DR

Research confirmed the milestone's shape: all six #257 areas are justified, the audit-first approach is essential, and #206 should follow #257. The most significant finding is that **subresource capture (Area 4) depends on a gating unknown** — whether `@cloudflare/playwright` exposes CDP `Network.getResponseBody` — which must be verified before committing to that area's approach. Screenshot parameter changes (Area 3) carry a hidden blast radius: any change to DPR or timing invalidates all prior diff baselines, requiring a versioned cutover plan rather than a simple config tweak. The recommended build order is settle→dynamic→resilience→bot-annotation→consent→subresources→pipeline, with a determinism unit test and `captureSettings` schema versioning landing as pre-conditions before the main work begins.

## Recommended Stack Decisions (from STACK.md)

- **Decision:** Extend `src/warc.js` for subresource WARC records — do NOT adopt `warcio.js` or `js-wacz`
  - **Rationale:** WRL's custom builder is 200 lines, no dependencies, already Workers-compatible. `warcio.js` adds 1MB bundle for unused features; `js-wacz` is Node-only.
  - **Confidence:** HIGH
  - **Roadmap impact:** Implementation-detail — no phase shape change, just validates the approach for Area 4.

- **Decision:** CDP `Network.getResponseBody` for subresource capture (not Playwright `route.fetch()`)
  - **Rationale:** Less invasive than CDP Fetch domain, doesn't add per-request latency. `route.fetch()` re-fetches rather than intercepting the original response. But `newCDPSession()` availability on CF's fork is unconfirmed.
  - **Confidence:** MEDIUM — gated on CF Playwright verification
  - **Roadmap impact:** **Risk** — if CDP is unavailable, Area 4 falls back to `page.on('response')` + `response.body()` or must be descoped. Must verify before Area 4 phase starts.

- **Decision:** Default `deviceScaleFactor` to `2` (down from current `4`)
  - **Rationale:** 4x produces 16x pixel count; a tall page at 4x approaches CF's 128MB Worker memory limit. 2x is standard retina — readable and evidence-grade without print-quality overhead. Override option preserved.
  - **Confidence:** HIGH
  - **Roadmap impact:** Phase-shaping — this change triggers diff-detection breakage (per PITFALLS.md) and requires a `screenshotVersion` cutover plan in Area 3.

- **Decision:** Upgrade `@duckduckgo/autoconsent` from `14.66.0` to `14.72.0`
  - **Rationale:** +6 minor versions of CMP rulesets. Actively maintained. Low-risk semver-minor upgrade via existing vendor script.
  - **Confidence:** HIGH
  - **Roadmap impact:** Implementation-detail for Area 2.

- **Decision:** Upgrade `@cloudflare/playwright` from `^1.1.2` to `^1.3.0`
  - **Rationale:** v1.3.0 replaced chunked CDP with plain CDP. May fix edge-case issues and is prerequisite context for Area 4 CDP work. Low-risk semver-minor.
  - **Confidence:** HIGH
  - **Roadmap impact:** Implementation-detail, but should land in pre-flight or early phase.

- **Decision:** Bot-protection detection via multi-signal DOM/header checks, annotation-only
  - **Rationale:** Specific selectors (CF `#challenge-running`, Akamai `_abck` cookie, CAPTCHA class names) have low false-positive rates individually; require ≥2 signals before flagging. Never modify capture behavior based on detection.
  - **Confidence:** MEDIUM — false-positive rate needs empirical validation during audit
  - **Roadmap impact:** Implementation-detail for Area 5, but perverse-incentive pitfall is a process risk (see Pitfalls section).

- **Decision:** Pipeline interface = `{ name, canHandle(env, input), capture(env, input) → CaptureOutput }`
  - **Rationale:** Simplest shape that satisfies #206. No lifecycle hooks, no plugin registry. One function per pipeline. ArchiveBox's hook system and Browsertrix's recorder pattern are both too heavyweight for Workers.
  - **Confidence:** HIGH
  - **Roadmap impact:** Phase-shaping — interface design is informed by #257 changes, so #206 must come after #257.

## Feature Posture (from FEATURES.md)

**WRL already leads in:**
- Consent metadata granularity (`captureSettings.consent` with library, version, action, result, CMP detected) — no peer ships this level of detail
- Dual screenshot flow (before/after consent) — unique to WRL
- Multi-frame CMP injection (up to 50 cross-origin iframes)
- High-DPI screenshots at 4x scale (peers default to 1x–2x)
- Graceful degradation with partial capture + dead-letter queue

**WRL is missing table-stakes for replay-capable archives:**
- **No subresource WARC records** — CSS, JS, images, fonts are not persisted. Offline replay impossible. Browsertrix, Scoop, and ArchiveWeb.page all capture these. However, FEATURES.md raises a legitimate open question: does evidence-grade capture actually *need* offline replay, or is the signed screenshot + rendered HTML sufficient? The audit should gather customer signal on this.

**Differentiator opportunities worth pursuing (per FEATURES.md priority):**
1. **Bot-protection annotation** — no peer ships this; high evidence-grade leverage
2. **Enriched consent metadata** — extend existing lead (TCF string, no-reject-option status)
3. **Font-load gating** — one-line addition, visible quality improvement, no peer does it
4. **Provenance summary attachment** — matches Scoop's provenance summary; strengthens FRE 902(13) authentication

**Anti-features to guard (with reasoning):**
- **Stealth/bypass measures** — FRE 901(b)(9) authentication requires showing the process produces accurate results; stealth modifications undermine this. CFAA exposure from circumventing technical access controls.
- **Paywall circumvention** — copyright infringement risk; evidence should show what a normal visitor sees (the paywall).
- **Silent error suppression** — a WACZ that captured a Cloudflare challenge page presented as "the real page" is worse than an honest failure. This is the specific gap Area 5 addresses.
- **`robots.txt` override** — reputational risk; unnecessary for single-page capture use case.

## Architecture Direction (from ARCHITECTURE.md)

**Settle heuristic refactor (Area 3 foundation):**
The current `waitForSettle()` (500ms quiescence within 3s cap) should become a multi-signal settle with return-value indicating which phases completed (network quiet, fonts ready, framework-specific signals). Modeled on Browsertrix's `LoadState` enum but lighter. This is the *foundation* other areas depend on — settle improvements make Areas 1, 4, and 6 more effective.

**Font-load gate:**
`document.fonts.ready` with 2–3s timeout before any screenshot. One-line addition per STACK.md but needs the timeout wrapper to avoid hangs on unreachable font CDNs (Playwright issues #28995, #35972).

**Partial-capture metadata model:**
Extend render metadata with `failureClass` (`slow`/`blocked`/`broken`/`limit_exceeded`), `signals` (bot-protection indicators), and stage-by-stage completion flags (`domLoaded`, `loadFired`, `contentReceived`). This is the substrate for Areas 5 and 6.

**Pipeline interface for #206:**
Per ARCHITECTURE.md, `performCapture()` becomes a ~30-line orchestrator that calls `resolvePipeline(env).capture(env, input)`. The pipeline owns render → artifacts → WACZ → sign. The orchestrator owns DB state transitions (`completeCapture`/`failCapture`). Selection via `CAPTURE_PIPELINE` env var, centralized in a factory function to support future per-tenant selection without call-site changes.

**CDP availability — gating risk for Area 4:**
ARCHITECTURE.md recommends CDP `Network.enable` + `Network.getResponseBody` for subresource capture. CF announced "full CDP support" in April 2026, but whether `@cloudflare/playwright` v1.3.0 actually exposes `page.context().newCDPSession(page)` is unverified. **This is the single largest technical risk in the milestone.** Fallback is `page.on('response')` + `response.body()`, which works but re-fetches from cache rather than intercepting the original stream.

## Pitfalls That Reshape the Roadmap (from PITFALLS.md)

| Pitfall | Severity | Area Threatened | Roadmap Action |
|---|---|---|---|
| **fflate `zipSync` non-deterministic for numeric-looking keys** | CRITICAL | Area 4 | Add a determinism unit test in `test/wacz.test.js` *before* any Area 4 work: build WACZ twice with identical inputs, assert byte-equal output. This is pre-condition infrastructure. |
| **Screenshot parameter changes break diff-detection** | HIGH | Area 3 | Area 3 needs a `screenshotVersion` field in `captureSettings` + a cutover plan that suppresses diff when versions differ. Cannot be a simple config change. |
| **`captureSettings` schema versioning** | MEDIUM | Areas 2, 5, 6 | Cross-cutting infrastructure: add `captureSettings.version` field before any area modifies the schema. Should land in an early phase. All consumers switch on version; never remove/rename fields within a version. |
| **Perverse incentive on Area 5** | MEDIUM | Area 5 | Add a CI guard that greps for stealth-related imports (`puppeteer-extra-plugin-stealth`, `navigator.webdriver` overrides). Document the bright line in `CLAUDE.md`. |
| **Partial-capture rate masking systematic failures** | HIGH | Area 6 | Track partial rate as a distinct Coralogix metric, separate from success/failure. Alert if >15%. Audit phase must baseline this. |
| **Performance budget regression** | HIGH | All areas | Maintain a per-stage budget. Any area that pushes p95 up by >500ms must justify or optimize. Measure before/after each area. |

## Recommended Phase Sequence

### Phase 0: Pre-flight Cleanup
- **Goal:** Fix three known bugs before measurement begins
- **Maps to:** Pre-flight items in PROJECT.md
- **Inherited pitfalls:** None — surgical fixes
- **Pre-conditions:** None
- **Why first:** Clean baseline for audit metrics. Active production bug (`buildStatusBanner` collision).

### Phase 1: Capture Quality Audit
- **Goal:** Establish baselines via URL battery + Coralogix analysis; build reference corpus; answer gating questions
- **Maps to:** #257 audit deliverable
- **Inherited pitfalls:** Must build reference corpus (cross-cutting test coverage gap). Must measure: p50/p95 capture duration, partial rate, consent detection rate, browser hours, `settleMs` distribution.
- **Pre-conditions:** Pre-flight cleanup deployed
- **Why this position:** Every subsequent phase needs before/after evidence. Audit answers the CDP availability question for Area 4 and the DPR memory question for Area 3.

### Phase 2: Infrastructure Pre-conditions
- **Goal:** Land cross-cutting infrastructure that later phases depend on
- **Maps to:** Groundwork for Areas 2–6
- **Work:** `captureSettings` schema versioning (`version: 2`), WACZ determinism unit test, `screenshotVersion` field in capture metadata, `@cloudflare/playwright` upgrade to `^1.3.0`, CI stealth-import guard
- **Inherited pitfalls:** fflate determinism trap, schema versioning gap, stealth incentive
- **Pre-conditions:** Audit complete (informs schema shape)
- **Why this position:** Without these, Areas 2–6 each independently risk schema breakage, diff-detection breakage, or determinism failures.

### Phase 3: Area 3 — Screenshot Quality + Settle Heuristic
- **Goal:** `document.fonts.ready` gating, settle heuristic refactor (multi-signal with return metadata), DPR evaluation (likely 4→2 default), compositor pause validation
- **Maps to:** #257 Area 3
- **Inherited pitfalls:** Diff-detection breakage (mitigated by Phase 2's `screenshotVersion`), memory pressure at 4x DPR + tall pages, compositor pause fragility
- **Pre-conditions:** `screenshotVersion` infrastructure from Phase 2; DPR memory data from audit
- **Why this position:** Settle heuristic is the foundation — Areas 1, 4, and 6 all depend on improved settle.

### Phase 4: Area 1 — Dynamic Content Handling
- **Goal:** SPA hydration detection, enhanced lazy-load triggers (`data-src` variants, IO patterns), infinite-scroll wall-clock cap, `beacon`/`ping` resource type exclusion from settle
- **Maps to:** #257 Area 1
- **Inherited pitfalls:** Settle regression (p95 perf budget), infinite scroll unbounded loop, lazy-load incomplete for IO patterns
- **Pre-conditions:** Improved settle heuristic from Phase 3
- **Why this position:** Builds on settle improvements; makes Areas 4 and 6 more effective.

### Phase 5: Area 6 — Render-Failure Resilience
- **Goal:** Tri-state failure classification (`slow`/`blocked`/`broken`), enriched partial-capture metadata, long-polling XHR detection, partial-capture WACZ bundling evaluation
- **Maps to:** #257 Area 6
- **Inherited pitfalls:** Partial rate masking systematic failures, "slow vs blocked" distinction accuracy, timing sensitivity of expanded checks
- **Pre-conditions:** Settle refactor (Phase 3) for improved pending-request classification
- **Why this position:** Better partial capture before subresource work prevents subresource collection from making partial captures worse.

### Phase 6: Area 5 — Bot-Protection Annotation
- **Goal:** Multi-signal detection (CF challenge, Akamai, DataDome, PerimeterX, generic CAPTCHA), `render.botProtection` metadata field, cross-reference with `captureHeaders.status`
- **Maps to:** #257 Area 5
- **Inherited pitfalls:** False-positive heuristics (require ≥2 signals), perverse incentive to bypass (CI guard from Phase 2)
- **Pre-conditions:** Enriched render metadata model from Phase 5
- **Why this position:** Low-risk metadata enrichment; independent of subresource work; benefits from failure classification in Phase 5.

### Phase 7: Area 2 — Cookie Consent and Overlay Dismissal
- **Goal:** Autoconsent upgrade to v14.72.0, enriched consent status (`noRejectOption`), consent timeout evaluation (2s→3s if audit warrants), generic overlay detection heuristic (annotate, not dismiss), paywall annotation
- **Maps to:** #257 Area 2
- **Inherited pitfalls:** Cross-origin iframe silent failure, autoconsent wrong-choice bug, 2s timeout too short, `captureSettings` schema changes (mitigated by Phase 2 versioning)
- **Pre-conditions:** Schema versioning from Phase 2; CMP failure data from audit
- **Why this position:** Independent of other areas; consent has its own timeout budget.

### Phase 8: Area 4 — WACZ Subresource Capture
- **Goal:** CDP-based subresource capture (CSS, images, fonts — not all traffic), WARC response records via extended `src/warc.js`, CDXJ index expansion, selective type/size filtering, `packages/verify/` updates
- **Maps to:** #257 Area 4
- **Inherited pitfalls:** fflate determinism (mitigated by Phase 2 unit test), verify CLI breakage, ReplayWeb.page compatibility, subresource timing variability, memory budget pressure, WACZ size inflation
- **Pre-conditions:** **CDP availability verified** (audit or Phase 2 spike); determinism unit test passing; all other fidelity improvements stable
- **Why this position:** Riskiest #257 area — new CDP dependency, memory pressure, WARC format changes. All other improvements should be stable first.

### Phase 9: #206 — Pluggable Pipeline Refactor
- **Goal:** Extract `CapturePipeline` interface from stable browser pipeline, `resolvePipeline()` factory, `CAPTURE_PIPELINE` env-var selection, refactor `performCapture()` to ~30-line orchestrator
- **Maps to:** #206
- **Inherited pitfalls:** Interface leaking browser assumptions (use generic `artifacts` map, not screenshot-shaped contract), test breakage during refactor (preserve injection seam), premature generalization (keep it to `name` + `canHandle` + `capture`)
- **Pre-conditions:** All #257 areas complete — browser pipeline has reached final shape
- **Why this position:** Interface extracted from working code, not designed speculatively. No rework.

## Open Questions Carried Forward

### (a) Answer during audit phase using production data
- Current partial-capture rate in production — if >10%, reprioritize Area 6 earlier
- `settleMs` and `settleReason` distribution — informs whether settle heuristic changes should be conservative or aggressive
- Which CMP providers fail silently (cross-origin iframe injection) — informs Area 2 scope
- `consentMs` distribution for timeout captures — determines whether 2s→3s timeout change is warranted
- How many captures hit `MAX_PAGE_HEIGHT` or `MAX_SUBRESOURCES` limits — informs Area 4 budget decisions
- Captures where `captureHeaders.status` is 403/503 but `renderQuality` is `full` — target population for Area 5
- `deviceScaleFactor: 4` memory usage on tall pages — decides 2x vs 4x default
- Current browser-hour consumption — models cost impact of longer settle times

### (b) Answer during phase-level research before that phase starts
- **CDP `newCDPSession()` availability on `@cloudflare/playwright`** — gate for Area 4 approach. Verify during audit or Phase 2 as a spike. If unavailable, fall back to `page.on('response')` + `response.body()`.
- **Autoconsent v14.72.0 breaking changes** — test vendored bundle upgrade before Area 2 work
- **Bot-protection detection false-positive rate** — run a test battery of known-protected sites before Area 5 implementation
- **Partial WACZ signing implications** — if signing partial captures, must mark `renderQuality: 'partial'` in `datapackage.json` to prevent misrepresentation

### (c) Accept as risks and track in evolution log
- WARC record IDs use `crypto.randomUUID()` — WACZs are per-capture unique, not content-addressable. Documented, not fixable without breaking the signing model.
- Timestamp drift between render and WACZ assembly — mitigatable by threading nav timestamp through to `buildWacz()`, but some drift is inherent. Track as a known limitation.
- Subresource capture ROI for evidence-grade vs archive-grade — FEATURES.md flags this as genuinely unresolved. Proceed with Area 4 as scoped (selective, conservative) but note that the evidence-grade case for offline replay is assumed, not validated.

## Items NOT Changed by Research

Research did **not** contradict any of these PROJECT.md decisions — they remain locked:

- **Sequencing-B (value-first):** #257 before #206, #143 parked. Research reinforced this — ARCHITECTURE.md explicitly argues the pipeline interface should be extracted from stable post-#257 code.
- **Audit-first:** Research confirmed the audit is essential — at least 8 open questions require production data to answer.
- **All six areas in scope:** No area was found to be unnecessary or already-solved by existing code.
- **Bot-protection: annotation only, never bypass.** FEATURES.md and PITFALLS.md both reinforce this with legal reasoning (FRE 901(b)(9), CFAA).
- **DR/D1-backups deferred:** No research finding creates urgency.
- **Pre-flight cleanup before Phase 1:** Research added no new pre-flight items; the three known bugs remain the scope.
- **Per-environment pipeline selection only (not per-tenant):** Research confirms this is sufficient for the milestone.
- **No big-file refactors:** ARCHITECTURE.md's pipeline refactor touches `performCapture()` (making it thinner) but does not require splitting `index.js`, `db.js`, or `mcp.js`.