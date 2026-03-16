MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Issue #58: Dual-screenshot cookie consent dismissal for captures. Every WRL capture produces two screenshots -- one with the cookie banner visible (first-visit state) and one after server-controlled dismissal via DuckDuckGo's autoconsent library -- so that both the banner presence and the underlying page content are preserved as signed evidence artifacts in the WACZ bundle.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-data-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-software-docs-minion.md

## Key consensus across specialists:

### frontend-minion
Phase: planning
Recommendation: Use `dist/autoconsent.playwright.js` (168KB). Integration via `page.exposeBinding()` + `page.evaluate()` after navigation. Take before-screenshot first, then inject autoconsent, then after-screenshot. Reduce NAV_TIMEOUT_MS from 25s to 20s to give consent phase 8s budget.
Tasks: 6 -- install autoconsent dep; implement consent module; modify defaultRenderer for dual screenshots; handle partial capture path; add consent timeout; verify exposeBinding on Cloudflare
Risks: exposeBinding may not work on Cloudflare Browser Rendering; 168KB bundle may exceed script size limits; NAV_TIMEOUT reduction impacts slow pages
Conflicts: none

### data-minion
Phase: planning
Recommendation: Two separate WARC resource records for before/after screenshots with `urn:wrl:screenshot:before:{url}` / `after:{url}` URIs. captureSettings as top-level field in datapackage.json with version, consent, screenshots sub-objects. No signature chain changes needed.
Tasks: 3 -- extend warc.js for dual screenshot records + captureSettings metadata record; extend wacz.js datapackage with captureSettings; extend kv.js completeCapture() with captureSettings and split artifacts
Risks: Schema immutability under signing (captureSettings locked once signed); backward compat for existing consumers of artifacts.screenshot
Conflicts: none

### security-minion
Phase: planning
Recommendation: All 12 constraints satisfied. Server-controlled page.evaluate() is fine. Key risk: exposeBinding message handler must validate against allowlist, never evaluate arbitrary page-originated code. MPL-2.0 compatible. Include library version hash in captureSettings.
Tasks: 2 -- message handler validation with strict allowlist; captureSettings version hash at build time
Risks: Malicious page crafting fake CMP selectors (MEDIUM, blast radius contained); exposeBinding message handler as new trust boundary
Conflicts: none

### api-design-minion
Phase: planning
Recommendation: Keep `artifacts.screenshot` as primary (best-available), add optional `artifacts.screenshotBefore`. Zero breaking changes. `captureSettings` as top-level response field with consentHandling sub-object. No new verification check.
Tasks: 3 -- OpenAPI schema additions; R2 path + route regex update; verification response extension
Risks: screenshot semantic shift could surprise consumers expecting pre-dismissal
Conflicts: Tension with data-minion on naming: data-minion proposes screenshotBefore/screenshotAfter replacing screenshot; api-design-minion proposes keeping screenshot + adding screenshotBefore

### test-minion
Phase: planning
Recommendation: Extract shared test fixtures first (stubRenderer duplicated in 4 files). Renderer injection is the right mock boundary. WARC URI change is most delicate. Artifact route regex needs updating.
Tasks: 4 -- extract shared fixtures; update renderer stubs for dual screenshots; extend WACZ round-trip tests; add consent-specific test cases
Risks: WARC structure changes could break verification of old bundles; verify-page visual testing limited to HTML structure
Conflicts: none

### ux-strategy-minion
Phase: planning
Recommendation: After-screenshot primary (full width), before in disclosure. Consent status as check row using existing pass/skip pattern. No "degraded" language. Presence-driven rendering for backward compat.
Tasks: 2 -- verification page dual screenshot display with disclosure; consent check row + captureSettings details section
Risks: None critical
Conflicts: none

### software-docs-minion
Phase: planning
Recommendation: 12 essential doc tasks across 6 files. No ARCHITECTURE.md needed. OpenAPI bears most weight. Header comments need consent handling section.
Tasks: 3 -- openapi.yaml schema + examples; JSDoc updates; header comment updates
Risks: Backward compat of artifact naming must be resolved before docs
Conflicts: none

## Key Conflict to Resolve

**Artifact naming**: data-minion proposes `screenshotBefore`/`screenshotAfter` replacing `screenshot` in both KV and R2. api-design-minion proposes keeping `screenshot` as primary (pointing to best-available) + adding optional `screenshotBefore`. The api-design approach preserves backward compatibility better -- existing consumers who only care about "the screenshot" continue to work without changes.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve the artifact naming conflict (favor api-design-minion's backward-compatible approach)
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format with complete, self-contained task prompts
5. Group work into logical tasks that can be executed by agents
6. Ensure every task has a complete prompt with all context needed
7. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase3-synthesis.md`
