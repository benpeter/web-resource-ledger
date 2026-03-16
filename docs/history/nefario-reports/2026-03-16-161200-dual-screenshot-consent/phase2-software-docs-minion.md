# Phase 2: software-docs-minion -- Documentation Plan for Dual-Screenshot Cookie Consent

## Recommendations

### 1. openapi.yaml schema changes (ESSENTIAL)

The OpenAPI spec is the single source of truth for the API contract. It needs the following changes:

**CaptureArtifacts schema** -- currently has one `screenshot` field. Must change to support two:
- Rename `screenshot` to `screenshotBefore` (or add alongside): the as-is capture with cookie banner visible
- Add `screenshotAfter`: the post-dismissal screenshot (optional -- absent when autoconsent failed)
- Both URLs follow the existing pattern: `/v1/captures/{id}/artifacts/screenshot-before`, `/v1/captures/{id}/artifacts/screenshot-after`
- The `required` array currently lists `[screenshot, html]`. This must change to `[screenshotBefore, html]` since `screenshotAfter` is conditional on successful dismissal
- For backward compatibility, consider whether `screenshot` should remain as an alias pointing to `screenshotAfter` (the "clean" capture) or `screenshotBefore` (the evidence capture). **This is an API design decision, not a documentation decision** -- flag for api-design-minion

**New ConsentInfo schema** -- the issue specifies `captureSettings` metadata. Add:
```yaml
ConsentInfo:
  type: object
  description: >
    Cookie consent handling metadata. Reports what the server-controlled
    consent dismissal attempted and whether it succeeded.
  required: [library, action, status]
  properties:
    library:
      type: string
      description: Consent library used for banner detection and dismissal.
      examples:
        - '@duckduckgo/autoconsent'
    action:
      type: string
      enum: [dismiss, reject-all, none]
      description: >
        Consent action attempted. "dismiss" removes the overlay without
        making a consent choice. "reject-all" opts out of all optional
        tracking. "none" when no CMP was detected.
    status:
      type: string
      enum: [dismissed, failed, not-detected]
      description: >
        Outcome of the consent handling. "dismissed" means the banner
        was removed. "failed" means a CMP was detected but dismissal
        failed. "not-detected" means no known CMP was found.
    cmpName:
      type: string
      description: >
        Name of the detected Consent Management Platform, if any.
        Absent when status is "not-detected".
```

**CaptureRecord schema** -- add `consent` field referencing ConsentInfo. Optional -- absent on captures created before this feature.

**WaczInfo/datapackage.json** -- the issue says `captureSettings` should be in `datapackage.json`. Add documentation for the `captureSettings` block. This is covered by the existing Ed25519 signature chain (no signing changes needed -- confirmed in the advisory).

**Artifact name enum** -- the `name` path parameter on `/v1/captures/{captureId}/artifacts/{name}` currently allows `screenshot`, `html`, `headers`, `wacz`. Must add `screenshot-before` and `screenshot-after`. The old `screenshot` name needs a decision: keep as alias or deprecate.

**Response examples** -- update all examples that show `CaptureRecord` to include the new screenshot fields and consent metadata. Add a new example showing a capture where consent dismissal failed (single screenshot, consent metadata with status: failed).

### 2. WARC record order comment in warc.js (ESSENTIAL)

The header comment currently documents 4 records:
```
 * Record order:
 *   1. warcinfo   (software metadata)
 *   2. resource   (rendered HTML)
 *   3. metadata   (HTTP headers, if present)
 *   4. resource   (screenshot PNG)
```

This must be updated to document 5 records (possibly 6):
```
 * Record order:
 *   1. warcinfo     (software metadata)
 *   2. resource     (rendered HTML)
 *   3. metadata     (HTTP headers, if present)
 *   4. resource     (screenshot-before PNG -- pre-consent-dismissal)
 *   5. resource     (screenshot-after PNG -- post-consent-dismissal, absent on dismissal failure)
```

The `buildWarc()` JSDoc `@param` for `artifacts` must be updated to accept two screenshot buffers instead of one.

### 3. capture.js header comment updates (ESSENTIAL)

The extensive header block documents the capture pipeline. The dual-screenshot pipeline adds a new stage between "navigate + wait" and "take screenshot." The header needs:

