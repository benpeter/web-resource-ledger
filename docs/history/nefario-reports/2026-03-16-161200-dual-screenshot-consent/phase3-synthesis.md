# Phase 3: Synthesis -- Dual-Screenshot Cookie Consent Dismissal

## Delegation Plan

**Team name**: dual-screenshot-consent
**Description**: Implement dual-screenshot capture with server-controlled cookie consent dismissal via DuckDuckGo's autoconsent library. Every full capture produces a before-screenshot (first-visit state), attempts consent dismissal, and produces an after-screenshot when a CMP is found and dismissed. Both screenshots and consent metadata are stored in R2, KV, WACZ bundles, and exposed through the API and verification page.

---

### Task 1: Autoconsent integration and dual-screenshot renderer

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task: Implement autoconsent integration and dual-screenshot capture pipeline

    You are modifying the WRL capture pipeline to produce dual screenshots -- one before and one after cookie consent dismissal using DuckDuckGo's autoconsent library.

    ### What to do

    **Step 1: Vendor the autoconsent library**

    Install `@duckduckgo/autoconsent` as a dependency in `package.json`. Then create a new module `src/consent.js` that:

    1. Reads the content of `node_modules/@duckduckgo/autoconsent/dist/autoconsent.playwright.js` at build time and exports it as a string constant `AUTOCONSENT_SCRIPT`. Since this is a Cloudflare Worker, use a build-time import pattern. The simplest approach: copy the file to `src/vendor/autoconsent.playwright.js` and import as text. Wrangler supports `import contentScript from './vendor/autoconsent.playwright.js'` which will inline it as a string.

    2. Export a constant `AUTOCONSENT_VERSION` read from the package.json of the installed autoconsent package at build time.

    3. Export an async function `dismissCookieConsent(page)` that:
       - Sets up `page.exposeBinding('autoconsentSendMessage', callback)` for the message channel
       - Injects the autoconsent script via `page.evaluate(AUTOCONSENT_SCRIPT)`
       - Handles the message protocol: `init` (respond with config and rules), `cmpDetected`, `popupFound`, `optOutResult`, `autoconsentDone`, `autoconsentError`, `eval`, `report`
       - For the `init` response, use config: `{ enabled: true, autoAction: 'optOut', disabledCmps: [], enablePrehide: false, detectRetries: 5, enableCosmeticRules: false }`
       - **SECURITY: For `eval` messages, validate `msg.type` against an allowlist of: `['init', 'cmpDetected', 'popupFound', 'optOutResult', 'autoconsentDone', 'autoconsentError', 'eval', 'selfTestResult', 'report']`. Ignore unknown message types.**
       - For `eval` messages specifically: evaluate `msg.code` via `frame.evaluate(msg.code)` and respond with `evalResp`. The code comes from vendored rules, not the caller. This matches the upstream Playwright runner pattern.
       - Enforces a hard timeout of 8000ms (`CONSENT_TIMEOUT_MS`)
       - Returns a structured result:
         ```js
         // Success: CMP found and dismissed
         { status: 'dismissed', cmp: 'cookiebot', isCosmetic: false, durationMs: 850 }
         // No CMP found
         { status: 'none' }
         // Timeout
         { status: 'timeout', cmpDetected: true, popupFound: false }
         ```

    **Step 2: Modify `defaultRenderer()` in `src/capture.js`**

    Change the happy path (after successful `networkidle` navigation) from:
    ```
    navigate -> screenshot -> html -> return
    ```
    To:
    ```
    navigate -> screenshot (before) -> dismissCookieConsent() -> screenshot (after, if dismissed) -> html -> return
    ```

    Specific changes:

    1. Import `dismissCookieConsent` from `./consent.js`
    2. Reduce `NAV_TIMEOUT_MS` from 25000 to 20000 (gives consent phase its 8s budget within the 30s total)
    3. After the existing `page.screenshot()` call (line 425), add the consent phase:
       - Call `dismissCookieConsent(page)`
       - If result.status is `'dismissed'` or `'timeout'` with `popupFound: true`, take a second screenshot
       - If result.status is `'none'`, skip the second screenshot (no banner to dismiss)
    4. Change the return shape from `{ screenshot, html, partial, render }` to:
       ```js
       {
         screenshot,      // Uint8Array -- always the BEST screenshot (after if dismissed, before otherwise)
         html,
         partial: false,
         render: { ... },
         consent: {       // NEW -- always present on full captures
           status,        // 'dismissed' | 'none' | 'timeout'
           cmp,           // string | null
           durationMs,    // number
         },
         screenshotBefore, // Uint8Array | null -- present only when consent was dismissed
       }
       ```
       When consent is dismissed: `screenshot` = after, `screenshotBefore` = before.
       When consent is NOT dismissed (none/timeout without popup): `screenshot` = the only screenshot, `screenshotBefore` = null.
       This way `screenshot` is always the "best available" image -- matching api-design-minion's backward compatibility design.

    5. **Partial captures** (the `catch (navError)` timeout path): do NOT attempt consent dismissal. Partial captures have no time budget for it. Return the existing shape with `consent: null` and `screenshotBefore: null`.

    6. Update the `categorizeError` function if needed for new error patterns from autoconsent.

    **Step 3: Modify `performCapture()` in `src/capture.js`**

    Update the orchestration to handle dual screenshots:

    1. After destructuring the renderer result, extract `screenshotBefore` and `consent`:
       ```js
       const { screenshot, html, partial, render, consent, screenshotBefore } = renderResult.value;
       ```

    2. R2 storage: store both screenshots when `screenshotBefore` is present:
       ```js
       const prefix = `captures/${captureId}`;
       await Promise.all([
         env.BUCKET.put(`${prefix}/screenshot.png`, screenshot),
         screenshotBefore ? env.BUCKET.put(`${prefix}/screenshot-before.png`, screenshotBefore) : Promise.resolve(),
         env.BUCKET.put(`${prefix}/rendered.html`, html, { ... }),
         headers ? env.BUCKET.put(`${prefix}/headers.json`, JSON.stringify(headers)) : Promise.resolve(),
       ]);
       ```

    3. Build the `artifacts` object for KV:
       ```js
       const artifacts = {
         screenshot: `${prefix}/screenshot.png`,
         ...(screenshotBefore ? { screenshotBefore: `${prefix}/screenshot-before.png` } : {}),
         html: `${prefix}/rendered.html`,
         ...(headers ? { headers: `${prefix}/headers.json` } : {}),
       };
       ```

    4. Build `captureSettings` for non-partial captures:
       ```js
       const captureSettings = consent ? {
         version: 1,
         consent: {
           library: '@duckduckgo/autoconsent',
           libraryVersion: AUTOCONSENT_VERSION,
           action: 'optOut',
           result: consent.status === 'dismissed' ? 'success' : (consent.status === 'none' ? 'notDetected' : 'failed'),
           ...(consent.cmp ? { cmpDetected: consent.cmp } : {}),
         },
         screenshots: {
           before: true,
           after: !!screenshotBefore,
         },
       } : null;
       ```

    5. Pass `captureSettings` to `buildWacz()` and `completeCapture()` (both functions will be updated in Task 2).

    6. Update the WACZ artifacts object to use the new field names:
       ```js
       const waczArtifacts = {
         screenshotBefore: screenshotBefore || screenshot, // WARC always uses "before" URI
         screenshotAfter: screenshotBefore ? screenshot : null, // only when we have both
         html,
         headers,
         captureSettings,
       };
       ```

    7. Update log entries to include consent metadata: add `consentStatus`, `consentCmp`, `consentDurationMs` fields to the `capture.success` log event.

    ### Context

    **Files to modify:**
    - `src/capture.js` -- main pipeline, `defaultRenderer()`, `performCapture()`
    - `package.json` -- add `@duckduckgo/autoconsent` dependency

    **Files to create:**
    - `src/consent.js` -- autoconsent integration module
    - `src/vendor/autoconsent.playwright.js` -- vendored script (copy from node_modules after install)

    **Key constraints:**
    - The "before" screenshot MUST be taken BEFORE injecting autoconsent. This is the #1 security/evidence requirement.
    - `enablePrehide: false` in the autoconsent config -- prevents CSS from hiding the banner before the before-screenshot.
    - `enableCosmeticRules: false` -- cosmetic-only rules hide without dismissing, which is misleading for evidence.
    - The 30s `ctx.waitUntil` budget: 20s nav + 8s consent + 2s for screenshots/HTML/KV/R2.
    - `page.exposeBinding()` creates a callable from page context to Worker context. Validate message types against an allowlist.
    - The partial capture path (navigation timeout) skips consent entirely.
    - Cross-domain navigation blocking (existing `context.route()`) stays unchanged. Some CMPs with cross-domain redirect flows will fail silently -- this is correct behavior.
    - `serviceWorkers: 'block'` stays unchanged.

    **What NOT to do:**
    - Do not modify `src/warc.js`, `src/wacz.js`, `src/kv.js`, or `src/index.js` -- those are handled in Task 2.
    - Do not modify test files -- those are handled in Phase 6.
    - Do not add compact rules (the 932KB JSON). The built-in dynamic CMP detectors cover major providers. Compact rules can be added later.
    - Do not use `addInitScript()` -- inject after navigation + before-screenshot, not before navigation.
    - Do not attempt consent on partial captures.

