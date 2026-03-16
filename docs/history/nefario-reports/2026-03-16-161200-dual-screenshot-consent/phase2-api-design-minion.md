# Domain Plan Contribution: api-design-minion

## Recommendations

### 1. Keep `artifacts.screenshot` as primary, add `artifacts.screenshotBefore` as the new field

The current API returns `artifacts.screenshot` as a URL pointing to the post-load screenshot. Existing consumers (the verification page, any SDK integrations) depend on this field. Three options were evaluated:

**Option A: Rename to `screenshotBefore` / `screenshotAfter`** (rejected)
Breaking change. Every consumer that reads `artifacts.screenshot` breaks. Requires a major version bump. Violates the project's "additive changes only within v1" pattern. There are zero existing consumers expecting dual screenshots, but there are consumers expecting `screenshot`.

**Option B: Array of screenshots** (rejected)
Changes the type of `artifacts.screenshot` from string to array -- also a breaking change. Arrays lose semantic meaning (which element is "before"? which is "after"?). Violates the principle of type stability in API evolution.

**Option C: Keep `screenshot` as primary, add `screenshotBefore`** (recommended)
`artifacts.screenshot` continues to point to the best available screenshot (the "after" screenshot when consent dismissal succeeded, or the only screenshot when it failed). A new optional field `artifacts.screenshotBefore` provides the pre-dismissal screenshot when available. This is a purely additive change. Old consumers see the same `screenshot` field they always have. New consumers that understand consent handling can use both.

**Why `screenshot` maps to the post-dismissal image:**
- The "after" screenshot is the primary evidence artifact -- it shows the page content, which is what callers actually want
- The "before" screenshot documents the consent banner state, which is secondary metadata
- If consent dismissal fails, `screenshot` still contains the only screenshot taken (with the banner visible), and `screenshotBefore` is absent
- This means `screenshot` is always the "best available" image -- the same semantic it has today

**Field naming rationale:**
- `screenshotBefore` (not `screenshotWithBanner`, not `screenshotOriginal`): Temporal naming is objective and doesn't assume the "before" always has a banner. Some pages have no banner at all, and the "before" and "after" will be identical.
- No `screenshotAfter` field needed: `screenshot` IS the after. Adding both `screenshotBefore` and `screenshotAfter` alongside the existing `screenshot` creates ambiguity about whether `screenshot` and `screenshotAfter` are the same thing.

### 2. Backward Compatibility: Zero Breaking Changes

The design is strictly additive:

| Change | Type | Impact |
|--------|------|--------|
| `artifacts.screenshotBefore` added | New optional response field | Additive. Old consumers ignore it. |
| `consent` added to response | New optional response field | Additive. |
| `captureSettings` added to response | New optional response field | Additive. |
| New artifact name `screenshot-before` in URL path | New enum value for artifact route | Additive. Existing route handles new value. |
| `artifacts.screenshot` semantics | Points to "best" screenshot | Unchanged behavior for non-consent captures; for consent captures, points to the better image. |

**What does NOT change:**
- `artifacts.screenshot` remains a required field in `CaptureArtifacts`
- `artifacts.html` and `artifacts.headers` unchanged
- `POST /v1/captures` request body unchanged (no caller parameters per issue scope)
- All existing endpoints, status codes, error shapes unchanged
- OpenAPI spec version bumps from 0.3.0 to 0.4.0 (semver minor)

### 3. `captureSettings` Appears in the CaptureRecord Response (GET /v1/captures/:id)

Following the data-minion's advisory from Phase 0017, `captureSettings` records the conditions under which the capture was produced. For this feature, it contains only consent-related metadata.

**Proposed `captureSettings` in the GET /v1/captures/:id response:**

