# Test Strategy: Dual-Screenshot Cookie Consent Dismissal

## Recommendations

### 1. stubRenderer Evolution for Two Screenshots

The current `stubRenderer` returns `{ screenshot, html, partial, render }`. For dual-screenshot support, it must evolve to return a `consent` object alongside the existing fields. The key design question: should the renderer return one or two separate screenshot fields?

**Recommended approach:** The renderer returns a `consent` object that contains the second screenshot and metadata about what happened:

```js
const dualScreenshotRenderer = async () => ({
  screenshot: PNG_BYTES_BEFORE,        // renamed semantically to "before"
  html: TEST_HTML,
  partial: false,
  render: { waitUntilReached: 'networkidle', timedOut: false, durationMs: 3500 },
  consent: {
    screenshot: PNG_BYTES_AFTER,       // post-dismissal screenshot
    library: 'autoconsent',
    action: 'optOut',
    detected: true,
    dismissed: true,
    durationMs: 850,
  },
});
```

**Why this shape:**
- The primary `screenshot` field retains backward compatibility -- old captures and partial captures still return `{ screenshot }` without a `consent` object.
- The `consent` object is the single source of truth for "did consent dismissal happen and what was the outcome."
- Stubs are easy to compose: you build `consent: null` for "autoconsent not attempted" vs `consent: { dismissed: false }` for "detected but failed."
- The R2 artifact key naming maps cleanly: `screenshot.png` (before) and `screenshot-after.png` (after).

**Stub variants needed (define once, reuse across capture.test.js, wacz.test.js, integration tests):**

1. `dualScreenshotRenderer` -- both screenshots present, consent dismissed successfully
2. `consentDetectedNotDismissedRenderer` -- consent detected, dismissal failed, only `screenshot` present, `consent.screenshot` absent
3. `consentNotDetectedRenderer` -- no consent banner found, only `screenshot` present, `consent.detected: false`
4. `stubRenderer` (legacy) -- no `consent` field at all (backward compat)
5. `partialRenderer` (existing) -- partial capture, no consent attempt (partial captures skip autoconsent)

All stubs should be extracted into a shared `test/fixtures.js` module to eliminate the current duplication of `stubRenderer`, `PNG_BYTES`, `TEST_HTML` across capture.test.js, wacz.test.js, verify-html.test.js, and capture-integration.test.js. Currently these are defined four separate times.

### 2. Autoconsent Detection/Dismissal Mockability

**Yes, autoconsent must be mockable independently of the renderer.** The renderer is the integration boundary -- it receives a browser binding and returns artifacts. Autoconsent is an internal step within the renderer. But for capture.test.js (which tests `performCapture` orchestration, not browser internals), the renderer is already the mock boundary.

**Testing layers:**

- **Unit tests (capture.test.js):** Mock at the renderer level. The renderer stub returns a `consent` object describing what happened. The test verifies that `performCapture` correctly stores consent metadata in KV and R2. Autoconsent internals are invisible here -- by design.

- **Unit tests (new: autoconsent.test.js):** If a separate `tryDismissConsent(page)` function is extracted (strongly recommended), it should get its own unit test file. Mock the `page` object to test: banner detection via CSS selectors, click actions, timeout handling, screenshot timing. This is where you test the actual autoconsent logic without a real browser.

- **Integration tests:** The real renderer in `defaultRenderer()` will call autoconsent internally. Integration tests don't need to mock autoconsent separately because they already mock the entire renderer via the injection parameter.

**Recommendation:** Extract autoconsent logic into its own module (`src/autoconsent.js`) with a function like `tryDismissConsent(page, options)`. This makes it testable in isolation and keeps the renderer function focused on browser lifecycle.

### 3. WACZ Round-Trip Test Changes

The WACZ bundle currently contains one screenshot WARC record (`urn:wrl:screenshot:{url}`). With dual screenshots, the bundle gains a second record.

**Changes needed in `test/wacz.test.js`:**

a. **New WARC records:** The `buildWarc()` function must accept an optional second screenshot. Test that when `consent.screenshot` is present, the WARC contains two screenshot resource records:
   - `urn:wrl:screenshot:before:{url}` (or keep `urn:wrl:screenshot:{url}` for backward compat)
   - `urn:wrl:screenshot:after:{url}`