- **Deliverables**:
  - `src/consent.js` -- new module with `dismissCookieConsent(page)`, `AUTOCONSENT_SCRIPT`, `AUTOCONSENT_VERSION`
  - `src/vendor/autoconsent.playwright.js` -- vendored autoconsent script
  - Modified `src/capture.js` -- dual-screenshot pipeline, `NAV_TIMEOUT_MS` reduced to 20000
  - Modified `package.json` -- new dependency
- **Success criteria**:
  - `defaultRenderer()` returns `{ screenshot, screenshotBefore, html, partial, render, consent }`
  - `performCapture()` stores both screenshots in R2 when consent is dismissed
  - Before-screenshot is taken BEFORE autoconsent injection
  - Partial captures skip consent entirely
  - Consent has an 8s hard timeout

---

### Task 2: WARC, WACZ, KV, and API layer updates for dual screenshots

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Update data layer and API for dual-screenshot support

    You are updating the WARC builder, WACZ assembler, KV storage, API routes, and OpenAPI spec to support dual screenshots and `captureSettings` metadata from the consent dismissal feature.

    ### What to do

    **Step 1: Update `src/warc.js` -- dual screenshot WARC records**

    1. Change the `buildWarc()` function signature:
       ```js
       export async function buildWarc(url, captureDate, artifacts)
       ```
       Where `artifacts` is now `{ screenshotBefore, screenshotAfter, html, headers, captureSettings }`.

    2. Update record construction:
       - Record 4 becomes: screenshot-before PNG with URI `urn:wrl:screenshot:before:${url}`
       - Add conditional Record 5: screenshot-after PNG with URI `urn:wrl:screenshot:after:${url}` (only when `screenshotAfter` is non-null)
       - Add conditional Record 6: captureSettings metadata with URI `urn:wrl:capture-settings:${url}`, Content-Type `application/json`, WARC-Type `metadata`, WARC-Refers-To pointing to the warcinfo record ID

    3. Update the header comment to document the new record order:
       ```
       * Record order:
       *   1. warcinfo     (software metadata)
       *   2. resource     (rendered HTML)
       *   3. metadata     (HTTP headers, if present)
       *   4. resource     (screenshot-before PNG)
       *   5. resource     (screenshot-after PNG, if consent dismissed)
       *   6. metadata     (captureSettings JSON, if present)
       ```

    4. Update the JSDoc `@param` for `artifacts`.

    **Step 2: Update `src/wacz.js` -- captureSettings in datapackage.json**

    1. Change the `buildWacz()` function signature to match the new artifacts shape:
       ```js
       export async function buildWacz(url, captureDate, artifacts, env)
       ```
       Where `artifacts` is `{ screenshotBefore, screenshotAfter, html, headers, captureSettings }`.

    2. Pass the new artifacts shape to `buildWarc()`.

    3. Add `captureSettings` to the `datapackage` object (before `resources`):
       ```js
       const datapackage = {
         profile: 'data-package',
         wacz_version: '1.1.1',
         title: `WRL capture of ${url}`,
         software: 'WRL/0.1',
         created: captureDate,
         mainPageUrl: url,
         mainPageDate: captureDate,
         ...(artifacts.captureSettings ? { captureSettings: artifacts.captureSettings } : {}),
         resources: [ ... ],
       };
       ```
       The `captureSettings` is automatically included in the canonicalized datapackage and therefore covered by the Ed25519 signature. No signing changes needed.

    4. Update the header comment and JSDoc.

    **Step 3: Update `src/kv.js` -- completeCapture with captureSettings**

    1. Add `captureSettings` parameter to `completeCapture()`:
       ```js
       export async function completeCapture(kv, captureId, artifacts, wacz = null, renderQuality = null, render = null, captureSettings = null)
       ```

    2. Spread it into the KV value:
       ```js
       const value = {
         ...existing,
         status: 'complete',
         completedAt: new Date().toISOString(),
         artifacts,
         ...(wacz ? { wacz } : {}),
         ...(renderQuality ? { renderQuality } : {}),
         ...(render ? { render } : {}),
         ...(captureSettings ? { captureSettings } : {}),
       };
       ```

    3. Update the JSDoc to document the new parameter and updated artifacts shape.

    **Step 4: Update `src/index.js` -- API routes and responses**

    1. **Artifact route regex**: Change from:
       ```js
       /^\/v1\/captures\/(cap_[a-f0-9]{32})\/artifacts\/(screenshot|html|headers|wacz)$/
       ```
       To:
       ```js
       /^\/v1\/captures\/(cap_[a-f0-9]{32})\/artifacts\/(screenshot|screenshot-before|html|headers|wacz)$/
       ```

    2. **`handleGetCaptureArtifact()`**: Add kebab-to-camelCase mapping:
       ```js
       const artifactKey = artifactName === 'screenshot-before' ? 'screenshotBefore' : artifactName;
       const r2Key = artifactKey === 'wacz' ? record.wacz?.key : record.artifacts?.[artifactKey];
       ```

    3. **Content types and filenames**: Add entries for `screenshot-before`:
       ```js
       const contentTypes = {
         screenshot: 'image/png',
         'screenshot-before': 'image/png',
         html: 'text/plain',
         headers: 'application/json',
         wacz: 'application/wacz+zip',
       };
       const filenames = {
         screenshot: 'screenshot.png',
         'screenshot-before': 'screenshot-before.png',
         html: 'rendered.html',
         headers: 'headers.json',
         wacz: 'bundle.wacz',
       };
       ```

    4. **`handleGetCapture()`**: Add `screenshotBefore` artifact URL and `captureSettings` to response:
       ```js
       const artifacts = {
         screenshot: `${artifactBase}/screenshot`,
         html: `${artifactBase}/html`,
       };
       if (record.artifacts?.screenshotBefore) {
         artifacts.screenshotBefore = `${artifactBase}/screenshot-before`;
       }
       if (record.artifacts?.headers) {
         artifacts.headers = `${artifactBase}/headers`;
       }
       ```
       Add `captureSettings` to the response body:
       ```js
       if (record.captureSettings) {
         body.captureSettings = record.captureSettings;
       }
       ```

    5. **`handleVerifyCapture()`**: Add `captureSettings` to the verification JSON response body:
       ```js
       const body = {
         verified: result.verified,
         capture: { ... },
         signing: result.capture || null,
         checks: result.checks,
         ...(record.captureSettings ? { captureSettings: record.captureSettings } : {}),
       };
       ```

    6. **`completeCapture()` call in `capture.js`**: Update the call to pass `captureSettings`:
       ```js
       await completeCapture(env.KV, captureId, artifacts, waczInfo, renderQuality, render || null, captureSettings);
       ```
       (Note: Task 1 already prepares the `captureSettings` object; this task wires it through.)

    **Step 5: Update `openapi.yaml`**

    1. Bump `info.version` from `0.3.0` to `0.4.0`.

    2. Add new schemas:
       - `ConsentHandling` with properties: `library` (string, const "autoconsent"), `action` (string, enum: [optOut]), `result` (string, enum: [success, notDetected, failed]), `cmpDetected` (string, nullable)
       - `CaptureSettings` with properties: `version` (integer, const 1), `consent` ($ref ConsentHandling), `screenshots` (object with `before` boolean, `after` boolean)

    3. Modify `CaptureArtifacts`: add optional `screenshotBefore` (string, format: uri).

    4. Modify `CaptureRecord`: add optional `captureSettings` ($ref CaptureSettings).

    5. Update artifact name enum to include `screenshot-before`.

    6. Update response examples to show dual-screenshot captures.

    7. Add `captureSettings` to the verification response schema.

    ### Context

    **Files to modify:**
    - `src/warc.js` -- dual screenshot records, captureSettings metadata record
    - `src/wacz.js` -- captureSettings in datapackage.json
    - `src/kv.js` -- completeCapture() signature
    - `src/index.js` -- API routes, response builders, verification
    - `openapi.yaml` -- schemas, examples, version bump

    **Key constraints:**
    - `artifacts.screenshot` in the KV record and API response ALWAYS points to the best-available screenshot (post-dismissal when available). This is backward compatible -- old consumers see the same field.
    - `artifacts.screenshotBefore` is optional, present only when consent was dismissed.
    - WARC URIs change: `urn:wrl:screenshot:{url}` becomes `urn:wrl:screenshot:before:{url}` for all new captures. Old bundles with the legacy URI remain valid.
    - The Ed25519 signature chain is unchanged. `captureSettings` is automatically covered because it's a top-level field in `datapackage.json` which feeds into `canonicalize() -> sha256 -> sign`.
    - No changes to the signing module, CDXJ module, or canonical-json module.
    - The CDXJ index (`src/cdxj.js`) is record-agnostic -- it indexes whatever `recordMeta` it receives. No changes needed there.

    **What NOT to do:**
    - Do not modify `src/consent.js` or `src/capture.js` beyond the `completeCapture()` call wiring -- Task 1 handles those.
    - Do not modify test files -- Phase 6 handles that.
    - Do not modify `src/verify-page.js` -- Task 3 handles the verification page.
    - Do not rename existing R2 keys or migrate old KV records. Old records with `artifacts.screenshot` remain valid.