```json
{
  "id": "cap_...",
  "status": "complete",
  "url": "https://example.com",
  "createdAt": "...",
  "completedAt": "...",
  "renderQuality": "full",
  "captureSettings": {
    "settingsVersion": 1,
    "viewport": { "width": 1280, "height": 720 },
    "consentHandling": {
      "library": "autoconsent",
      "action": "dismiss",
      "status": "success",
      "cmpDetected": "cookiebot"
    }
  },
  "artifacts": {
    "screenshot": ".../artifacts/screenshot",
    "screenshotBefore": ".../artifacts/screenshot-before",
    "html": ".../artifacts/html"
  }
}
```

**Design decisions for `captureSettings`:**

- **Always present on new captures** (once the feature ships). Absence means "captured before this feature existed." This eliminates the "was consent tried?" ambiguity.
- **`consentHandling` is a nested object** because it has multiple related fields that only make sense together.
- **`consentHandling.status`** is the key field: `"success"` (banner dismissed, dual screenshot taken), `"not_found"` (no CMP detected, single screenshot), `"failed"` (CMP detected but dismissal failed, single screenshot).
- **`consentHandling.cmpDetected`** is informational -- the name of the Consent Management Platform identified by autoconsent. Null/absent when no CMP was detected.
- **`consentHandling.library`** records the tool used. Currently always `"autoconsent"`. Included for forward compatibility if the library changes.
- **`consentHandling.action`** records what was attempted: `"dismiss"` (close without choosing), `"optOut"` (reject all). Per the advisory synthesis, this is a server-controlled policy.

**Where `captureSettings` does NOT appear:**
- **CaptureSummary** (list endpoint): The list endpoint is for browsing, not forensics. `captureSettings` is bulky relative to summary fields. Callers who need settings fetch the full record.
- **202 response**: The capture hasn't happened yet. Settings are resolved at capture time.
- **Status endpoint**: Minimal response for polling. No settings.

### 4. Consent Metadata in the Verification Endpoint

The verification endpoint (`GET /v1/verify/:id`) should surface consent handling as an **informational section**, not a new verification check.

**Rationale against a new check:**
- The three existing checks (artifactHashes, bundleHash, signature) verify cryptographic integrity. Consent handling is metadata about capture conditions, not a claim that can pass or fail cryptographically.
- Adding a "consentHandling" check that always passes would be misleading. Adding one that fails when consent dismissal failed would incorrectly conflate "capture quality" with "cryptographic integrity."

**Proposed approach:** Add `captureSettings` to the verification response body alongside the existing `capture` metadata block:

```json
{
  "verified": true,
  "capture": {
    "id": "cap_...",
    "createdAt": "...",
    "completedAt": "...",
    "renderQuality": "full"
  },
  "captureSettings": {
    "settingsVersion": 1,
    "viewport": { "width": 1280, "height": 720 },
    "consentHandling": {
      "library": "autoconsent",
      "action": "dismiss",
      "status": "success",
      "cmpDetected": "cookiebot"
    }
  },
  "signing": { ... },
  "checks": [ ... ]
}
```

The verification HTML page should display consent handling status in the "Capture" metadata section:
- "Cookie consent: dismissed (Cookiebot)" for successful dismissal
- "Cookie consent: not detected" when no CMP found
- "Cookie consent: attempted, failed" when CMP was found but dismissal failed

This is purely informational and does not affect the verified/unverified banner.

### 5. When Autoconsent Fails: `artifacts.screenshot` Points to the Only Screenshot