b. **datapackage.json resource count:** Currently asserts `dp.resources.length === 3` (data.warc, index.cdxj, pages.jsonl). This assertion stays at 3 -- the WARC file contains both screenshots internally; resource count is about files in the ZIP, not records in the WARC.

c. **Hash integrity test:** The existing hash verification test (`resource hashes in datapackage.json match actual file bytes`) does not need structural changes -- it validates ZIP member hashes against datapackage.json, not WARC record-level content. But ensure the test exercises both single-screenshot and dual-screenshot paths.

d. **New test: dual-screenshot WARC content assertion:**
   ```
   it('WARC contains two screenshot resource records when consent.screenshot is present')
   it('WARC contains one screenshot resource record when consent.screenshot is absent')
   ```

e. **New test: captureSettings in datapackage.json:**
   ```
   it('datapackage.json includes captureSettings when consent metadata is present')
   it('captureSettings records consent library, action, and result')
   it('datapackage.json omits captureSettings when consent metadata is absent')
   ```

f. **Signature coverage:** No new signature tests needed. The existing signature round-trip test validates the full bundle hash, which naturally covers any new content added to the WARC.

### 4. Integration Test Strategy for Consent Flow

The consent flow integrates across: renderer -> R2 storage -> KV record -> API response -> verification page. Integration tests should validate data propagation, not autoconsent internals.

**In `test/capture-integration.test.js`:**

a. **Lifecycle test with dual screenshots:**
   - POST -> capture completes -> GET `/v1/captures/{id}` returns both artifact URLs
   - Verify `artifacts.screenshot` and `artifacts.screenshotAfter` are both absolute URLs
   - Verify consent metadata is present in the response

b. **Lifecycle test with failed consent:**
   - POST -> capture completes with consent detection but failed dismissal
   - GET `/v1/captures/{id}` returns only `artifacts.screenshot` (no `screenshotAfter`)
   - Response includes consent metadata with `dismissed: false`

**In `test/verify-integration.test.js` (new describe block):**

c. **Verify endpoint includes consent metadata in JSON response:**
   - Verify the `checks` array still contains the same three checks
   - Verify consent metadata appears in the response (capture or new field)

**Not integration-tested (too fragile for CI):**

- Actual browser automation with real consent banners -- this requires real page loads and is E2E territory. Use a manual test script or staging environment with known CMP-equipped pages.

### 5. Specific New Test Cases

#### capture.test.js -- new describe blocks

```
describe('performCapture -- dual screenshot (consent dismissed)')
  it('transitions KV status to complete')
  it('writes R2 artifacts: screenshot.png and screenshot-after.png')
  it('records both artifact paths in KV record')
  it('stores consent metadata in KV record')
  it('consent.library is autoconsent')
  it('consent.dismissed is true')

describe('performCapture -- consent detected but dismissal failed')
  it('transitions KV status to complete (not failed)')
  it('writes only screenshot.png to R2 (no screenshot-after.png)')
  it('artifacts.screenshotAfter is absent from KV record')
  it('consent.detected is true, consent.dismissed is false')

describe('performCapture -- no consent banner detected')
  it('transitions KV status to complete')
  it('writes only screenshot.png to R2')
  it('consent.detected is false')

describe('performCapture -- partial capture skips autoconsent')
  it('partial captures do not include consent metadata')
  it('partial captures have only one screenshot')
```

#### capture.test.js -- existing tests to update

- **R2 cleanup in `beforeEach`:** Add `screenshot-after.png` to the cleanup list.
- **Concurrent execution test:** Verify dual-screenshot artifacts don't collide between concurrent captures.

#### wacz.test.js -- new tests

```
describe('WACZ integration -- dual screenshot bundle')
  it('WACZ WARC contains before and after screenshot records')
  it('datapackage.json includes captureSettings with consent metadata')
  it('captureSettings.consent.library is autoconsent')
  it('CDXJ index has entries for both screenshot URNs')

describe('WACZ integration -- single screenshot (consent failed)')
  it('WARC contains one screenshot record')
  it('captureSettings.consent.dismissed is false')
  it('captureSettings is present even when consent fails')

describe('WACZ integration -- no consent attempt')
  it('datapackage.json omits captureSettings when no consent metadata')
```