- **Deliverables**:
  - Modified `src/warc.js` -- dual screenshot WARC records, captureSettings metadata record
  - Modified `src/wacz.js` -- captureSettings in datapackage.json
  - Modified `src/kv.js` -- new `captureSettings` parameter
  - Modified `src/index.js` -- new artifact route, response extensions
  - Modified `openapi.yaml` -- new schemas, version bump
- **Success criteria**:
  - `buildWarc()` produces two screenshot records and a captureSettings metadata record
  - `buildWacz()` includes captureSettings in datapackage.json, covered by signature
  - `completeCapture()` accepts and stores captureSettings
  - GET /v1/captures/:id returns `screenshotBefore` and `captureSettings` when present
  - GET /v1/captures/:id/artifacts/screenshot-before serves the before screenshot
  - Verification JSON response includes `captureSettings`
  - OpenAPI spec reflects all changes

---

### Task 3: Verification page dual-screenshot display and consent check

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |

    ## Task: Update verification page for dual screenshots and consent metadata

    You are updating the verification HTML page (`src/verify-page.js`) to display dual screenshots and consent handling status.

    ### What to do

    **Step 1: Add consent check to the checks list**

    The page already has a checks rendering system with `CHECK_LABELS` and `CHECK_DESCS` maps, and SVG icons for pass/fail/skip states. Add consent handling as a check:

    1. Add to `CHECK_LABELS`:
       ```js
       consentHandling: 'Cookie consent handled',
       ```

    2. Add to `CHECK_DESCS`:
       ```js
       consentHandling: 'The capture dismissed a cookie consent banner to reveal the page content.',
       ```

    3. The consent check comes from the verification response's `captureSettings.consent.result` field. In the `buildResult()` function, after building the standard checks from `verifyData.checks`, append a consent check if `verifyData.captureSettings` exists:

       ```js
       // Build consent check from captureSettings (if present)
       var captureSettings = verifyData.captureSettings;
       if (captureSettings && captureSettings.consent) {
         var consentResult = captureSettings.consent.result;
         if (consentResult === 'success') {
           // CMP found and dismissed -- show as pass
           checks = checks.concat([{
             name: 'consentHandling',
             status: 'pass',
             detail: captureSettings.consent.cmpDetected
               ? 'Detected: ' + captureSettings.consent.cmpDetected
               : null,
           }]);
         } else if (consentResult === 'failed') {
           // CMP found but dismissal failed -- show as skip
           checks = checks.concat([{
             name: 'consentHandling',
             status: 'skip',
             detail: 'A consent banner was detected but could not be dismissed.',
           }]);
         }
         // When consentResult === 'notDetected': omit the check entirely.
         // No banner was found -- nothing to report.
         // When captureSettings is absent (pre-feature capture): also omit.
       }
       ```

       Update the `CHECK_DESCS` override for the skip case:
       ```js
       // In CHECK_DESCS, add alternate for skip:
       // Actually, use the detail field for the specific message. The desc stays generic.
       ```

       Actually, simpler: keep `CHECK_DESCS.consentHandling` as the pass description. When status is skip, the detail field carries the specific message. Modify `renderChecks()` to use `CHECK_DESCS` for pass, and rely on `c.detail` for skip/fail descriptions.

    **Step 2: Show dual screenshots**

    The current page shows a single screenshot from `retrievalData.artifacts.screenshot`. For dual screenshots:

    1. In `buildResult()`, check for `retrievalData.artifacts.screenshotBefore`:
       ```js
       var screenshotBeforeUrl = retrievalData
         ? (retrievalData.artifacts && retrievalData.artifacts.screenshotBefore
            ? retrievalData.artifacts.screenshotBefore : null)
         : null;
       ```

    2. The primary screenshot (`screenshot`) is always shown at full column width, exactly as today. When `screenshotBeforeUrl` exists, add a `<details>` disclosure below the primary screenshot:

       The screenshot section HTML becomes:
       ```html
       <section aria-label="Screenshot"><h2>Screenshot</h2>
         <div id="screenshot-wrap"></div>
         <p class="screenshot-caption" id="screenshot-caption"></p>
         <!-- Before screenshot disclosure, only when present -->
         <div id="screenshot-before-wrap"></div>
       </section>
       ```

    3. In the `populate()` function, after rendering the primary screenshot:
       - If consent was dismissed, add a caption below: "Page after cookie consent dismissal"
       - If `screenshotBeforeUrl` exists, build a `<details>` element:
         ```html
         <details>
           <summary>Before consent dismissal</summary>
           <img class="screenshot-img" alt="Screenshot of {url} captured on {date}, showing original cookie consent banner" src="{screenshotBeforeUrl}">
         </details>
         ```
       Use the DOM-safe pattern (createElement, textContent, setAttribute) -- never innerHTML for URLs.

    4. **Alt text differentiation** for accessibility:
       - Primary screenshot: "Screenshot of {url} captured on {date}, after cookie consent dismissal" (when consent was dismissed)
       - Primary screenshot: "Screenshot of {url} captured on {date}" (when no consent dismissal, same as today)
       - Before screenshot: "Screenshot of {url} captured on {date}, showing original cookie consent banner"

    **Step 3: Add "Capture details" disclosure section**

    Below the checks section and above the existing "Cryptographic details" disclosure, add a new disclosure for capture conditions:

    1. Only render when `captureSettings` is present (presence-driven, not version-switched).

    2. Content:
       ```
       Cookie consent:  Dismissed (autoconsent, success)    -- or "Not detected" or "Attempted, failed"
       Viewport:        1280 x 720
       Render quality:  Full                                -- from capture.renderQuality
       ```

    3. Use the existing `<details><summary>` pattern with the same CSS.

    4. Build the text from `verifyData.captureSettings`:
       - Consent: map `result` to human label: `success` -> "Dismissed", `notDetected` -> "Not detected", `failed` -> "Attempted, failed"
       - Library: show as "(autoconsent)" parenthetical
       - CMP: append detected CMP name if present, e.g., "Dismissed (autoconsent, Cookiebot)"

    **Step 4: Backward compatibility**

    - Pre-feature captures (no `captureSettings`): page renders exactly as today. No consent check row, no before-screenshot disclosure, no "Capture details" section.
    - Single-screenshot captures (consent failed or not detected): primary screenshot shown normally. No disclosure. Consent check shown only if CMP was detected and failed.
    - Presence-driven rendering throughout: `if (data exists) { render it }`.

    ### Context

    **File to modify:** `src/verify-page.js`

    The file generates a complete HTML page as a string. It uses vanilla JS with a mix of innerHTML for structure and DOM APIs (createElement, textContent) for user data. This dual approach is deliberate: innerHTML for the static skeleton, DOM APIs for any data that could contain user-controlled content (URLs, dates).

    Key patterns to follow:
    - `safeUrl()` validates URLs before using them in `img.src` or `a.href`
    - `fmtDate()` formats ISO dates for display
    - `CHECK_LABELS` / `CHECK_DESCS` map check names to human labels
    - SVG icons: `SVG_CHECK` (pass), `SVG_X` (fail), `SVG_DASH` (skip)
    - The page fetches both `/v1/verify/{id}` (verification data) and `/v1/captures/{id}` (retrieval data) on load

    **CSS additions needed:**
    - `.screenshot-caption` -- small gray text below screenshot (reuse `.meta-time` or `.check-desc` styling: `font-size: 0.875rem; color: #6d6d6d`)
    - The `<details>` within the screenshot section should have less padding than the top-level details (maybe no extra padding, inherit from section)

    **What NOT to do:**
    - Do not use frameworks, jQuery, or external libraries
    - Do not modify the existing checks rendering logic for the three crypto checks
    - Do not add "degraded" language, yellow warnings, or caution icons for failed consent
    - Do not use terms like "autoconsent", "CMP", "DuckDuckGo", or "opt-out" in user-visible text (except in the Capture details disclosure for power users)
    - Do not modify other source files -- this task is scoped to `src/verify-page.js`

