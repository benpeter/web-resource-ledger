# Data Architecture: Dual-Screenshot Consent Schema Extensions

## Recommendations

### 1. WARC Records: Two Separate Resource Records

Use **two separate WARC resource records**, not a single multipart record. Rationale:

- WARC/1.1 resource records are the standard for self-contained binary payloads. Each screenshot is an independent artifact with its own digest, offset, and length in the CDXJ index.
- A multipart record would require a custom MIME type and non-standard parsing, violating the principle that WRL WACZ bundles should be consumable by standard WARC tooling.
- Separate records allow independent verification -- a verifier can confirm the before-screenshot digest without reading the after-screenshot bytes.

**Record order** (extends current):

```
1. warcinfo   (software metadata)
2. resource   (rendered HTML)
3. metadata   (HTTP headers, if present)
4. resource   (screenshot-before PNG)    -- was: screenshot PNG
5. resource   (screenshot-after PNG)     -- NEW, conditional
6. metadata   (captureSettings JSON)     -- NEW
```

The captureSettings metadata record is a WARC metadata record with `WARC-Refers-To` pointing to the warcinfo record ID, using Content-Type `application/json`. This follows the WARC/1.1 pattern for supplementary metadata that applies to the whole capture, not to a specific target resource.

### 2. URI Scheme: Phase-Qualified Screenshot URIs

**Proposed URIs:**

```
urn:wrl:screenshot:before:{url}     -- first-visit state (banner visible)
urn:wrl:screenshot:after:{url}      -- post-dismissal state
urn:wrl:capture-settings:{url}      -- captureSettings metadata
```

This replaces the current `urn:wrl:screenshot:{url}`.

**Rationale:**
- The `before`/`after` qualifier is unambiguous -- it names the capture phase, not the consent outcome.
- The `:before:` and `:after:` segments sit at the same URI path level, making SURT passthrough consistent (URN URIs are passed through as-is in `toSurt()`).
- When autoconsent fails and only one screenshot exists, it uses `urn:wrl:screenshot:before:{url}` -- the single screenshot is always the before state, never the after state. This is semantically correct: a capture where consent dismissal was attempted but failed still represents the "before" state.

**Backward compatibility:** Existing WACZ bundles use `urn:wrl:screenshot:{url}`. Old bundles remain valid; verifiers checking for screenshots should look for any URI matching `urn:wrl:screenshot:*:{url}` or the legacy `urn:wrl:screenshot:{url}`.

### 3. `captureSettings` Schema

#### Location in `datapackage.json`

Top-level field in the datapackage object, sibling to `resources`, `created`, etc. Not nested inside `resources` because captureSettings describes the capture process, not a specific file.

```json
{
  "profile": "data-package",
  "wacz_version": "1.1.1",
  "title": "WRL capture of https://example.com",
  "software": "WRL/0.1",
  "created": "2026-03-16T12:00:00.000Z",
  "mainPageUrl": "https://example.com",
  "mainPageDate": "2026-03-16T12:00:00.000Z",
  "captureSettings": {
    "version": 1,
    "consent": {
      "library": "@duckduckgo/autoconsent",
      "libraryVersion": "12.3.0",
      "action": "optOut",
      "result": "success",
      "cmpDetected": "cookiebot"
    },
    "screenshots": {
      "before": true,
      "after": true
    }
  },
  "resources": [ ... ]
}
```

#### Field definitions

**`captureSettings.version`** (integer, required): Schema version for forward compatibility. Starts at `1`. Verifiers that encounter an unknown version can still validate the signature and resources; they just skip captureSettings interpretation.

**`captureSettings.consent`** (object, required when autoconsent is attempted):

| Field | Type | Required | Values | Description |
|---|---|---|---|---|
| `library` | string | yes | `"@duckduckgo/autoconsent"` | NPM package name of the consent library |
| `libraryVersion` | string | yes | semver | Version of the consent library used |
| `action` | string | yes | `"optOut"` | Consent action attempted. Always `"optOut"` in current implementation. Field exists for forward compatibility (future: `"optIn"`, `"dismiss"`). |
| `result` | string | yes | `"success"`, `"notDetected"`, `"failed"` | Outcome of the consent action |
| `cmpDetected` | string or null | no | CMP identifier or null | Consent management platform detected by autoconsent (e.g., `"cookiebot"`, `"onetrust"`, `"quantcast"`). Null when no CMP detected. |

**`captureSettings.screenshots`** (object, required):

