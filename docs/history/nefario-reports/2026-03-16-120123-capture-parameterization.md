---
task: Evaluate capture request parameterization for WRL
date: 2026-03-16
slug: capture-parameterization
mode: advisory
task-count: 0
gate-count: 0
compaction-events: 0
---

## Summary

Six specialists evaluated whether WRL should support parameterized capture requests -- controlling browser behavior (viewport, cookies, wait conditions, consent handling) during capture. Answer: do not build general parameterization now. Cookie consent banners are a real fidelity problem; address them through a server-controlled dismissal mechanism as a [should] parking lot item. When parameterization ships, every setting must be recorded immutably in the WACZ bundle (existing Ed25519 chain covers it automatically) and visible to verifiers. No caller-supplied JavaScript execution, ever.

## Original Prompt

Evaluate whether WRL should establish a mechanism to parameterize capture requests. Primary motivation: cookie consent banners dominate every screenshot because captures start with an empty session. Secondary concerns: personalization, viewport control, wait conditions, session state injection. Run as advisory only.

## Key Design Decisions

1. **General parameterization: Hold.** The competitive landscape splits cleanly -- screenshot APIs (URLBox, ScreenshotOne) compete on parameterization breadth; evidence services (Page Vault, Pagefreezer) limit caller control. WRL is in the evidence category. Adding caller-controlled cookies or JS injection would push WRL toward a screenshot API where it cannot compete and would undermine its core positioning.

2. **Cookie consent: server-controlled dismissal, not caller-controlled.** When built, WRL should decide the consent policy (dismiss or reject-all), apply it uniformly, and record the action in capture metadata. The caller has no control over consent handling. This preserves the attestation model -- the capture reflects WRL's documented policy, not the caller's preference.

3. **Timing: parking lot, not now.** Act 1 (Solid Foundation) has 7 remaining items. No external user has reported cookie banners as blocking. YAGNI applies. But the item is [should] tier (not [consider]) acknowledging the problem is real.

4. **Evidence integrity through transparency.** Every parameter must be recorded in `captureSettings` block in `datapackage.json`, automatically covered by the Ed25519 signature chain (no signing changes needed). Verifiers must see capture conditions alongside URL and timestamp.

5. **Two-tier evidence model.** Level 1 (Verified): clean-slate capture, no parameters, full evidence claim. Level 2 (Documented): parameterized capture, evidence claim limited to "this is what the page showed given these inputs." Both signed and timestamped.

