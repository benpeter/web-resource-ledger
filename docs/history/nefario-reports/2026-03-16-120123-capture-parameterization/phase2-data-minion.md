# Domain Plan Contribution: data-minion

## Recommendations

### 1. Parameters MUST be embedded in `datapackage.json` (primary provenance record)

The WACZ bundle is the self-contained evidence artifact. Anyone who receives the `.wacz` file -- whether from R2, a court exhibit, or a forwarded email -- needs to know the conditions under which the capture was produced. If parameters live only in KV, the provenance chain breaks the moment the WACZ leaves WRL's infrastructure.

**Proposed schema addition to `datapackage.json`**:

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
    "viewport": { "width": 1920, "height": 1080 },
    "waitUntil": "networkidle",
    "maxScreenshotHeight": 8000,
    "userAgent": "WRL/0.1 (Web Resource Ledger)"
  },
  "resources": [ ... ]
}
```

Key design decisions in this schema:

- **Field name `captureSettings`** (not `parameters` or `options`). "Settings" communicates immutable configuration used at capture time, not tunable knobs. It is declarative and past-tense in spirit.
- **Always present, even for default-only captures**. Every WACZ should self-document its conditions. A verifier should never have to guess whether viewport was 1280x720 or some other value. Omitting the block when defaults were used creates ambiguity -- "was this captured before parameterization existed, or were defaults used?" Always writing the block eliminates that question.
- **Flat, strongly typed fields** (not arbitrary key-value pairs). Each field has a defined type and meaning. This avoids the "attribute pattern" anti-pattern where callers can inject arbitrary metadata that future code must handle defensively. A closed schema is auditable; an open one is not.
- **Only records settings that affect the rendered output**. Browser internals like `NAV_TIMEOUT_MS`, `MAX_SUBRESOURCES`, or `KEEP_ALIVE_MS` are operational constraints, not capture parameters. They do not belong in `captureSettings` because they do not change what the page looks like -- they change whether the capture succeeds or fails.

### 2. Parameters SHOULD also be stored in the KV capture record

KV serves a different access pattern: fast lookups, listing, status checks. Embedding parameters in KV enables:

- **Filtering by parameters** (future): "show me all captures at 1920x1080" without fetching and unzipping WACZ bundles
- **Status endpoint enrichment**: the status and metadata endpoints can return the parameters a capture was made with, so callers can verify their request was honored
- **Debugging**: when a capture fails, the KV record preserves what parameters were attempted

**Proposed KV record shape** (additions in `captureSettings`):

```json
{
  "status": "pending",
  "url": "https://example.com",
  "ip": "203.0.113.1",
  "captureId": "cap_abc123...",
  "tenantId": "default",
  "createdAt": "2026-03-16T12:00:00.000Z",
  "captureSettings": {
    "viewport": { "width": 1920, "height": 1080 }
  }
}
```

Important distinction: **KV stores only the caller-specified overrides** (sparse), while **`datapackage.json` stores the full resolved settings** (dense, including defaults). This keeps KV records lean while making the WACZ self-documenting.

**KV storage impact analysis**: Current records are under 1 KB. Adding a `captureSettings` block with caller-specified overrides adds at most 200-400 bytes for a realistic parameter set (viewport, waitUntil, maybe userAgent override). Even a generous 500-byte addition brings records to ~1.5 KB, which is 0.006% of the 25 MiB KV value limit. There is no storage concern whatsoever. Even if every field in a future expanded parameter schema were specified, we would not approach 5 KB total. KV storage pricing is per-key, not per-byte-within-key, so there is no cost impact either.

### 3. The Ed25519 signature MUST cover the parameters

This is the critical provenance question. The current signing chain is:

```
Ed25519 signature
  covers -> bundleHash (sha256 of canonical datapackage.json)
    covers -> per-artifact SHA-256 hashes
      covers -> actual WARC, CDXJ, pages.jsonl bytes