| Field | Type | Required | Description |
|---|---|---|---|
| `before` | boolean | yes | Whether a before-screenshot was captured (always true) |
| `after` | boolean | yes | Whether a post-dismissal screenshot was captured |

#### Result values explained

- `"success"`: autoconsent detected a CMP and successfully dismissed it. Two screenshots produced.
- `"notDetected"`: autoconsent ran but detected no CMP on the page. One screenshot produced (before only, but page was clean -- no banner to dismiss). The before screenshot IS the clean state.
- `"failed"`: autoconsent detected a CMP but could not dismiss it (custom banner, unknown variant). One screenshot produced (before only, banner still visible).

#### captureSettings as WARC metadata record

The same `captureSettings` object is also stored as a WARC metadata record inside the WARC file. This ensures:
1. The WARC file is self-describing (a WARC consumer without access to datapackage.json still knows the consent context).
2. The CDXJ index can reference it for tooling that indexes WARC records.

The WARC metadata record uses:
- `WARC-Type: metadata`
- `WARC-Target-URI: urn:wrl:capture-settings:{url}`
- `Content-Type: application/json`
- `WARC-Refers-To: {warcinfoRecordId}` (links to the warcinfo record)
- Body: `JSON.stringify(captureSettings)`

### 4. Impact on Bundle Hash and Ed25519 Signature

**No changes to the signing mechanism.** The existing chain is:

```
canonicalize(datapackage) -> sha256 -> Ed25519 sign
```

Adding `captureSettings` as a top-level field in the datapackage object means it is automatically included in `canonicalize(datapackage)` and therefore covered by the signature. The `canonicalize()` function sorts keys, so the position of `captureSettings` in the source object is irrelevant -- it will always sort between `created` and `mainPageDate` in the canonical form.

**What changes:**
- The WARC file is larger (additional screenshot + metadata record), so `resources[0].hash` and `resources[0].bytes` change.
- The CDXJ index has additional entries, so `resources[1].hash` and `resources[1].bytes` change.
- The datapackage itself has the new `captureSettings` field.
- All of these feed into the existing `bundleHash = sha256(canonicalize(datapackage))`, which is then signed.

**No new hash computations, no new signature steps.** The existing verification algorithm remains: unzip, parse datapackage.json, verify resource hashes against file bytes, canonicalize datapackage, verify bundleHash = sha256(canonical), verify Ed25519 signature of bundleHash.

### 5. KV Record Shape: `captureSettings` Placement

Add `captureSettings` as a top-level field on the completed KV record, parallel to `wacz`, `renderQuality`, and `render`.

```json
{
  "status": "complete",
  "url": "https://example.com",
  "ip": "93.184.216.34",
  "captureId": "cap_abc123...",
  "tenantId": "default",
  "createdAt": "2026-03-16T12:00:00.000Z",
  "completedAt": "2026-03-16T12:00:05.000Z",
  "artifacts": {
    "screenshotBefore": "captures/cap_abc123/screenshot-before.png",
    "screenshotAfter": "captures/cap_abc123/screenshot-after.png",
    "html": "captures/cap_abc123/rendered.html",
    "headers": "captures/cap_abc123/headers.json"
  },
  "wacz": {
    "key": "captures/sha256:abc....wacz",
    "bundleHash": "sha256:abc...",
    "size": 123456,
    "keyId": "a1b2c3d4"
  },
  "renderQuality": "full",
  "render": {
    "waitUntilReached": "networkidle",
    "timedOut": false,
    "durationMs": 3400
  },
  "captureSettings": {
    "version": 1,
    "consent": {
      "library": "@duckduckgo/autoconsent",
      "libraryVersion": "12.3.0",
      "action": "optOut",
      "result": "success",
      "cmpDetected": "cookiebot"
    },
    "screenshots": {
      "before": true,
      "after": true
    }
  }
}
```

**`completeCapture()` signature change:**

```javascript
export async function completeCapture(
  kv, captureId, artifacts, wacz = null,
  renderQuality = null, render = null,
  captureSettings = null                 // NEW
)
```

The `captureSettings` parameter follows the existing pattern: `null` means omitted from the record (backward compatible). The spread pattern `...(captureSettings ? { captureSettings } : {})` keeps old records untouched.

**`artifacts` object change:**

The `artifacts.screenshot` field (string) becomes two fields:
- `artifacts.screenshotBefore` -- always present
- `artifacts.screenshotAfter` -- present only when consent dismissal succeeded