- **Deliverables**: Modified `src/verify-page.js` with consent check, dual screenshot display, and capture details disclosure
- **Success criteria**:
  - Dual-screenshot captures show primary screenshot + disclosure with before-screenshot
  - Consent check appears in checks list (pass for dismissed, skip for failed, absent for not detected)
  - Pre-feature captures render identically to today
  - Alt text distinguishes before/after screenshots for screen readers
  - "Capture details" disclosure shows consent metadata for power users

---

### Task 4: Extract shared test fixtures and add consent-aware stubs

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |

    ## Task: Extract shared test fixtures and add dual-screenshot renderer stubs

    You are consolidating duplicated test fixtures across the test suite and adding new renderer stubs for the dual-screenshot consent feature.

    ### What to do

    **Step 1: Create `test/fixtures.js`**

    Extract the duplicated constants and renderer stubs that appear in `test/capture.test.js`, `test/wacz.test.js`, `test/verify-html.test.js`, and `test/capture-integration.test.js` into a shared module:

    ```js
    // test/fixtures.js -- shared test constants and renderer stubs

    export const TEST_URL = 'https://example.com';
    export const TEST_IP = '93.184.216.34';
    export const TEST_ORIGIN = 'https://example.com';

    export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    export const PNG_BYTES_ALT = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]); // different last byte
    export const TEST_HTML = '<html><body>test</body></html>';

    // Legacy renderer (no consent field -- pre-feature behavior)
    export const stubRenderer = async () => ({
      screenshot: PNG_BYTES,
      html: TEST_HTML,
    });

    // Full capture with successful consent dismissal (dual screenshots)
    export const dualScreenshotRenderer = async () => ({
      screenshot: PNG_BYTES_ALT,      // after (best available)
      screenshotBefore: PNG_BYTES,     // before (with banner)
      html: TEST_HTML,
      partial: false,
      render: { waitUntilReached: 'networkidle', timedOut: false, durationMs: 3500 },
      consent: {
        status: 'dismissed',
        cmp: 'cookiebot',
        durationMs: 850,
      },
    });

    // Consent detected but dismissal failed
    export const consentFailedRenderer = async () => ({
      screenshot: PNG_BYTES,
      screenshotBefore: null,
      html: TEST_HTML,
      partial: false,
      render: { waitUntilReached: 'networkidle', timedOut: false, durationMs: 4200 },
      consent: {
        status: 'timeout',
        cmp: null,
        durationMs: 8000,
      },
    });

    // No consent banner detected
    export const consentNotDetectedRenderer = async () => ({
      screenshot: PNG_BYTES,
      screenshotBefore: null,
      html: TEST_HTML,
      partial: false,
      render: { waitUntilReached: 'networkidle', timedOut: false, durationMs: 2800 },
      consent: {
        status: 'none',
        cmp: null,
        durationMs: 2500,
      },
    });

    // Partial capture (consent not attempted)
    export const partialRenderer = async () => ({
      screenshot: PNG_BYTES,
      screenshotBefore: null,
      html: TEST_HTML,
      partial: true,
      render: { waitUntilReached: 'domcontentloaded', timedOut: true, durationMs: 25100 },
      consent: null,
    });
    ```

    **Step 2: Update existing test files to import from fixtures**

    Update these files to import constants and stubs from `test/fixtures.js` instead of defining their own:
    - `test/capture.test.js` -- replace local `PNG_BYTES`, `TEST_HTML`, `stubRenderer`, `TEST_URL`, `TEST_IP`, `TEST_ORIGIN`
    - `test/wacz.test.js` -- replace local `PNG_BYTES`, `TEST_HTML`, `stubRenderer`, `TEST_URL`, `TEST_IP`, `TEST_ORIGIN`
    - `test/verify-html.test.js` -- replace local constants if present
    - `test/capture-integration.test.js` -- replace local constants if present

    Each test file may have its own TEST_ID (different capture ID per test suite to avoid KV collisions) -- leave those in the individual files.

    **Step 3: Update R2 cleanup in test setup**

    In any `beforeEach` blocks that clean up R2 artifacts, add `screenshot-before.png` to the cleanup list:
    ```js
    await Promise.all([
      env.BUCKET.delete(`${prefix}/screenshot.png`),
      env.BUCKET.delete(`${prefix}/screenshot-before.png`),  // NEW
      env.BUCKET.delete(`${prefix}/rendered.html`),
      env.BUCKET.delete(`${prefix}/headers.json`),
    ]);
    ```

    ### Context

    **Files to create:** `test/fixtures.js`
    **Files to modify:** `test/capture.test.js`, `test/wacz.test.js`, `test/verify-html.test.js`, `test/capture-integration.test.js` (and any other test files that define local copies of `PNG_BYTES`, `TEST_HTML`, or `stubRenderer`)

    The test suite uses vitest with `@cloudflare/vitest-pool-workers`. Tests run in the Workers runtime environment with `env` providing KV, R2, and other bindings.

    **What NOT to do:**
    - Do not add new test cases for dual-screenshot behavior -- Phase 6 (test execution) handles that. This task is purely about fixture extraction and stub creation.
    - Do not modify source files.
    - Do not change the behavior of existing tests -- they must pass identically after the refactor.
    - Keep each test file's own `TEST_ID` in the file (not in fixtures) to avoid cross-test KV collisions.

