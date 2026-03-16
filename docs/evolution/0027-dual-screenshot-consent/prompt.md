# Phase 0025: Dual-Screenshot Cookie Consent Dismissal

## Source

GitHub Issue #58

## Task Description

Every WRL capture produces two screenshots -- one with the cookie banner visible
(first-visit state) and one after server-controlled dismissal via DuckDuckGo's
autoconsent library -- so that both the banner presence and the underlying page
content are preserved as signed evidence artifacts in the WACZ bundle.

## Success Criteria

- Captures produce two screenshot artifacts: `screenshot-before.png` (as-is)
  and `screenshot-after.png` (post-dismissal)
- Both screenshots are included in the WACZ bundle and covered by the Ed25519
  signature
- `captureSettings` in `datapackage.json` records: consent library used, consent
  action attempted, success/failure status
- When autoconsent dismissal fails (unknown CMP, custom banner), the capture
  still succeeds with a single screenshot and metadata indicating dismissal was
  attempted but failed
- Existing `{ url }` API contract unchanged -- dual screenshots happen
  automatically, no caller parameters
- Capture completes within the 30s `ctx.waitUntil` budget (dismissal +
  re-screenshot adds <2s for typical pages)
- All 12 security constraints from the Phase 0017 advisory are respected

## Scope

**In:** Autoconsent integration, dual screenshot pipeline, WACZ bundle extension,
`captureSettings` metadata schema, verification page updates, OpenAPI spec updates.

**Out:** Caller-controlled consent parameters, cookie injection, viewport/wait
parameterization, autoconsent `extra` bundle.

## Context

- Advisory report: `docs/history/nefario-reports/2026-03-16-120123-capture-parameterization.md`
- Evolution log: `docs/evolution/0021-capture-parameterization-advisory/`
- Depends on: #53 (staged fallback) and #41 (RFC 3161 timestamps)