#### capture-retrieval.test.js -- new tests

```
describe('GET /v1/captures/{id} -- dual screenshot artifacts')
  it('returns artifacts.screenshotAfter URL when second screenshot exists')
  it('omits artifacts.screenshotAfter when only one screenshot exists')
  it('consent metadata appears in response body')
  it('artifact route /artifacts/screenshot-after serves second screenshot')
```

#### verify-page.test.js -- new tests

```
describe('htmlVerifyResponse -- dual screenshot support')
  it('HTML template handles screenshotAfter URL in retrieval data')
  // Note: the actual display logic is JS-driven, so the template test
  // mainly validates the HTML structure is ready for two images
```

#### verify-html.test.js -- new tests

```
describe('GET /v1/verify/{id} -- consent metadata in JSON response')
  it('JSON response includes consent metadata from capture record')
```

### 6. Verification Page Test Evolution

The verification page (`verify-page.js`) currently renders a single screenshot from `retrievalData.artifacts.screenshot`. Changes needed:

**In `test/verify-page.test.js`:**

- The `htmlVerifyResponse` function itself does not fetch screenshots -- it generates an HTML template with inline JS that later fetches data from the API. So the test changes are about ensuring the template's JS code can handle dual screenshots.

- **No new unit tests for `htmlVerifyResponse` itself** unless the HTML template structure changes (e.g., adding a new section or container). If the JS code in the template is updated to render two screenshots, the unit tests should verify:
  - The HTML contains both screenshot containers (or a before/after comparison UI)
  - The JS references `artifacts.screenshotAfter` from the retrieval response

**In `test/verify-html.test.js` (integration):**

- Add a test that creates a capture with dual screenshots, then verifies the HTML response contains the expected structure.

**Practical recommendation:** The verification page's screenshot rendering is JS-driven in the browser. Testing the actual two-image display would require a DOM testing environment (jsdom or Playwright component testing). For MVP, validate the data flow (JSON response includes both URLs) and test the HTML template structure. Full visual testing of the before/after comparison UI can be deferred to E2E or manual testing.

## Proposed Tasks

### Task 1: Extract shared test fixtures (prep work, reduces diff noise)
- Create `test/fixtures.js` exporting: `PNG_BYTES`, `PNG_BYTES_ALT`, `TEST_HTML`, `TEST_ID` constants, and all renderer stubs.
- Update capture.test.js, wacz.test.js, verify-html.test.js, capture-integration.test.js to import from `test/fixtures.js`.
- **Why now:** The current 4x duplication of `stubRenderer` means every renderer shape change touches 4 files. Centralizing first makes the dual-screenshot changes cleaner.

### Task 2: Add consent-aware renderer stubs to fixtures
- Add `dualScreenshotRenderer`, `consentDetectedNotDismissedRenderer`, `consentNotDetectedRenderer` to `test/fixtures.js`.
- Each returns the agreed renderer output shape with appropriate consent metadata.

### Task 3: Update capture.test.js for dual-screenshot paths
- Add 4 new describe blocks (see section 5 above).
- Update `beforeEach` R2 cleanup to include `screenshot-after.png`.
- Update concurrent execution test for dual-screenshot artifact isolation.
- ~20 new test cases.

### Task 4: Update wacz.test.js for dual-screenshot bundles
- Add 3 new describe blocks testing WARC content, captureSettings, and CDXJ entries.
- Modify existing `WACZ contains expected files` test if the WARC structure assertion needs updating.
- ~9 new test cases.

### Task 5: Update capture-retrieval.test.js for new artifact routes
- Add describe block for dual-screenshot artifact URLs in GET response.
- Add test for `/artifacts/screenshot-after` artifact route.
- Update the route regex assertion in capture-integration.test.js if the route pattern changes.
- ~5 new test cases.

### Task 6: Update verification page tests
- Add consent metadata assertions to verify-html.test.js JSON response shape.
- Add minimal structural check to verify-page.test.js for dual-screenshot HTML containers.
- ~3 new test cases.

