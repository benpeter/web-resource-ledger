## Meta-Plan

### Task Summary

Issue #58: Add dual-screenshot cookie consent dismissal to the WRL capture pipeline. Every capture will produce two screenshots -- `screenshot-before.png` (first-visit state with cookie banner visible) and `screenshot-after.png` (after server-controlled dismissal via `@duckduckgo/autoconsent`). Both are included in the WACZ bundle and covered by the Ed25519 signature. A `captureSettings` metadata block records consent handling details. Graceful degradation: when dismissal fails, the capture succeeds with a single screenshot.

This touches 6 source files (`capture.js`, `wacz.js`, `warc.js`, `kv.js`, `verify-page.js`, `openapi.yaml`), their corresponding tests, and introduces a new dependency (`@duckduckgo/autoconsent`). The Phase 0017 advisory report and its 12 security constraints are binding context.

### Planning Consultations

#### Consultation 1: Autoconsent Integration Architecture
- **Agent**: frontend-minion
- **Planning question**: How should `@duckduckgo/autoconsent` be integrated into the Playwright capture pipeline within `defaultRenderer()`? Specifically: (a) What is the correct integration pattern -- `page.addInitScript()` with the library bundle, `page.exposeBinding()` for communication, or `page.evaluate()` post-navigation? (b) How do we detect whether autoconsent successfully dismissed a banner vs. found nothing vs. failed? (c) The library's unpacked size is 27MB but the issue references a 168KB "Playwright bundle" -- which export/bundle path gives us the minimal footprint needed for `page.evaluate()`-style injection? (d) What is the expected latency overhead for the dismiss-then-re-screenshot sequence on typical pages (CMP detected vs. no CMP)?
- **Context to provide**: `src/capture.js` (full file -- `defaultRenderer()` is the integration point), `package.json` (current deps), the 30s `ctx.waitUntil` budget with 25s NAV_TIMEOUT_MS, the constraint that autoconsent runs server-controlled code only (security constraint #1: no caller-supplied JS execution), the `@duckduckgo/autoconsent` npm package exports (ESM: `autoconsent.esm.js`, Playwright-specific: undetermined).
- **Why this agent**: frontend-minion evaluated four consent approaches in Phase 0017 and recommended autoconsent. They have the domain knowledge to specify the exact integration pattern, detect success/failure, and estimate timing impact within the 30s budget.

#### Consultation 2: WACZ Bundle Extension for Dual Screenshots
- **Agent**: data-minion
- **Planning question**: How should the WACZ bundle, `datapackage.json`, and KV record be extended to accommodate two screenshots and the `captureSettings` metadata? Specifically: (a) Should both screenshots be separate WARC resource records in the same WARC file, or a single record with multipart content? (b) What should the WARC-Target-URI scheme be for before/after screenshots (`urn:wrl:screenshot-before:{url}` / `urn:wrl:screenshot-after:{url}`)? (c) Define the `captureSettings` schema for `datapackage.json` -- fields, types, versioning. (d) How should `completeCapture()` in `kv.js` evolve its `artifacts` object to reference two screenshots in R2? (e) What is the impact on the existing CDXJ index, bundle hash, and signature chain?
- **Context to provide**: `src/wacz.js` (full), `src/warc.js` (full), `src/kv.js` (`completeCapture()` and `artifacts` shape), `src/cdxj.js` (CDXJ index builder), current WARC record order (warcinfo, resource/HTML, metadata/headers, resource/screenshot), the `datapackage.json` schema from `buildWacz()`, Phase 0017 data-minion recommendation for `captureSettings` with `settingsVersion`.
- **Why this agent**: data-minion designed the `captureSettings` metadata schema in Phase 0017 and understands the WACZ/WARC record structure, canonicalization, and how the Ed25519 signature chain works. The WACZ extension is the hardest-to-reverse decision in this feature (signature covers the structure).

#### Consultation 3: Security Review of Autoconsent Integration
- **Agent**: security-minion
- **Planning question**: Review the proposed autoconsent integration against the 12 security constraints from Phase 0017. Specifically: (a) Confirm that injecting autoconsent via `page.evaluate()` or `page.addInitScript()` with the library's own code (not caller-supplied) satisfies constraint #1 (no caller-supplied JS execution). (b) Assess whether autoconsent's internal behavior (DOM manipulation to dismiss banners) creates any new attack surface -- could a malicious page trick autoconsent into performing unintended actions? (c) The library is MPL-2.0 -- any license concerns with bundling into an Apache-2.0 project's Worker script? (d) Should the `captureSettings` metadata include a hash or version of the autoconsent library used, for reproducibility? (e) Any concerns with the library executing in the page context alongside the target page's own scripts?
- **Context to provide**: The 12 security constraints (listed in issue), `src/capture.js` (BrowserContext isolation model, security constraints documented in header), the `serviceWorkers: 'block'` and cross-domain navigation blocking already in place, MPL-2.0 license terms, the fact that autoconsent manipulates DOM elements (clicks buttons, checks checkboxes) in the page.
- **Why this agent**: security-minion defined the 12 constraints in Phase 0017 and must validate that the implementation approach satisfies them. The autoconsent library executing in the page context is a new trust boundary that needs explicit review.

#### Consultation 4: API Spec and Verification Page Updates
- **Agent**: api-design-minion
- **Planning question**: How should the API responses and OpenAPI spec evolve to expose dual-screenshot and consent metadata? Specifically: (a) Should the `GET /v1/captures/:id` response's `artifacts` object change from `{ screenshot: "..." }` to `{ screenshotBefore: "...", screenshotAfter: "..." }`, or use an array, or a nested object? (b) How should the verification endpoint response include consent handling metadata? (c) What backward compatibility concerns exist -- if existing consumers expect `artifacts.screenshot`, how do we handle the transition? (d) Should the `GET /v1/captures/:id/screenshot` convenience endpoint (if it exists) serve the before or after screenshot by default?
- **Context to provide**: `openapi.yaml` (current schema), `src/kv.js` (`completeCapture` artifacts shape), `src/verify-page.js` (HTML verification page that currently shows one screenshot), the constraint that the `{ url }` POST API contract is unchanged.
- **Why this agent**: api-design-minion designed the parameter extension approach in Phase 0017. They need to define the schema evolution that maintains backward compatibility while exposing the new dual-screenshot artifacts and consent metadata.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The dual-screenshot feature touches the core capture pipeline (`capture.js`), WACZ assembly (`wacz.js`), WARC construction (`warc.js`), KV layer (`kv.js`), verification page (`verify-page.js`), and verification logic (`verify.js`). The existing 22 test files include unit tests for each module. test-minion should advise on: (a) how to mock autoconsent behavior in the existing `stubRenderer` pattern, (b) whether the WACZ round-trip tests need updating for dual screenshots, (c) integration test strategy for the consent detection/dismissal flow.

- **Security**: Include security-minion for planning (Consultation 3 above). Autoconsent executing in the page context is a new trust boundary. The 12 Phase 0017 constraints are binding.

- **Usability -- Strategy**: ALWAYS include. Planning question for ux-strategy-minion: How should the verification page present dual screenshots to maximize evidence value? Specifically: (a) Should both screenshots always be shown, or should the "after" screenshot be primary with "before" in a disclosure/toggle? (b) How should consent handling status be communicated to a non-technical verifier (e.g., "Cookie banner was automatically dismissed" vs. technical metadata)? (c) When autoconsent fails (single screenshot), should the UI indicate this is a degraded capture, or present it normally since the evidence value is unchanged from the current behavior?

- **Usability -- Design**: Do NOT include ux-design-minion for planning. The verification page changes are incremental (adding a second screenshot section and consent status text). No new UI patterns, interaction designs, or visual hierarchy decisions. The existing page structure (`verify-page.js`) handles this with minor additions. Similarly, do NOT include accessibility-minion -- the existing verification page already has WCAG-compliant patterns (sr-only, aria-labels, focus-visible). Adding a second image with alt text follows established patterns.

- **Documentation**: ALWAYS include. Planning question for software-docs-minion: What documentation artifacts need updating? The `openapi.yaml` changes are the primary doc surface. Additionally: (a) Should the `captureSettings` schema be documented in a standalone schema reference, or is inline OpenAPI documentation sufficient? (b) The WARC record order comment in `warc.js` needs updating. (c) Do the JSDoc comments on `buildWacz()`, `buildWarc()`, `performCapture()`, and `completeCapture()` need parameter/return type updates? (d) Should `ARCHITECTURE.md` be created or updated given this is the first feature that adds a new pipeline stage to the capture flow?

- **Observability**: Do NOT include observability-minion for planning. The existing `log()` calls in `capture.js` already follow a structured logging pattern (Coralogix). The new consent handling step adds 2-3 new log events (`capture.consent.detected`, `capture.consent.dismissed`, `capture.consent.failed`) following the exact same pattern. No new observability strategy needed -- this is additive.

### Anticipated Approval Gates

1. **WACZ bundle schema and `captureSettings` metadata design** (MUST gate) -- Hard to reverse (signed into WACZ bundles, immutable once deployed), high blast radius (WARC construction, WACZ assembly, verification logic, KV storage, API responses, and verification page all depend on this schema). This is the most critical design decision in the feature. data-minion produces, security-minion validates, api-design-minion aligns API response shapes.

2. **Autoconsent integration approach** (OPTIONAL gate) -- Moderately hard to reverse (library integration pattern, bundle strategy), medium blast radius (only `capture.js` depends on this directly, but timing affects the 30s budget). Gate primarily because multiple valid integration approaches exist (addInitScript vs. evaluate, timing of screenshot-after relative to dismiss).

### Rationale

This feature has four distinct domains that benefit from specialist planning input:

1. **Browser automation** (frontend-minion): The autoconsent integration is the novel technical challenge. How to inject the library, detect success/failure, and sequence the dual screenshots within the timing budget requires Playwright expertise.

2. **Data architecture** (data-minion): Extending the WACZ bundle with a second screenshot and `captureSettings` metadata is the hardest-to-reverse decision. The WARC record structure, CDXJ index, `datapackage.json` schema, and Ed25519 signature chain all need coordinated changes.

3. **Security validation** (security-minion): The 12 Phase 0017 constraints are binding. Autoconsent executing in the page context is a new trust boundary that needs explicit review against those constraints.

4. **API evolution** (api-design-minion): The response schema changes affect backward compatibility and how downstream consumers (future Web UI, MCP server) access dual screenshots and consent metadata.

The cross-cutting agents (test-minion, ux-strategy-minion, software-docs-minion) add planning value by ensuring the execution plan accounts for test strategy, evidence presentation, and documentation updates from the start.

### Scope

**In scope:**
- Autoconsent library integration into `defaultRenderer()` in `capture.js`
- Dual screenshot capture pipeline (before/after consent dismissal)
- WARC record extension for two screenshots in `warc.js`
- WACZ bundle extension (`datapackage.json` with `captureSettings`) in `wacz.js`
- CDXJ index updates for two screenshot records in `cdxj.js`
- R2 storage of two screenshot artifacts in `capture.js`
- KV record extension (`artifacts`, consent metadata) in `kv.js`
- Verification page updates (dual screenshot display, consent status) in `verify-page.js`
- Verification logic updates for dual-screenshot WACZ bundles in `verify.js`
- OpenAPI spec updates in `openapi.yaml`
- Test updates across all affected test files
- `@duckduckgo/autoconsent` dependency addition in `package.json`
- Evolution log entry (`docs/evolution/0025-dual-screenshot-consent/`)

**Out of scope:**
- Caller-controlled consent parameters (server-controlled only)
- Caller-provided cookie injection
- Viewport parameterization, wait condition parameterization
- Autoconsent `extra` bundle (filterlist rules)
- General capture parameterization API
- Changes to the `POST /v1/captures` request body

### External Skill Integration

No external skills detected in project.