```

If `captureSettings` is added to `datapackage.json`, it is automatically included in the canonical JSON that produces `bundleHash`. **No changes to the signing code are needed.** The existing chain already provides what we need:

- `canonicalize(datapackage)` will include `captureSettings` because it serializes all keys
- `bundleHash = sha256(canonicalize(datapackage))` covers the settings
- `signature = sign(bundleHash)` covers the hash that covers the settings

This means a verifier can confirm: "this WACZ was produced by a holder of the signing key, and at production time, the operator asserted these capture settings were used." The signature proves the settings were not tampered with post-capture.

**What the signature does NOT prove**: that the browser actually used those settings. The operator could lie about viewport dimensions. This is an inherent limitation -- the signature is an operator attestation, not a third-party observation. RFC 3161 timestamps (backlog item R11) strengthen the temporal claim but not the parameter claim. This limitation should be documented but is acceptable: the alternative (a third-party observer of browser state) is impractical and not how any web archiving tool works.

### 4. Schema design for `captureSettings`

Define a closed, versioned schema with explicit fields for each parameter category:

**Tier 1 -- ship with parameterization** (settings that already exist as hardcoded constants in `capture.js`):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `viewport.width` | integer | 1280 | Current hardcoded value |
| `viewport.height` | integer | 720 | Current hardcoded value |
| `waitUntil` | string | "networkidle" | Playwright wait strategy |
| `maxScreenshotHeight` | integer | 8000 | `MAX_PAGE_HEIGHT` constant |

**Tier 2 -- future parameters** (do NOT implement yet, but ensure the schema can accommodate):

| Field | Type | Notes |
|-------|------|-------|
| `locale` | string | Browser locale (e.g., "en-US") |
| `timezone` | string | IANA timezone |
| `cookieConsent` | string | Auto-accept strategy (enum) |
| `userAgent` | string | Custom UA string |
| `javascript` | boolean | JS enabled/disabled |
| `delay` | integer | Extra wait after load (ms) |

**Why not use an extension/custom namespace pattern?** This is an evidence system, not a plugin framework. Every field that affects the capture output should be known, validated, and understood by verifiers. Unknown fields cannot be meaningfully verified.

**Schema versioning**: Add a `settingsVersion` field (integer, starting at 1) to `captureSettings`. When fields are added in future phases, increment the version. Verifiers that encounter an unknown version know to check for updated field definitions. This is lighter than a full JSON Schema URI approach and consistent with the existing `wacz_version` pattern.

```json
"captureSettings": {
  "settingsVersion": 1,
  "viewport": { "width": 1280, "height": 720 },
  "waitUntil": "networkidle",
  "maxScreenshotHeight": 8000
}
```

### 5. Backward compatibility and migration

Existing WACZ bundles have no `captureSettings` field. This is fine:

- **Verifiers**: absence of `captureSettings` means "captured before parameterization was available; settings unknown." Verifiers should treat missing `captureSettings` the same as `settingsVersion: 0` (implicit).
- **KV records**: existing records have no `captureSettings`. The `getCapture()` and `listCaptures()` functions already handle sparse records (they spread `existing` and overlay new fields). No migration needed.
- **API responses**: the metadata and list endpoints should include `captureSettings` only when present. For pre-parameterization captures, the field is simply absent.

No backfill of existing records is needed or desirable. The absence is the historical record.

### 6. Where parameters flow through the system

The data flow for parameters should be:

```
API request body         -->  KV pending record (sparse: only caller overrides)
                         -->  capture.js (resolve defaults + overrides)
                         -->  browser context creation (use resolved settings)
                         -->  wacz.js buildWacz() (receives resolved settings)
                         -->  datapackage.json captureSettings (dense: full resolved)
                         -->  KV complete record (captureSettings added with resolved values)