- **Pipeline description** (line 5): update "screenshot, rendered HTML, and HTTP headers" to mention dual screenshots
- **New section on consent handling**: document the autoconsent integration, what it does, what it doesn't do, and the security model (server-controlled, no caller JS execution)
- **Security constraints**: add the relevant constraints from the Phase 0017 advisory (no caller-supplied JS, no CSS injection, server-controlled policy)
- **Accepted risks**: document that autoconsent runs third-party JS patterns within the page context (the library is bundled and auditable, but executes page-level DOM manipulation)

### 4. wacz.js header comment and JSDoc (ESSENTIAL)

The header currently lists a 6-step assembly process. The `buildWacz()` JSDoc `@param` for `artifacts` is:
```
@param {{ screenshot: Uint8Array, html: string, headers: object|null }} artifacts
```

This must change to:
```
@param {{ screenshotBefore: Uint8Array, screenshotAfter: Uint8Array|null, html: string, headers: object|null, consent: object|null }} artifacts
```

The header step list may need to mention `captureSettings` assembly as a sub-step of building `datapackage.json`.

### 5. kv.js completeCapture() JSDoc (ESSENTIAL)

The `completeCapture()` function's `@param` for `artifacts` currently shows:
```
@param {{ screenshot: string, html: string, headers: string }} artifacts
```

Must be updated to reflect dual screenshot R2 keys and consent metadata. The function also stores `wacz`, `renderQuality`, and `render` -- a new `consent` parameter or similar may be added.

### 6. defaultRenderer() JSDoc in capture.js (ESSENTIAL)

Currently returns `{ screenshot: Uint8Array, html: string }`. Must be updated to return dual screenshots and consent metadata:
```
@returns {Promise<{ screenshotBefore: Uint8Array, screenshotAfter: Uint8Array|null, html: string, consent: { library: string, action: string, status: string, cmpName?: string } }>}
```

### 7. README.md (SHOULD)

The README's "What you get" section lists "Full-page screenshot (PNG)" as a single item. Update to mention dual screenshots:
- Screenshot before consent dismissal (as-is page state)
- Screenshot after consent dismissal (clean page content)
- Note that consent handling is automatic and server-controlled

The example JSON responses in the Usage section should be updated to show the new artifact names once the API shape is finalized.

### 8. ARCHITECTURE.md (NOT RECOMMENDED)

No. The project has no ARCHITECTURE.md today, and the codebase is small enough (6 core source files) that the header comments in each file serve as sufficient architectural documentation. The capture pipeline stages are documented in `capture.js`'s header comment -- that is the right place for pipeline documentation. Creating an ARCHITECTURE.md would:
- Duplicate information already in code headers
- Create a staleness risk (code headers are updated with the code; a separate doc drifts)
- Violate the project's KISS and documentation-minimalism principles

If an architecture document becomes warranted in the future (multi-service deployment, new team members), start with a C4 Context diagram showing the Worker, R2, KV, Browser Rendering, and Coralogix. But not for this feature.

### 9. cdxj.js (LOW PRIORITY)

The header comment mentions it "builds a sorted CDXJ index from WARC record metadata." No change needed -- it doesn't document what records exist, just how they're indexed. The function is record-type-agnostic.

### 10. Inline code comments for the consent pipeline (SHOULD)

The consent handling code should follow the existing pattern: explain the **why** of each decision, not the **what**. Key comments needed:

- **Why autoconsent runs after the first screenshot but before the second**: the first screenshot is the evidence state; the second is the clean content
- **Why `page.exposeBinding()` is used**: safe bridge between page context and Node context, no `page.evaluate()` of caller-supplied code
- **Why consent failure is non-fatal**: the primary evidence (screenshot-before) is always captured; the secondary screenshot is a best-effort enhancement
- **Why the consent action choice** (dismiss vs. reject-all): whichever is chosen, explain the tradeoff inline

## Proposed Tasks