- **Deliverables**:
  - New `test/fixtures.js` with shared constants and consent-aware renderer stubs
  - Updated `test/capture.test.js`, `test/wacz.test.js`, `test/verify-html.test.js`, `test/capture-integration.test.js` importing from fixtures
- **Success criteria**:
  - All existing tests pass unchanged
  - No duplicate `PNG_BYTES`, `TEST_HTML`, or `stubRenderer` definitions across test files
  - Consent-aware renderer stubs cover all four scenarios: dismissed, failed, not detected, partial

---

### Cross-Cutting Coverage

- **Testing**: Covered by Task 4 (fixture prep) and Phase 6 (post-execution test validation). New test cases for dual-screenshot behavior, WACZ round-trip, API response shapes, and verification page rendering will be written during Phase 6 using the stubs created in Task 4.
- **Security**: All security constraints from security-minion's analysis are embedded in the Task 1 prompt (exposeBinding message allowlist, enablePrehide: false, screenshot-before-injection sequencing, no caller-supplied JS). Phase 5 code review will validate these are implemented correctly.
- **Usability -- Strategy**: ux-strategy-minion's recommendations are fully incorporated into Task 3 (after-screenshot primary, before in disclosure, consent check in checks list, no "degraded" language, presence-driven rendering, "Capture details" disclosure).
- **Usability -- Design**: The UI changes are minimal (one disclosure element, one check row, one caption) and reuse existing CSS patterns. No dedicated ux-design-minion review needed for this scope.
- **Documentation**: Priority 1 doc tasks (JSDoc, OpenAPI, header comments, WARC record order) are embedded in Tasks 1-2. Priority 2 docs (README, inline comments) are deferred to Phase 8.
- **Observability**: Consent metadata is added to existing Coralogix log events (Task 1, step 7). No new logging infrastructure needed -- this extends the existing `capture.success` event.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - **accessibility-minion**: Task 3 produces UI changes (dual screenshot display, new check row, disclosure section) that end-users interact with. Alt text differentiation and disclosure accessibility need review. Rationale: new interactive HTML elements (details/summary) and image alt text changes.
- **Not selected**: ux-design-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