```

Key point: **resolve defaults at capture time, not at API ingestion time.** If a default changes between API versions, the WACZ should record what was actually used, not what was requested. The KV pending record stores the request; the WACZ and KV complete record store the reality.

This means `createCapture()` in `kv.js` writes the caller's overrides (or an empty object if no overrides), and `completeCapture()` writes the full resolved settings that `capture.js` actually used.

## Proposed Tasks

These are scoped to the data layer. Other agents handle API validation, browser integration, and security review.

1. **Define `captureSettings` canonical schema** (data-minion): Write a schema definition (can be a JSDoc typedef or a simple validator function) that enumerates allowed fields, types, defaults, and valid ranges. This becomes the single source of truth for what parameters exist.

2. **Extend `buildWacz()` to accept and embed `captureSettings`** (data-minion + edge-minion): Add a `captureSettings` parameter to `buildWacz()`. Embed it in `datapackage.json` before hashing. No changes to signing code needed -- `canonicalize()` handles it automatically.

3. **Extend KV record shape** (data-minion): Add `captureSettings` to `createCapture()` (sparse, caller overrides) and `completeCapture()` (dense, resolved settings). Update JSDoc comments.

4. **Update `performCapture()` to thread parameters** (edge-minion with data-minion review): `performCapture()` must accept a settings object, use it to configure the browser context, and pass the resolved settings to `buildWacz()` and `completeCapture()`.

5. **Update API response projections** (api-design-minion): The metadata endpoint (`handleGetCapture`) and list endpoint (`handleListCaptures`) should surface `captureSettings` when present.

6. **Extend verification to report settings** (data-minion): The verify endpoint should include `captureSettings` in the verification response so verifiers can see what conditions were asserted.

7. **Write migration note** (data-minion): Document in the evolution log that pre-parameterization captures lack `captureSettings` and how verifiers should interpret this.

## Risks and Concerns

### Risk 1: Parameter injection into signed manifests

If caller-supplied parameters are embedded verbatim into `datapackage.json` without validation, an attacker could inject large or malicious payloads that bloat the WACZ or cause parsing issues for verifiers. **Mitigation**: strict schema validation at API ingestion. Only known fields with known types and bounded ranges are accepted. This is an API-layer concern but has data-layer consequences.

### Risk 2: Schema evolution under immutable signatures

Once a WACZ is signed with `settingsVersion: 1`, that signature is permanent. If we later discover a field was misnamed or semantically ambiguous, we cannot fix it in existing bundles. **Mitigation**: keep the initial schema minimal (Tier 1 only -- the four fields that already exist as constants). It is easier to add fields than to rename them. YAGNI applies strongly here.

### Risk 3: False precision in settings reporting

Recording `viewport: { width: 1920, height: 1080 }` suggests the capture precisely used that viewport. But Playwright's actual rendering may differ due to device pixel ratio, scrollbar behavior, or CSS viewport units. **Mitigation**: document clearly that `captureSettings` records the *requested* configuration passed to the browser API, not a measurement of the rendered output. The screenshot itself is the ground truth.

### Risk 4: Defaulting strategy creates implicit contract

If the API accepts `{}` (no overrides) and the WACZ records the defaults, changing defaults in a future version changes what captures look like without any API change. Callers who relied on "the default viewport" may be surprised. **Mitigation**: document defaults in the API spec and consider whether defaults are versioned per API version or always "latest." My recommendation: defaults are operational and NOT promised -- the WACZ records what was used, and callers who care about specific settings should specify them explicitly.

### Risk 5: KV record growth with future parameters

While the current impact is negligible (analysis above), if future parameters include large values (e.g., custom CSS injection, cookie jar contents), KV records could grow significantly. **Mitigation**: the schema should define maximum sizes per field, and the KV pending record stores only caller overrides (sparse). If a future parameter is large, it can be stored in R2 and referenced by key rather than inlined in KV.

## Additional Agents Needed

- **api-design-minion**: Define the request body schema for capture parameters, validate inputs, design the error response for invalid parameters, update the OpenAPI spec.
- **security-minion**: Review parameter validation for injection risks, evaluate whether any proposed parameters create new attack surface (e.g., custom User-Agent enabling impersonation, cookie consent creating interaction with third-party consent management platforms).
- **edge-minion**: Implement the browser context configuration changes in `capture.js` -- translating validated parameters into Playwright `newContext()` options.
- **test-minion**: Extend WACZ verification tests to confirm parameters are covered by the signature chain. Add tests for default-only captures vs. parameterized captures.
