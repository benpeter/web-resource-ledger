Issue #58: Dual-screenshot cookie consent dismissal for captures

Every WRL capture produces two screenshots -- one with the cookie banner visible (first-visit state) and one after server-controlled dismissal via DuckDuckGo's autoconsent library -- so that both the banner presence and the underlying page content are preserved as signed evidence artifacts in the WACZ bundle. This eliminates the tension between proving a banner was shown and capturing clean page content.

## Success criteria

- Captures produce two screenshot artifacts: `screenshot-before.png` (as-is) and `screenshot-after.png` (post-dismissal)
- Both screenshots are included in the WACZ bundle and covered by the Ed25519 signature
- `captureSettings` in `datapackage.json` records: consent library used, consent action attempted, success/failure status
- When autoconsent dismissal fails (unknown CMP, custom banner), the capture still succeeds with a single screenshot and metadata indicating dismissal was attempted but failed
- Existing `{ url }` API contract unchanged -- dual screenshots happen automatically, no caller parameters
- Capture completes within the 30s `ctx.waitUntil` budget (dismissal + re-screenshot adds <2s for typical pages)
- All 12 security constraints from the Phase 0017 advisory are respected (no caller-supplied JS execution, no CSS injection, etc.)

## Scope

**In:**
- Autoconsent integration via `page.exposeBinding()` + `page.evaluate()`
- Dual screenshot capture pipeline
- WACZ bundle extension for two screenshots
- `captureSettings` metadata schema in `datapackage.json` and KV
- Verification endpoint displaying consent handling status

**Out:**
- Caller-controlled consent parameters
- Caller-provided cookie injection
- Viewport parameterization, wait condition parameterization, general capture parameterization API
- Autoconsent `extra` bundle (filterlist rules)

## Constraints

- `@duckduckgo/autoconsent` Playwright bundle (168KB self-contained, MPL-2.0 compatible with MIT, 100+ CMPs)
- Server-controlled only -- WRL decides the consent policy, not the API caller
- Phase 0017 advisory report and 12 security constraints are binding context

## Sequencing

**Depends on:** #53 (staged fallback) and #41 (RFC 3161 timestamps) -- both modify `capture.js`, `wacz.js`, `openapi.yaml`. Must run after Wave 2 merges.

**Wave 3 candidate** in `wrl-waves-1-and-2.sh`. No R17 (Web UI) dependency -- dual screenshots make the feature purely additive with no UX trade-offs.

## Context

- Advisory report: `docs/history/nefario-reports/2026-03-16-120123-capture-parameterization.md`
- Evolution log: `docs/evolution/0017-capture-parameterization-advisory/`
- Size estimate: S-M