**Artifact naming (data-minion vs. api-design-minion):**
Data-minion proposed renaming `screenshot` to `screenshotBefore`/`screenshotAfter`, replacing the existing field. Api-design-minion proposed keeping `screenshot` as the primary (best-available) and adding optional `screenshotBefore`. **Resolved in favor of api-design-minion** -- zero breaking changes. `screenshot` always contains the best image. `screenshotBefore` is additive. This is the correct approach for a pre-1.0 API that already has consumers (the verification page).

**WARC URI naming:**
Data-minion proposed `urn:wrl:screenshot:before:{url}` / `urn:wrl:screenshot:after:{url}`. Test-minion cautioned about breaking verification of old captures. **Resolution:** New captures use `urn:wrl:screenshot:before:{url}` and `urn:wrl:screenshot:after:{url}`. Old captures retain `urn:wrl:screenshot:{url}`. The verifier handles both by looking for any URI matching `urn:wrl:screenshot*:{url}`. This is a clean break since the WACZ is an immutable artifact -- old bundles are not modified.

**R2 key naming:**
Data-minion proposed `screenshot-before.png` / `screenshot-after.png`. Api-design-minion proposed keeping `screenshot.png` for the primary and using `screenshot-before.png` for the before image. **Resolved in favor of api-design-minion** -- the primary screenshot keeps its existing R2 key `screenshot.png`, avoiding any migration. The before-screenshot uses the new key `screenshot-before.png`.