For backward compatibility, old records with `artifacts.screenshot` remain valid. The API response layer should handle both shapes. Recommendation: do NOT rename old KV records retroactively. Accept that pre-feature records have `screenshot` and post-feature records have `screenshotBefore`/`screenshotAfter`.

### 6. Autoconsent Failure: Single-Screenshot Bundle

When autoconsent fails (result `"notDetected"` or `"failed"`), the WACZ bundle looks like:

```
1. warcinfo
2. resource   (rendered HTML)
3. metadata   (HTTP headers, if present)
4. resource   (screenshot-before PNG) -- urn:wrl:screenshot:before:{url}
5. metadata   (captureSettings JSON)  -- urn:wrl:capture-settings:{url}
```

**Differences from today's bundle:**
- Screenshot URI changes from `urn:wrl:screenshot:{url}` to `urn:wrl:screenshot:before:{url}`.
- `captureSettings` metadata record is added (records that dismissal was attempted).
- `datapackage.json` includes `captureSettings` with `consent.result: "notDetected"` or `"failed"` and `screenshots.after: false`.

**Differences from a two-screenshot bundle:**
- No record #5 (screenshot-after resource record) -- record #5 becomes the captureSettings metadata.
- `captureSettings.screenshots.after` is `false`.

This is intentionally NOT identical to today's bundle. Even when only one screenshot is produced, the bundle includes captureSettings metadata to record that the consent pipeline ran. This means a verifier can distinguish:
1. **Pre-feature capture** (no `captureSettings`): consent dismissal was not attempted.
2. **Post-feature, single screenshot** (`captureSettings` with `result: "notDetected"` or `"failed"`): consent dismissal was attempted but no CMP found or dismissal failed.
3. **Post-feature, dual screenshot** (`captureSettings` with `result: "success"`): consent dismissal succeeded.

### 7. `buildWarc()` Interface Change

Current:
```javascript
buildWarc(url, captureDate, { screenshot, html, headers })
```

Proposed:
```javascript
buildWarc(url, captureDate, {
  screenshotBefore,        // Uint8Array, always present
  screenshotAfter,         // Uint8Array or null
  html,                    // string
  headers,                 // object or null
  captureSettings,         // object or null
})
```

The function constructs WARC records conditionally:
- `screenshotAfter` record is only built when `screenshotAfter !== null`.
- `captureSettings` metadata record is only built when `captureSettings !== null`.

### 8. `buildWacz()` Interface Change

Current:
```javascript
buildWacz(url, captureDate, { screenshot, html, headers }, env)
```

Proposed:
```javascript
buildWacz(url, captureDate, {
  screenshotBefore,
  screenshotAfter,
  html,
  headers,
  captureSettings,
}, env)
```

The `captureSettings` object is placed in datapackage.json before assembling. The function signature mirrors `buildWarc()` for consistency.

### 9. CDXJ Index Impact

The CDXJ index gains up to two new entries:

```
urn:wrl:screenshot:before:https://example.com 20260316120000 {"url":"urn:wrl:screenshot:before:https://example.com","mime":"image/png","status":"200","digest":"sha256:...","offset":1234,"length":5678,"filename":"archive/data.warc"}
urn:wrl:screenshot:after:https://example.com 20260316120000 {"url":"urn:wrl:screenshot:after:https://example.com","mime":"image/png","status":"200","digest":"sha256:...","offset":6912,"length":5432,"filename":"archive/data.warc"}
urn:wrl:capture-settings:https://example.com 20260316120000 {"url":"urn:wrl:capture-settings:https://example.com","mime":"application/json","status":"-","digest":"sha256:...","offset":12344,"length":456,"filename":"archive/data.warc"}
```

The SURT passthrough for `urn:` URIs already handles this correctly -- no changes to `toSurt()` or `buildCdxj()`.

### 10. R2 Storage Impact

Individual artifacts in R2 change from:
```
captures/{captureId}/screenshot.png
```
to:
```
captures/{captureId}/screenshot-before.png
captures/{captureId}/screenshot-after.png    (conditional)
```

The WACZ file (`captures/{waczHash}.wacz`) grows by the size of one additional screenshot PNG (typically 200KB-2MB) plus the captureSettings metadata record (~200 bytes). Within the 16MB document limit concern: not applicable (R2 objects, no document limit). WACZ files remain small (<10MB for typical captures).

---

## Proposed Tasks

### T1: Extend `buildWarc()` for dual screenshots and captureSettings
- Accept `screenshotBefore`, `screenshotAfter`, `captureSettings` in artifacts
- Build conditional screenshot-after resource record
- Build captureSettings metadata record
- Use new URI scheme `urn:wrl:screenshot:before:`, `urn:wrl:screenshot:after:`, `urn:wrl:capture-settings:`
- Update record order: warcinfo, HTML, headers, screenshot-before, screenshot-after (conditional), captureSettings (conditional)