### Task 7: Create autoconsent unit tests (if module is extracted)
- Create `test/autoconsent.test.js` for the extracted `tryDismissConsent()` function.
- Test: banner detection, click action, timeout handling, page with no banner, page with unrecognized banner.
- ~8-10 test cases.
- **Dependent on implementation decision:** only needed if autoconsent logic is extracted into its own module. If it stays inline in the renderer, these cases are tested via renderer stubs in capture.test.js.

## Risks and Concerns

### Risk 1: Renderer contract ambiguity
**Problem:** If the `consent` object shape is not locked down before implementation starts, test stubs and production code will diverge. The renderer contract is the single most important interface in this feature.
**Mitigation:** Finalize the renderer return type before any code is written. Write the TypeScript JSDoc type, get agreement, then build stubs and implementation in parallel.

### Risk 2: WARC backward compatibility
**Problem:** Changing WARC record URIs from `urn:wrl:screenshot:{url}` to `urn:wrl:screenshot:before:{url}` breaks verification of old captures. The CDXJ SURT transform test would also need updating.
**Mitigation:** Keep the primary screenshot URI unchanged (`urn:wrl:screenshot:{url}`) for backward compatibility. Use a new URI only for the after-screenshot (`urn:wrl:screenshot:after:{url}`). Old captures verify identically. Test both old and new WARC shapes.

### Risk 3: 30-second ctx.waitUntil budget
**Problem:** Adding autoconsent detection + dismissal + second screenshot could push capture times past the 30-second Cloudflare Workers limit, especially on slow pages.
**Mitigation:** The timing is untestable in unit/integration tests (no real browser). Document this as an explicit E2E/staging acceptance criterion. Add a renderer stub that simulates the timing profile (`consent.durationMs: 1800`) so the orchestration code's time-budget logic can be tested.

### Risk 4: Test fixture explosion
**Problem:** With 5+ renderer stub variants, the fixtures module could become unwieldy. Each new capture mode (partial, full, dual-screenshot, consent-failed, etc.) multiplies the combinations.
**Mitigation:** Use a factory function: `createRenderer({ partial, consent, render })` that composes the return object from building blocks. Tests override only what matters for their specific scenario.

### Risk 5: Route regex update for screenshot-after artifact
**Problem:** The current artifact route pattern is `/(screenshot|html|headers|wacz)$/`. Adding `screenshot-after` requires updating this regex. If the route and the test expectations diverge, tests will pass but the actual route won't serve the artifact.
**Mitigation:** The integration test in capture-retrieval.test.js makes a real HTTP request to the artifact route, which validates the route regex implicitly. Ensure the integration test exercises the new artifact name.

### Risk 6: Verification page dual-screenshot display is hard to test
**Problem:** The verification page renders screenshots via inline JavaScript. Testing the actual two-image display requires DOM execution. Vitest's default environment doesn't provide a DOM.
**Mitigation:** Defer visual verification to manual/E2E testing. In unit tests, validate only: (a) the HTML template structure contains expected containers, (b) the JSON API response includes both screenshot URLs. The JS logic is simple enough that code review is more cost-effective than a jsdom test setup for this page.

## Additional Agents Needed

### api-design-minion
- Must define the exact `consent` field shape in the renderer return type.
- Must define how `artifacts.screenshotAfter` appears in the GET `/v1/captures/{id}` response.
- Must define the `captureSettings` schema in `datapackage.json`.
- **Dependency:** Test stubs cannot be finalized until the API contract is agreed.

### data-minion
- Must define the KV record schema extension (`consent` field in the capture record).
- Must define R2 artifact naming: `screenshot-after.png` vs `screenshot-consent.png` vs other.
- **Dependency:** R2 cleanup logic in test `beforeEach` blocks depends on artifact naming.

### security-minion
- Must review: does autoconsent's script injection (if any) violate the existing CSP or context isolation constraints?
- Must review: are there privacy implications of storing both before/after screenshots (banner text may contain user-identifying information on some CMPs)?
- **Dependency:** If security review identifies constraints, test cases may need to validate those constraints.

### frontend-minion
- Must design the before/after comparison UI for the verification page.
- **Dependency:** Verification page test structure depends on the UI approach (side-by-side, toggle, slider).