### Priority 1 (must ship with the code changes)

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 1 | Update `CaptureArtifacts` schema for dual screenshots | `openapi.yaml` | M |
| 2 | Add `ConsentInfo` schema | `openapi.yaml` | S |
| 3 | Add `consent` field to `CaptureRecord` and `CaptureSummary` | `openapi.yaml` | S |
| 4 | Update artifact name enum to include `screenshot-before`, `screenshot-after` | `openapi.yaml` | S |
| 5 | Add `captureSettings` to WaczInfo or datapackage documentation | `openapi.yaml` | S |
| 6 | Update all response examples (3+ examples currently) | `openapi.yaml` | M |
| 7 | Update WARC record order comment | `src/warc.js` | XS |
| 8 | Update `buildWarc()` JSDoc | `src/warc.js` | XS |
| 9 | Update `capture.js` header comment (pipeline, security, accepted risks) | `src/capture.js` | M |
| 10 | Update `defaultRenderer()` JSDoc | `src/capture.js` | XS |
| 11 | Update `buildWacz()` JSDoc | `src/wacz.js` | XS |
| 12 | Update `completeCapture()` JSDoc | `src/kv.js` | XS |

### Priority 2 (should ship, can follow in a fast-follow)

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 13 | Update README "What you get" and example responses | `README.md` | S |
| 14 | Write inline comments for consent pipeline (why decisions) | `src/capture.js` | S |
| 15 | Update verify-page.js to render consent metadata in verification HTML | `src/verify-page.js` | S (code + doc) |

### Priority 3 (nice-to-have, can be deferred)

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 16 | Update backlog.md to mark #58 as in-progress/done and update `captureSettings` trigger | `docs/backlog.md` | XS |

## Risks and Concerns

### Backward compatibility of artifact names
The current `screenshot` artifact name appears in:
- `openapi.yaml` (CaptureArtifacts schema, examples, artifact name enum)
- `src/capture.js` (R2 key: `captures/{id}/screenshot.png`)
- `src/kv.js` (artifacts object stored in KV)
- `README.md` (example responses)
- Potentially any external consumer that has saved artifact URLs

**Risk**: Changing `screenshot` to `screenshot-before`/`screenshot-after` is a breaking change for any client fetching `GET /v1/captures/{id}/artifacts/screenshot`. The implementation must decide whether to keep `screenshot` as an alias (pointing to `screenshotAfter` or `screenshotBefore`) or deprecate it. **This is an API design decision that must be resolved before documentation can be finalized.**

**Recommendation**: Keep `screenshot` as an alias for `screenshotAfter` (the "clean" capture). Old clients get the improved screenshot transparently. New clients can request either explicitly.

### WARC record order affects CDXJ index
Adding a second screenshot resource record changes CDXJ offsets and adds an index entry. The CDXJ module itself is record-agnostic (it just indexes whatever recordMeta it receives), but tests that assert exact WARC byte offsets or CDXJ line counts will break. This is a test concern, not a documentation concern, but worth flagging.

### captureSettings schema design
The issue specifies `captureSettings` in `datapackage.json`. The Phase 0017 advisory said this block records "consent library used, consent action attempted, success/failure status." The exact schema must be finalized before the OpenAPI spec can document it. The data-minion designed a schema in the advisory -- that design should be the starting point.

### openapi.yaml version bump
The current API version is `0.3.0`. Adding dual screenshots and consent metadata is a feature addition -- bump to `0.4.0` per semver. Update the `info.version` field.

### Documentation debt: verification page
The `verify-page.js` renders a human-readable verification page. It currently shows capture metadata but has no consent-related fields. When consent metadata is added to the KV record and verification response, the verification page HTML template needs updating to display it. This is partly a code change, partly a documentation concern (the page IS the human-facing documentation of what was verified).

## Additional Agents Needed

1. **api-design-minion** -- Must resolve the artifact naming question (`screenshot` vs `screenshotBefore`/`screenshotAfter`, backward compatibility, aliasing strategy) and the `captureSettings` schema finalization before documentation work can complete. The ConsentInfo schema proposed above is a documentation-side draft; api-design-minion should validate or refine it.

2. **security-minion** -- Should review the consent handling security model documentation, particularly the characterization of autoconsent as "server-controlled third-party JS patterns." The Phase 0017 advisory defined 12 security constraints; the documentation must reflect all of them accurately. Security-minion should validate that the capture.js header comment additions correctly characterize the risk.

3. **test-minion** -- Not a documentation concern per se, but the WARC record order change and new artifact names will break existing test assertions. Test updates should be coordinated with documentation updates to ensure consistency.

4. **frontend-minion** -- For the verify-page.js updates. The verification page is HTML rendered server-side and serves as user-facing evidence documentation. Its content must be accurate and complete with respect to the new consent metadata.
