You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Issue #58: Dual-screenshot cookie consent dismissal for captures. Integrate @duckduckgo/autoconsent to dismiss cookie consent banners, producing dual screenshots per capture.

## Your Planning Question
Validate the autoconsent integration against the 12 Phase 0017 security constraints:
1. Does server-controlled `page.evaluate()` with autoconsent library code satisfy constraint #1 (no caller-supplied JS)?
2. Could a malicious target page trick autoconsent into unintended behavior (e.g., XSS via fake CMP selectors)?
3. MPL-2.0 bundling within an Apache-2.0 Worker -- any license compatibility issues?
4. Should `captureSettings` include a library version hash for reproducibility?
5. Any concerns about the library executing alongside target page scripts in the same page context?
6. Constraint #11 (serviceWorkers: 'block') and #12 (cross-domain nav blocking) -- does autoconsent interfere with either?
7. The library uses `page.evaluate()` to detect and interact with CMPs. Does this open any attack surface that doesn't exist today?

## Context
The 12 binding security constraints from Phase 0017:
1. No caller-supplied JavaScript execution
2. No caller-supplied CSS injection
3-8. Cookie/viewport/wait constraints (not directly relevant here)
9. Parameterization flag in capture metadata and WACZ manifest
10. Strict input validation
11. serviceWorkers: 'block' remains hardcoded
12. Cross-domain navigation blocking remains hardcoded

Key files to read:
- `src/capture.js` -- BrowserContext isolation model, route interception, service worker blocking
- Phase 0017 advisory security analysis: `docs/history/nefario-reports/2026-03-16-120123-capture-parameterization/phase2-security-minion.md`

## Instructions
1. Read the source files and advisory context
2. Validate each relevant constraint against the proposed integration
3. Identify any new attack surfaces
4. Return your contribution in structured format
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-security-minion.md`