When consent dismissal fails (CMP not found, or CMP found but dismissal didn't work), the capture pipeline produces only one screenshot. In this case:

- `artifacts.screenshot` points to that single screenshot (the one with the banner, if present)
- `artifacts.screenshotBefore` is **absent** (not present in the response)
- `captureSettings.consentHandling.status` is `"not_found"` or `"failed"`

This means consumers can rely on a simple rule: **`artifacts.screenshot` is always present and always contains the best available screenshot.** `artifacts.screenshotBefore` is present only when consent handling succeeded and a second screenshot was taken.

**Edge case -- no CMP detected, pages without banners:** The capture takes the "before" screenshot, runs autoconsent detection, finds nothing, and the "before" screenshot IS the final screenshot. In this case, to avoid storing two identical images, the pipeline should skip the second screenshot and set `status: "not_found"`. Only one R2 object is stored, and `screenshotBefore` is absent.

### 6. R2 Storage Keys and Artifact Route

**R2 keys:**
- Before screenshot: `captures/{captureId}/screenshot-before.png`
- After screenshot (primary): `captures/{captureId}/screenshot.png` (unchanged)
- HTML, headers: unchanged

The "before" screenshot uses a hyphenated name (`screenshot-before.png`) consistent with web conventions. The primary screenshot keeps its existing key to avoid data migration.

**Artifact route extension:**

The current route regex is:
```
/v1/captures/(cap_[a-f0-9]{32})/artifacts/(screenshot|html|headers|wacz)
```

Extend the enum to include `screenshot-before`:
```
/v1/captures/(cap_[a-f0-9]{32})/artifacts/(screenshot|screenshot-before|html|headers|wacz)
```

The `handleGetCaptureArtifact` handler in `index.js` already does `record.artifacts?.[artifactName]` for the R2 key lookup. Since we're storing `screenshotBefore` (camelCase) in the KV artifacts object but using `screenshot-before` (kebab-case) in the URL, the handler needs a small mapping:

```javascript
const artifactKey = artifactName === 'screenshot-before' ? 'screenshotBefore' : artifactName;
const r2Key = artifactKey === 'wacz' ? record.wacz?.key : record.artifacts?.[artifactKey];
```

**Content type mapping** addition:
```javascript
const contentTypes = {
  screenshot: 'image/png',
  'screenshot-before': 'image/png',
  html: 'text/plain',
  headers: 'application/json',
  wacz: 'application/wacz+zip',
};
```

### 7. KV Record Shape Extension

The KV `artifacts` object in `completeCapture()` currently stores R2 keys:

```javascript
// Current
const artifacts = {
  screenshot: `captures/${captureId}/screenshot.png`,
  html: `captures/${captureId}/rendered.html`,
  headers: `captures/${captureId}/headers.json`, // optional
};
```

Extend to:
```javascript
// New
const artifacts = {
  screenshot: `captures/${captureId}/screenshot.png`,
  screenshotBefore: `captures/${captureId}/screenshot-before.png`, // optional
  html: `captures/${captureId}/rendered.html`,
  headers: `captures/${captureId}/headers.json`, // optional
};
```

And add `captureSettings` as a sibling of `artifacts` in the KV record, following the data-minion's advisory pattern:

```javascript
const value = {
  ...existing,
  status: 'complete',
  completedAt: new Date().toISOString(),
  artifacts,
  captureSettings: {
    settingsVersion: 1,
    viewport: { width: 1280, height: 720 },
    consentHandling: {
      library: 'autoconsent',
      action: 'dismiss',
      status: consentResult.status,
      cmpDetected: consentResult.cmpName || null,
    },
  },
};
```

### 8. WACZ Bundle Extension

Both screenshots must be included in the WACZ bundle as separate WARC response records, with their SHA-256 hashes in `datapackage.json` resources. The `captureSettings` block is also added to `datapackage.json`.

The Ed25519 signature automatically covers `captureSettings` through the existing canonicalize-hash-sign chain (per the data-minion's Phase 0017 analysis). No changes to signing code are needed.

**`datapackage.json` additions:**

```json
{
  "profile": "data-package",
  "wacz_version": "1.1.1",
  "title": "WRL capture of https://example.com",
  "software": "WRL/0.1",
  "created": "...",
  "mainPageUrl": "https://example.com",
  "mainPageDate": "...",
  "captureSettings": {
    "settingsVersion": 1,
    "viewport": { "width": 1280, "height": 720 },
    "consentHandling": {
      "library": "autoconsent",
      "action": "dismiss",
      "status": "success",
      "cmpDetected": "cookiebot"
    }
  },
  "resources": [
    { "name": "data.warc", "path": "archive/data.warc", "hash": "sha256:...", "bytes": 12345 },
    { "name": "index.cdxj", "path": "indexes/index.cdxj", "hash": "sha256:...", "bytes": 678 },
    { "name": "pages.jsonl", "path": "pages/pages.jsonl", "hash": "sha256:...", "bytes": 90 }
  ]
}
```

Note: The screenshots themselves are embedded in `data.warc` as response records. The WARC builder (`warc.js`) needs to produce records for both screenshots when both exist. The resource hashes cover the WARC file containing both screenshots.

### 9. OpenAPI Schema Changes (Concrete)

**New schema: `ConsentHandling`**

```yaml
ConsentHandling:
  type: object
  description: >
    Records the server-controlled cookie consent dismissal attempted
    during capture. WRL automatically attempts to dismiss cookie consent
    banners using the autoconsent library. This block documents what
    happened. Present on captures created after consent handling was
    introduced; absent on earlier captures.
  required: [library, action, status]
  properties:
    library:
      type: string
      const: autoconsent
      description: >
        Consent handling library used. Currently always "autoconsent"
        (DuckDuckGo's autoconsent library).
    action:
      type: string
      enum: [dismiss, optOut]
      description: >
        Consent action attempted. "dismiss" closes the banner without
        making a choice. "optOut" actively rejects all non-essential
        cookies. The action is a server-controlled policy, not a
        caller parameter.
    status:
      type: string
      enum: [success, not_found, failed]
      description: >
        Outcome of the consent handling attempt. "success" means a
        CMP was detected and the banner was dismissed (dual screenshot
        taken). "not_found" means no known CMP was detected (single
        screenshot). "failed" means a CMP was detected but dismissal
        did not succeed (single screenshot with banner visible).
    cmpDetected:
      type: string
      nullable: true
      description: >
        Name of the Consent Management Platform detected by the
        autoconsent library (e.g., "cookiebot", "onetrust", "quantcast").
        Null when status is "not_found".
      examples:
        - cookiebot
        - onetrust
```

**New schema: `CaptureSettings`**

```yaml
CaptureSettings:
  type: object
  description: >
    Immutable record of the conditions under which a capture was produced.
    Always present on captures created after settings tracking was introduced.
    Absent on earlier captures (treat absence as "settings unknown").
    Included in the WACZ datapackage.json and covered by the Ed25519
    signature chain.
  required: [settingsVersion, viewport, consentHandling]
  properties:
    settingsVersion:
      type: integer
      const: 1
      description: >
        Schema version for captureSettings. Allows verifiers to detect
        unknown fields from future schema versions.
    viewport:
      type: object
      required: [width, height]
      properties:
        width:
          type: integer
          description: Viewport width in pixels used for the capture.
          examples: [1280]
        height:
          type: integer
          description: Viewport height in pixels used for the capture.
          examples: [720]
    consentHandling:
      $ref: '#/components/schemas/ConsentHandling'
```

**Modified schema: `CaptureArtifacts`**

```yaml
CaptureArtifacts:
  type: object
  description: >
    Named artifact URLs for a complete capture. `screenshot` is always
    the primary (best-available) screenshot. When cookie consent dismissal
    succeeded, `screenshotBefore` provides the pre-dismissal view showing
    the consent banner. All fields present for a complete capture except
    headers (absent if HTTP header fetch failed) and screenshotBefore
    (absent when consent dismissal was not successful or not attempted).
  required: [screenshot, html]
  properties:
    screenshot:
      type: string
      format: uri
      description: >
        Primary full-page PNG screenshot. When consent dismissal succeeded,
        this is the post-dismissal screenshot (page content without banner).
        When consent dismissal failed or was not attempted, this is the
        only screenshot taken. Served with Content-Type: image/png and
        Content-Disposition: attachment.
      examples:
        - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot
    screenshotBefore:
      type: string
      format: uri
      description: >
        Pre-consent-dismissal full-page PNG screenshot showing the page
        with the cookie consent banner visible. Present only when consent
        dismissal succeeded (captureSettings.consentHandling.status is
        "success"). Absent otherwise. Served with Content-Type: image/png
        and Content-Disposition: attachment.
      examples:
        - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot-before
    html:
      type: string
      format: uri
      # ... unchanged
    headers:
      type: string
      format: uri
      # ... unchanged
```

**Modified schema: `CaptureRecord`** -- add `captureSettings`:

```yaml
CaptureRecord:
  # ... existing fields unchanged
  properties:
    # ... existing properties
    captureSettings:
      $ref: '#/components/schemas/CaptureSettings'
      description: >
        Capture conditions metadata. Present on captures created after
        settings tracking was introduced. Absent on earlier captures.
```

**Modified route parameter** for artifacts endpoint:

```yaml
- name: name
  in: path
  required: true
  schema:
    type: string
    enum: [screenshot, screenshot-before, html, headers, wacz]
  description: Artifact name to retrieve.
```

**Modified verification response schema** -- add `captureSettings`:

The verification response body gains a `captureSettings` field at the top level, parallel to `capture` and `signing`.

### 10. Verification Page (HTML) Display

The verification page (`verify-page.js`) currently fetches both the verify endpoint and the retrieval endpoint, then renders screenshot, checks, and metadata. For dual screenshots:

- When `screenshotBefore` is present in `retrievalData.artifacts`, render two screenshots in a "Before / After" layout (simple vertical stack with labels, not a slider)
- Label: "Before consent dismissal" / "After consent dismissal"
- When only `screenshot` is present, render as today (single image, no label change needed)
- Display consent handling metadata in the Capture metadata section: "Cookie consent: [status] ([cmpDetected])"

This is a verify-page rendering concern, not an API schema concern, but the API must expose the data the page needs. The `captureSettings` data comes from the verification response; the screenshot URLs come from the retrieval response.

## Proposed Tasks

1. **Define `CaptureSettings` and `ConsentHandling` schemas** in the OpenAPI spec. Add `CaptureSettings` to `CaptureRecord` and verification response schemas. (api-spec-minion)

2. **Add `screenshotBefore` to `CaptureArtifacts` schema** as optional field. Update artifact name enum to include `screenshot-before`. Update examples. (api-spec-minion)

3. **Extend `completeCapture()` signature** in `kv.js` to accept `captureSettings` parameter. Store it in the KV record alongside `artifacts`, `wacz`, `renderQuality`, and `render`. (implementation)

4. **Extend `performCapture()` in `capture.js`**: After the initial screenshot, run autoconsent detection/dismissal. If successful, take second screenshot. Build the consent result metadata. Pass both screenshots and consent metadata downstream. (implementation -- primary complexity)

5. **Extend `buildWacz()` in `wacz.js`**: Accept `captureSettings` and optional second screenshot. Embed both screenshots as WARC records. Add `captureSettings` to `datapackage.json`. (implementation)

6. **Update `handleGetCapture()` in `index.js`**: Build `screenshotBefore` URL when `record.artifacts.screenshotBefore` exists. Include `captureSettings` from the KV record in the response body. (implementation)

7. **Update `handleGetCaptureArtifact()` in `index.js`**: Extend route regex to accept `screenshot-before`. Add kebab-to-camelCase mapping for the artifact key lookup. Add content type and filename entries. (implementation)

8. **Update `handleVerifyCapture()` in `index.js`**: Include `captureSettings` from the KV record in the verification JSON response. (implementation)

9. **Update verification page** (`verify-page.js`): Display dual screenshots with before/after labels. Show consent handling status in capture metadata section. (implementation)

10. **Update WARC builder** (`warc.js`): Support building WARC records for two screenshots (before and after). (implementation)

## Risks and Concerns

### Risk 1: `screenshot` Semantic Shift (MEDIUM)

For existing captures, `artifacts.screenshot` is the only screenshot taken with the banner visible. For new captures with successful consent dismissal, `artifacts.screenshot` becomes the post-dismissal image (banner gone). A consumer who assumed "screenshot always shows what a first-time visitor sees" now gets a different image.

**Mitigation:** This is the correct behavior -- the primary screenshot should show the page content, not the banner. The `screenshotBefore` field explicitly preserves the banner-visible state. Document the semantic in the field description. Consumers who need the banner-visible view use `screenshotBefore`.

**Alternative considered:** Making `screenshot` always be the "before" (with banner) and `screenshotAfter` be the "after." Rejected because: (a) it changes the quality of what `screenshot` returns for the majority of captures where no banner exists, (b) the "after" image is what most consumers want, (c) it forces every consumer to check for `screenshotAfter` to get the useful image.

### Risk 2: Artifact URL Stability (LOW)

Adding `screenshot-before` to the artifact URL enum is a permanent commitment. The hyphenated name must be stable across all future API versions. If we later rename the concept, the URL must continue working.

**Mitigation:** `screenshot-before` is a descriptive, temporal name that doesn't commit to any specific consent handling mechanism. Even if the library changes from autoconsent to something else, the concept of "screenshot taken before server-side processing" remains valid.

### Risk 3: R2 Storage Cost for Duplicate Screenshots (LOW)

When no CMP is detected, the "before" and "after" screenshots would be identical. Storing both wastes R2 storage and bandwidth.

**Mitigation:** The capture pipeline should skip the second screenshot when `consentHandling.status` is `not_found`. Only when a CMP is actually detected and dismissal is attempted should both screenshots be stored. This keeps R2 storage growth proportional to pages that actually have consent banners.

### Risk 4: 30s ctx.waitUntil Budget Pressure (MEDIUM)

Adding autoconsent detection + dismissal + second screenshot to the capture pipeline adds time. The advisory estimates <2s for typical pages, but edge cases (slow CMP JavaScript, complex banners) could push closer to the budget.

**Mitigation:** This is primarily an implementation concern, not an API design concern. The API design accommodates failure gracefully: if consent handling times out, `status: "failed"`, single screenshot, capture still completes. The API contract does not promise dual screenshots -- it documents what happened.

### Risk 5: captureSettings Schema Immutability Under Signing (MEDIUM)

Once `captureSettings` with `settingsVersion: 1` is embedded in signed WACZ bundles, the field names and semantics are permanent for that version. Misnaming a field now means living with it forever in the signed record.

**Mitigation:** The schema is minimal. Fields are descriptive and use widely understood terms. The `settingsVersion` field allows verifiers to detect unknown versions. Start with Tier 1 fields only (viewport + consentHandling). Per data-minion Phase 0017 advice: "easier to add fields than to rename them."

### Risk 6: Verification Page Complexity (LOW)

Displaying two screenshots with labels increases the page's visual complexity. For captures without consent handling, the page should look identical to today.

**Mitigation:** Conditional rendering: only show the before/after layout when `screenshotBefore` URL is present in the retrieval data. Single-screenshot captures render exactly as they do now.

## Additional Agents Needed

- **api-spec-minion**: Author the concrete OpenAPI spec changes: new schemas (`CaptureSettings`, `ConsentHandling`), modified schemas (`CaptureArtifacts`, `CaptureRecord`, verification response), updated artifact route enum, updated examples.
- **security-minion**: Review that autoconsent's page-level JavaScript execution (via `page.evaluate()`) does not violate the "no caller-supplied JS execution" constraint. Confirm the new R2 keys and artifact routes do not create new access control gaps.
- **test-minion**: Design tests for: dual screenshot path (consent success), single screenshot fallback (consent not found, consent failed), WACZ verification covering `captureSettings` in the signature chain, artifact route for `screenshot-before`, backward compatibility (old captures without `captureSettings`).
- **frontend-minion**: Implement autoconsent integration in the Playwright context, handle the detection/dismissal lifecycle, produce the consent result metadata.
- **software-docs-minion**: Update verification page wording, document consent handling in API reference descriptions.