**captureSettings schema:**
Data-minion and api-design-minion had slightly different schema structures. **Resolution:** Use api-design-minion's simpler structure (`captureSettings.consent.result` with values `success`/`notDetected`/`failed`) but include data-minion's `version` field and `screenshots.before`/`screenshots.after` booleans for WACZ self-description.

**Compact rules inclusion:**
Frontend-minion raised the option of including compact-rules.json (932KB) for broader CMP coverage. Security-minion did not flag it as a risk. **Resolution:** Skip compact rules for v1. The built-in dynamic CMP detectors cover major providers (OneTrust, Cookiebot, TrustArc, Sourcepoint, Klaro, etc.). Adding compact rules is a size/latency tradeoff that can be evaluated after measuring real-world detection rates. Aligns with YAGNI.

**Cosmetic rules:**
Security-minion recommended `enableCosmeticRules: false`. Frontend-minion's initial config had `enableCosmeticRules: true`. **Resolved in favor of security-minion** -- cosmetic rules hide banners with CSS without actually dismissing consent, creating a misleading "after" screenshot. For WRL's evidence use case, this is worse than showing the banner.

### Risks and Mitigations

1. **`page.exposeBinding()` availability on Cloudflare Workers** (MEDIUM): The Cloudflare Browser Rendering API is a subset of full Playwright. If `exposeBinding` is not supported, the fallback is a polling pattern using `page.evaluate()` to check a global variable. **Mitigation:** Test early in implementation. The polling fallback is documented in the task prompt.

