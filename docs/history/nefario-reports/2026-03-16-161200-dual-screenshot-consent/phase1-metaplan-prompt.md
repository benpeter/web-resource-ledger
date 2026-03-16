MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Issue #58: Dual-screenshot cookie consent dismissal for captures

Every WRL capture produces two screenshots -- one with the cookie banner visible (first-visit state) and one after server-controlled dismissal via DuckDuckGo's autoconsent library -- so that both the banner presence and the underlying page content are preserved as signed evidence artifacts in the WACZ bundle. This eliminates the tension between proving a banner was shown and capturing clean page content.

### Success criteria

- Captures produce two screenshot artifacts: `screenshot-before.png` (as-is) and `screenshot-after.png` (post-dismissal)
- Both screenshots are included in the WACZ bundle and covered by the Ed25519 signature
- `captureSettings` in `datapackage.json` records: consent library used, consent action attempted, success/failure status
- When autoconsent dismissal fails (unknown CMP, custom banner), the capture still succeeds with a single screenshot and metadata indicating dismissal was attempted but failed
- Existing `{ url }` API contract unchanged -- dual screenshots happen automatically, no caller parameters
- Capture completes within the 30s `ctx.waitUntil` budget (dismissal + re-screenshot adds <2s for typical pages)
- All 12 security constraints from the Phase 0017 advisory are respected (no caller-supplied JS execution, no CSS injection, etc.)

### Scope

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

### Constraints

- `@duckduckgo/autoconsent` Playwright bundle (168KB self-contained, MPL-2.0 compatible with MIT, 100+ CMPs)
- Server-controlled only -- WRL decides the consent policy, not the API caller
- Phase 0017 advisory report and 12 security constraints are binding context

### Sequencing

**Depends on:** #53 (staged fallback) and #41 (RFC 3161 timestamps) -- both modify `capture.js`, `wacz.js`, `openapi.yaml`. Must run after Wave 2 merges.

**Wave 3 candidate** in `wrl-waves-1-and-2.sh`. No R17 (Web UI) dependency -- dual screenshots make the feature purely additive with no UX trade-offs.

### Context

- Advisory report: `docs/history/nefario-reports/2026-03-16-120123-capture-parameterization.md`
- Evolution log: `docs/evolution/0017-capture-parameterization-advisory/`
- Size estimate: S-M

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/dual-screenshot-consent

## Key Codebase Context

The project is a Cloudflare Worker that captures web pages as evidence. Key files:

- `src/capture.js` -- Browser rendering pipeline. `defaultRenderer()` navigates, takes a single screenshot, returns `{ screenshot, html, partial, render }`. `performCapture()` orchestrates: render + header fetch concurrently, store artifacts in R2, build WACZ, update KV.
- `src/wacz.js` -- WACZ assembly. `buildWacz()` takes `{ screenshot, html, headers }` artifacts, builds WARC records, CDXJ index, datapackage.json, signs with Ed25519, creates ZIP.
- `src/warc.js` -- WARC/1.1 record construction. Currently builds 4 records: warcinfo, resource (HTML), metadata (headers), resource (screenshot PNG).
- `src/kv.js` -- KV access layer. `completeCapture()` stores `artifacts`, `wacz`, `renderQuality`, `render` fields.
- `src/verify-page.js` -- HTML verification page. Shows capture metadata, verification checks, single screenshot.
- `src/verify.js` -- WACZ verification logic. Verifies artifact hashes, bundle hash, Ed25519 signature.
- `openapi.yaml` -- API spec. Defines capture/verify/retrieve schemas.
- `package.json` -- Dependencies: `@cloudflare/playwright`, `fflate`. Dev: vitest, wrangler.
- 22 test files in `test/`.

The capture currently takes one screenshot. This issue adds a second screenshot after cookie consent dismissal using autoconsent.

### 12 Security Constraints (from Phase 0017 advisory, binding)

1. No caller-supplied JavaScript execution
2. No caller-supplied CSS injection
3. Cookie domain scoping (for future cookie features)
4. Cookie count and size limits (for future cookie features)
5. Viewport dimension caps
6. Pixel budget enforcement
7. Device scale factor cap
8. Wait strategy enum (only Playwright built-ins)
9. Parameterization flag in capture metadata and WACZ manifest
10. Strict input validation on all parameter fields
11. `serviceWorkers: 'block'` remains hardcoded
12. Cross-domain navigation blocking remains hardcoded

For this issue, constraints #1, #2, #9, #11, #12 are directly relevant. The autoconsent library runs server-controlled code (not caller-supplied), satisfying #1. Constraint #9 requires `captureSettings` in both KV metadata and WACZ datapackage.json.

## External Skill Discovery
No external skills detected in .claude/skills/ or .skills/ relevant to this task.

## Instructions
1. Read relevant files to understand the codebase context
2. Analyze the task against your delegation table
3. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning). These are agents whose domain expertise is needed to create a good plan.
4. For each specialist, write a specific planning question that draws on their unique expertise.
5. Return the meta-plan in the structured format.
6. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase1-metaplan.md`