6. **12 minimum security constraints for safe parameterization.** Most critical: no caller-supplied JS execution (#1), cookie domain scoping (#3), pixel budget enforcement (#6), parameterization flags in metadata (#9). Architecture: validation/normalization layer that accepts WRL parameters, not a passthrough to Playwright's `newContext()`.

7. **API extension approach when ready.** Extend `POST /v1/captures` with optional fields alongside `url`. No presets, no separate endpoint. `appliedParams` in responses shows actual values used. Backward compatible.

## Phases

### Phase 1: Meta-Plan
Identified 6 specialists: ux-strategy-minion (evidence vs. fidelity tension, user jobs), security-minion (attack surface analysis), api-design-minion (parameter model design), frontend-minion (cookie consent technical feasibility), gru (strategic YAGNI assessment), data-minion (evidence provenance architecture).

### Phase 2: Specialist Planning
- **ux-strategy-minion**: The clean-slate vs. parameterized tension is a false dichotomy. Evidence integrity comes from declaring conditions, not restricting them. Cookie consent handling should be a default behavior (dismiss without accepting). Distinguished "neutral" parameters (viewport) from "opinion" parameters (cookie consent) -- this distinction should be visible to verifiers.
- **security-minion**: Parameterization is safe IF every category is independently threat-modeled. Cookie injection is CRITICAL in multi-tenant (transforms WRL into a credentialed proxy). Defined 12 minimum security constraints. Recommended two-tier evidence model.
- **api-design-minion**: Extend `POST /v1/captures` with optional fields. Six initial parameters (viewport, waitUntil, maxWaitMs, cookies, screenshotMaxHeight). `appliedParams` in responses. Cookie values never echoed (count only). Fully backward compatible.
- **frontend-minion**: Evaluated four consent approaches. CSS hiding: 60-70% known CMPs. Click automation: 70-80%. CMP API calls: 80-85%. Cookie pre-injection: 85-90%. All have 0% custom banner coverage. Recommended layered architecture, not a general-purpose consent handler. Autoconsent library is the only viable broad-coverage path.
- **gru**: General parameterization: Hold. Server-controlled consent dismissal: Assess. Market analysis confirms evidence services limit caller control. Timing: not now (Act 1 in progress). Use autoconsent with reject-all. Bundle size and 30s budget are open constraints.
- **data-minion**: Parameters in both `datapackage.json` (dense) and KV (sparse). Ed25519 signature automatically covers parameters through existing canonicalize-hash-sign chain. Schema: closed, minimal, 4 fields Tier 1 with `settingsVersion`. KV impact negligible (~400-500 bytes).

### Phase 3: Synthesis
Resolved four conflicts:
1. **Server-controlled vs. caller-controlled consent**: server-controlled first (gru wins on evidence positioning); caller cookies as future escape hatch.
2. **Dismiss vs. reject-all consent action**: deferred to implementation (depends on library feasibility).
3. **Build now vs. parking lot**: parking lot at [should] tier (YAGNI respected, problem acknowledged).
4. **Cookie limit 20 vs. 50**: adopt 20 (security recommendation; evidence use case is narrow).

### Phases 3.5-8
Skipped (advisory-only orchestration).

## Agent Contributions

| Agent | Phase | Recommendation | Risks |
|-------|-------|----------------|-------|
| ux-strategy-minion | planning | Evidence integrity = declaring conditions, not restricting them. Neutral vs opinion parameter taxonomy. Cookie dismiss as default. | Scope creep, evidence confusion, contested boundary |
| security-minion | planning | 12 security constraints. Two-tier evidence model. No caller JS execution ever. | Cookie injection as credentialed proxy (CRITICAL multi-tenant) |
| api-design-minion | planning | Extend POST body with optional fields. appliedParams in responses. Cookie count only. | Cookie domain validation is a security boundary |
| frontend-minion | planning | Layered architecture: CSS hiding + caller cookies. No general consent handler. | Selector drift, 0% custom banner coverage |
| gru | planning | General params: Hold. Server consent: Assess. Not now. | Autoconsent fragility, bundle size, 30s budget |
| data-minion | planning | captureSettings in datapackage.json + KV. Signature covers it automatically. | Schema immutability under signing, false precision |

## Team Recommendation

### Do not build parameterization now. Prepare the ground for when it's needed.

**Immediate action**: Update `docs/backlog.md` with three parking lot items:

1. **[should] Server-controlled cookie consent dismissal**
   - Trigger: User reports banners as blocking, OR Web UI (R17) ships
   - Approach: Integrate autoconsent (or curated subset) via `addInitScript()`. Operator policy (reject-all or dismiss), not caller parameter.
   - Record action in WACZ `captureSettings.consentHandling`. Display on verification page.
   - Scope: S-M. Dependencies: none, but should wait for Act 1 completion.

2. **[consider] Viewport parameterization**
   - Trigger: User reports viewport size as a problem
   - Approach: Optional `viewport` field in request body. Caps: width [320, 1920], height [480, 1080]. Pixel budget: 50M max.
   - Record in `captureSettings`. Scope: S.

3. **[consider] Capture options metadata schema (`captureSettings`)**
   - Trigger: When any capture parameterization feature ships
   - Approach: Closed schema with `settingsVersion`, embedded in `datapackage.json`. Four Tier 1 fields (viewport width/height, waitUntil, maxScreenshotHeight). Signature coverage comes for free.
   - Scope: S. This is prerequisite infrastructure for any parameterization.

**When multi-tenant (R12) ships**: revisit cookie injection threat model. Require elevated permissions, per-tenant audit logging, Terms of Service updates before enabling caller-provided cookies.

**What NOT to build, ever**: Caller-supplied JavaScript execution in the page context (`waitForFunction`, `evaluate`, `addScriptTag`, `addInitScript` with user content). This is a non-negotiable security red line across all specialists.

### Open questions for the project owner

1. **Consent action**: "dismiss without choosing" (maximally neutral, technically harder) vs. "reject all" (cleaner state, active choice that may hide consent-gated content)?
2. **Should consent dismissal be default-on or opt-in?** ux-strategy argues default-on (the banner-free view is better evidence of page content); gru argues opt-in (explicit is safer).
3. **Autoconsent bundle size**: needs evaluation against Cloudflare Workers' 10MB script limit before committing to that library.

## Session Resources

### Skills Invoked
- `/nefario` (this advisory)

### Compaction
0 compaction events.

## Working Files

All specialist contributions and synthesis available in the companion directory:
[2026-03-16-120123-capture-parameterization/](./2026-03-16-120123-capture-parameterization/)

Files:
- `prompt.md` -- original task description
- `phase1-metaplan-prompt.md` / `phase1-metaplan.md` -- meta-plan
- `phase2-ux-strategy-minion-prompt.md` / `phase2-ux-strategy-minion.md`
- `phase2-security-minion-prompt.md` / `phase2-security-minion.md`
- `phase2-api-design-minion-prompt.md` / `phase2-api-design-minion.md`
- `phase2-frontend-minion-prompt.md` / `phase2-frontend-minion.md`
- `phase2-gru-prompt.md` / `phase2-gru.md`
- `phase2-data-minion-prompt.md` / `phase2-data-minion.md`
- `phase3-synthesis-prompt.md` / `phase3-synthesis.md` -- advisory synthesis