### T2: Extend `buildWacz()` for captureSettings in datapackage.json
- Accept `captureSettings` in artifacts parameter
- Add `captureSettings` to datapackage object (top-level, before `resources`)
- No changes to signing chain -- captureSettings is automatically covered

### T3: Extend `completeCapture()` for captureSettings and dual artifacts
- Add `captureSettings` parameter (nullable, backward compatible)
- Change `artifacts.screenshot` to `artifacts.screenshotBefore` / `artifacts.screenshotAfter`
- Maintain backward compatibility with old records (no retroactive migration)

### T4: Update `capture.js` to produce dual screenshots
- Take before-screenshot before autoconsent
- Run autoconsent
- Take after-screenshot if autoconsent succeeded
- Assemble `captureSettings` object from autoconsent results
- Pass both screenshots and captureSettings through the existing pipeline
- Store both screenshots in R2 with new key names

### T5: Update tests
- `wacz.test.js`: verify dual-screenshot WACZ structure, captureSettings in datapackage, signature still valid
- `kv.test.js`: verify captureSettings in KV record, backward compat with null
- New tests for single-screenshot fallback (autoconsent failure path)
- CDXJ assertions for new URIs

### T6: Update verification endpoint
- Display consent handling metadata (library, result, CMP detected)
- Show both screenshots when available, single screenshot for legacy/failed bundles

---

## Risks and Concerns

### R1: Backward compatibility of `artifacts.screenshot` rename
**Risk:** External consumers of the list-captures API or KV records may depend on `artifacts.screenshot`.
**Mitigation:** Since WRL is pre-multi-user and the API is not yet consumed externally (no R12 shipped), this is a safe breaking change at the KV layer. The API response layer can normalize both shapes if needed. Document the change in the evolution log.

### R2: Partial capture + dual screenshot timing budget
**Risk:** Autoconsent adds ~500ms-2000ms. The existing 30s ctx.waitUntil budget is already tight for partial captures (25s nav timeout + 2s partial capture budget).
**Mitigation:** Take the before-screenshot during the normal render pipeline (zero additional time for the first screenshot). Only attempt autoconsent + after-screenshot when the full render succeeds (not on partial captures). Partial captures get one screenshot with `captureSettings.consent.result: "notDetected"` or no captureSettings at all (since WACZ is already skipped for partials).

### R3: captureSettings version evolution
**Risk:** The `version: 1` schema may need to evolve as new capture parameters are added.
**Mitigation:** The version field enables forward compatibility. Verifiers that encounter unknown versions can still validate signatures. Schema changes increment the version and are documented in the evolution log.

### R4: WACZ file size increase
**Risk:** Second screenshot adds 200KB-2MB to each WACZ bundle.
**Mitigation:** Well within acceptable bounds. Typical WACZ bundles are 1-5MB. A second screenshot brings them to 2-7MB. R2 has no meaningful object size limit for this range. Monitor bundle sizes in Coralogix after rollout.

### R5: Autoconsent library version tracking
**Risk:** The `libraryVersion` field requires the build process to read the installed version of `@duckduckgo/autoconsent` at build time or runtime.
**Mitigation:** Read from `node_modules/@duckduckgo/autoconsent/package.json` at build time and embed as a constant. Do not read at runtime (avoids filesystem access on Workers).

---

## Additional Agents Needed

### security-minion (already consulted)
- Validate that captureSettings does not leak information that could be exploited (CMP identifiers are public knowledge, so low risk).
- Confirm that the consent.result field values do not create a false sense of completeness (a "success" result means the library thinks it succeeded, not that the banner is guaranteed gone).

### test-minion (already consulted)
- Design test fixtures for all three consent result states (success, notDetected, failed).
- Verify signature chain integrity with new datapackage structure.
- Verify backward compatibility: old WACZ bundles without captureSettings still pass verification.

### api-design-minion (already consulted)
- Confirm the list-captures and get-capture API response shapes with the new artifacts/captureSettings fields.
- Decide whether the API response layer normalizes old `artifacts.screenshot` to `artifacts.screenshotBefore` or exposes the raw KV shape.

### frontend-minion (already consulted)
- Verification page display of consent metadata and dual screenshots.

### ux-strategy-minion (already consulted)
- Labeling of before/after screenshots in any future Web UI.