2. **NAV_TIMEOUT_MS reduction from 25s to 20s** (LOW): Some slow-loading pages that previously succeeded will now trigger partial capture. **Mitigation:** The 5s reduction enables consent dismissal, which is strictly more useful for archival. Sites needing 20-25s to reach networkidle are typically heavy with tracking scripts -- exactly the sites with CMPs.

3. **30s ctx.waitUntil budget pressure** (MEDIUM): Navigation 20s + consent 8s = 28s, leaving 2s for screenshots/HTML/KV/R2. **Mitigation:** The 8s consent timeout is a hard cap. Typical consent phase is 1-3s. The worst case (28s) still leaves 2s for two screenshots (~200ms each) and HTML capture (~100ms).

4. **Autoconsent dependency supply chain** (LOW): The `@duckduckgo/autoconsent` package has transitive dependencies. **Mitigation:** Vendor the single 168KB script file. Pin the exact version. Include library version and content hash in `captureSettings` for reproducibility.

5. **WARC backward compatibility** (LOW): New URI scheme `urn:wrl:screenshot:before:` differs from legacy `urn:wrl:screenshot:`. **Mitigation:** Old bundles are immutable. The verifier already handles varied WARC structures. No migration needed.

### Execution Order

```
Batch 1: Task 1 (autoconsent integration + renderer changes)
    |
    v
Batch 2: Task 2 (WARC/WACZ/KV/API layer) + Task 4 (test fixtures, parallel since fixtures only import from existing modules)
    |
    v
Batch 3: Task 3 (verification page)
```

Gate positions: None. The requirements are clear, the API design is resolved, and all tasks have complete specifications. Phase 3.5 architecture review provides the quality gate before execution.

### Verification Steps

After all tasks complete:
1. Run `npm test` -- all existing tests pass, new fixture imports work
2. Run `npm run lint:api` -- OpenAPI spec validates
3. Manual verification: trace a dual-screenshot capture through the full pipeline:
   - POST /v1/captures with a URL known to have a cookie banner
   - GET /v1/captures/:id returns `screenshotBefore` and `captureSettings`
   - GET /v1/captures/:id/artifacts/screenshot-before returns the before image
   - GET /v1/verify/:id shows consent check in the checks list
   - GET /v1/verify/:id (browser) shows dual screenshots with disclosure
4. Verify WACZ bundle: unzip, inspect datapackage.json for `captureSettings`, verify WARC contains two screenshot records
5. Verify backward compatibility: existing captures without consent still render correctly in the verification page
