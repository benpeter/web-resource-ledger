# Domain Plan Contribution: api-design-minion

## Recommendations

### 1. Same Endpoint, Extended Request Body (not presets, not a separate resource)

**Recommendation: Extend `POST /v1/captures` with optional fields alongside `url`.**

Evaluated three approaches:

**Option A: Request body extension** (recommended)
Add optional fields to the existing `{ url }` request body. Callers who send `{ url }` today continue working unchanged. Callers who want parameters send `{ url, viewport: { width: 1280, height: 720 }, waitUntil: "networkidle" }`.

- Pros: Zero breaking changes. Single endpoint. No extra KV/storage entities. Obvious to discover (the schema tells you what's possible). Maps 1:1 to SDK methods (`client.captures.create({ url, viewport })`). Aligns with KISS and YAGNI.
- Cons: The request body grows over time. Parameters that don't apply to the current renderer are silently ignored or require version-aware validation.

**Option B: Named presets** (`POST /v1/capture-presets` to CRUD, then `POST /v1/captures` references preset by ID)
Callers define reusable configurations ("desktop-no-cookies", "mobile-iphone-14") and reference them.

- Pros: Reusable across captures. Clean request body.
- Cons: Two-resource lifecycle to manage. Presets need CRUD endpoints, storage, tenant scoping, versioning. Massive API surface expansion for a feature that has zero demonstrated demand. Violates YAGNI hard. Presets can also drift from the server's actual capabilities -- a preset created under v1 parameters may reference fields v2 removed.

**Option C: Separate configuration resource** (`POST /v1/capture-configs`)
Similar to presets but framed as "configurations" rather than "presets."

- Cons: Same as presets. Different name, same problem.

**Verdict: Option A.** The project philosophy is YAGNI and Lean and Mean. Presets add a resource lifecycle, storage, and CRUD endpoints for a problem that doesn't exist yet. If preset demand emerges later, presets can reference the same parameter schema -- the body extension is a prerequisite for presets anyway. Build the foundation (body extension) without the abstraction layer (presets).

### 2. Parameter Structure: Top-Level Fields for Primitives, Nested Objects for Groups

**Recommended request body shape:**

```json
{
  "url": "https://example.com",
  "viewport": {
    "width": 1280,
    "height": 720
  },
  "waitUntil": "networkidle",
  "maxWaitMs": 25000,
  "cookies": [
    {
      "name": "consent",
      "value": "all",
      "domain": ".example.com",
      "path": "/"
    }
  ],
  "screenshotMaxHeight": 8000
}
```

**Structuring rationale:**

- **`url`** (top-level, required): Unchanged. The resource being captured.
- **`viewport`** (nested object, optional): Groups width and height because they are co-dependent. A viewport makes no sense with only one dimension. Default: `{ width: 1280, height: 720 }` (current hardcoded values).
- **`waitUntil`** (top-level enum, optional): Single value, no nesting needed. Maps to Playwright's `waitUntil` option. Values: `"load"`, `"domcontentloaded"`, `"networkidle"`. Default: `"networkidle"` (current behavior).
- **`maxWaitMs`** (top-level integer, optional): Navigation timeout in milliseconds. Default: `25000` (current `NAV_TIMEOUT_MS`). Constrained: min 5000, max 25000. The 25s ceiling is a hard infrastructure constraint (30s `ctx.waitUntil` budget minus 5s headroom).
- **`cookies`** (top-level array, optional): Array of cookie objects to inject before navigation. Each cookie requires `name`, `value`, `domain`; `path`, `secure`, `httpOnly`, `sameSite`, `expires` are optional. This addresses the cookie consent banner problem directly.
- **`screenshotMaxHeight`** (top-level integer, optional): Pixel height cap. Default: `8000` (current `MAX_PAGE_HEIGHT`). Constrained: min 720, max 16000.

**Fields deliberately NOT proposed at this stage:**

- **`localStorage`** / **`sessionStorage`**: Higher security risk (arbitrary JS execution context), more complex to validate, no demonstrated need. Park until demand.
- **`userAgent`**: Tempting but opens fingerprinting and spoofing concerns. Park until demand.
- **`deviceEmulation`**: Playwright supports it, but it's a large parameter surface (deviceScaleFactor, isMobile, hasTouch). Park until someone asks.
- **`headers`**: Custom request headers create SSRF amplification risk. Park.
- **`javascript`**: Arbitrary JS injection is a security red line for an evidence service. Never.

**Why not a single `options` or `params` envelope?** An envelope like `{ url, options: { viewport, ... } }` adds a nesting level without information gain. The top level IS the options -- `url` is just the primary one. Flat-where-possible, nested-where-semantically-grouped.

### 3. Communicating Applied Parameters (Evidence Provenance)

**This is the most critical API design question for an evidence product.**

When a capture completes, the response and KV record must communicate exactly what parameters were applied. This serves two purposes:

1. **Reproducibility**: A verifier can see the conditions under which evidence was collected.
2. **Transparency**: If cookies were injected, the capture's evidentiary weight is different from a clean-slate capture.

**Recommendation: Add an `appliedParams` object to the CaptureRecord response and to the KV record.**

```json
{
  "id": "cap_...",
  "status": "complete",
  "url": "https://example.com",
  "appliedParams": {
    "viewport": { "width": 1280, "height": 720 },
    "waitUntil": "networkidle",
    "maxWaitMs": 25000,
    "screenshotMaxHeight": 8000,
    "cookiesInjected": 2
  },
  "createdAt": "...",
  "completedAt": "...",
  "artifacts": { ... }
}
```

**Design decisions for `appliedParams`:**

- **Always present**: Even for default-parameter captures, `appliedParams` shows the defaults that were used. This eliminates ambiguity -- a missing `appliedParams` field on old captures means "captured before parameterization was available" (not "captured with defaults").
- **Reflects actual values, not requested values**: If the caller requests `maxWaitMs: 30000` but the server clamps to `25000`, `appliedParams` shows `25000`. The response is ground truth.
- **Cookie values are NOT echoed**: `cookiesInjected: 2` (count) instead of the full cookie array. Cookie values may contain session tokens, PII, or secrets. The count proves cookies were injected without leaking their contents. The cookie *names* could optionally be included (`cookieNames: ["consent", "lang"]`) but values must never appear in responses or KV records.
- **Stored in KV**: `appliedParams` is part of the capture record. This means the WACZ bundle's provenance metadata can include it, making parameterization auditable at the evidence layer.

**Impact on WACZ/signing**: The `appliedParams` should be included in the WACZ `datapackage.json` metadata so that verification can confirm what parameters were used. This is a WACZ-layer concern but the API design must ensure the data is available.

### 4. Backward Compatibility

The current API accepts `{ url }`. The extension must be strictly additive.

**Compatibility guarantees:**

1. **`{ url }` continues to work identically.** No new required fields. No behavioral change for callers who don't send new fields.
2. **Unknown fields are ignored.** The current handler does `body.url` and ignores everything else. This behavior should be formalized: the API ignores unknown fields in the request body (lenient reader pattern). This is already the de facto behavior -- the code reads `body.url` and nothing else.
3. **`appliedParams` in response is additive.** Existing callers that destructure `{ id, statusUrl, note }` from the 202 response will not break. `appliedParams` appears in the capture record (GET), not in the 202 acceptance response.
4. **No version bump needed.** This is a purely additive change within v1. New optional request fields, new optional response fields. The OpenAPI spec version increments (0.2.0 -> 0.3.0 semver minor) but the URL path stays `/v1/captures`.

**Validation behavior for new fields:**

- If a caller sends a recognized parameter with an invalid value (e.g., `viewport: { width: -1 }`), return 400 with a field-specific error.
- If a caller sends a recognized parameter with a valid-but-clamped value (e.g., `maxWaitMs: 50000`), silently clamp and record the actual value in `appliedParams`. Do NOT reject -- clamping is friendlier and the response shows what was actually used.
- If a caller sends an unrecognized field (e.g., `foobar: true`), ignore it silently. This is the lenient reader pattern. The alternative (reject unknown fields) is stricter but breaks forward compatibility when clients add fields the server doesn't know about yet.

**Tradeoff note on strict vs. lenient parsing:** A strict parser that rejects unknown fields catches typos (`viewprot` instead of `viewport`) at the cost of breaking clients that send fields from a newer spec version. For an evidence service where parameter correctness matters, I'd lean toward **warn-but-accept**: process the capture with recognized fields only, and include an `ignoredFields` array in the 202 response if any unrecognized fields were present. This catches typos without rejecting the request.

```json
{
  "id": "cap_...",
  "statusUrl": "...",
  "note": "...",
  "ignoredFields": ["viewprot"]
}
```

### 5. Same Endpoint, Not Separate

**Recommendation: Keep `POST /v1/captures` as the single capture submission endpoint.**

Arguments against a separate `POST /v1/captures/parameterized` or `POST /v1/advanced-captures`:

- **Splits the capture lifecycle in two.** Status polling, retrieval, verification, listing -- all of these work on capture IDs. Having two creation endpoints for the same resource type means both produce the same IDs, stored in the same KV, listed in the same endpoint. The only difference is input validation at creation time. That's not enough to justify a separate resource.
- **SDK awkwardness.** `client.captures.create()` vs. `client.advancedCaptures.create()`? The resource IS a capture. Parameters are input to the capture, not a different kind of capture.
- **Precedent.** Stripe doesn't have `POST /v1/simple-charges` and `POST /v1/parameterized-charges`. The charge endpoint accepts parameters. GitHub doesn't split issues by complexity of the creation payload.

**The only scenario where a separate endpoint makes sense** is if parameterized captures have fundamentally different infrastructure requirements (different queue, different timeout budget, different billing). That's not the case here -- the same Playwright session pool handles both.

### 6. Request Validation Schema (for spec handoff)

For the api-spec-minion, the request body schema should be:

```yaml
CaptureRequest:
  type: object
  required: [url]
  properties:
    url:
      type: string
      format: uri
      description: Public http or https URL to capture.
    viewport:
      type: object
      properties:
        width:
          type: integer
          minimum: 320
          maximum: 3840
          default: 1280
          description: Viewport width in pixels.
        height:
          type: integer
          minimum: 240
          maximum: 2160
          default: 720
          description: Viewport height in pixels.
      required: [width, height]
      description: Browser viewport dimensions. Both width and height must be provided together.
    waitUntil:
      type: string
      enum: [load, domcontentloaded, networkidle]
      default: networkidle
      description: Navigation wait condition. "networkidle" waits for network activity to settle.
    maxWaitMs:
      type: integer
      minimum: 5000
      maximum: 25000
      default: 25000
      description: >
        Maximum time in milliseconds to wait for the page to load.
        Clamped to 25000 (infrastructure ceiling). Values above the maximum
        are silently clamped; the actual value is reported in appliedParams.
    cookies:
      type: array
      maxItems: 50
      items:
        type: object
        required: [name, value, domain]
        properties:
          name:
            type: string
            maxLength: 256
          value:
            type: string
            maxLength: 4096
          domain:
            type: string
            maxLength: 256
            description: >
              Cookie domain. Must match or be a parent domain of the capture URL's host.
              Cross-domain cookies are rejected (400).
          path:
            type: string
            maxLength: 256
            default: /
          secure:
            type: boolean
            default: false
          httpOnly:
            type: boolean
            default: false
          sameSite:
            type: string
            enum: [Strict, Lax, None]
            default: Lax
      description: >
        Cookies to inject into the browser context before navigation.
        Cookie domain must match the target URL's domain. Injected cookies
        are recorded in evidence metadata (count only, not values).
    screenshotMaxHeight:
      type: integer
      minimum: 720
      maximum: 16000
      default: 8000
      description: >
        Maximum screenshot height in pixels. Pages taller than this are
        clipped. Values above 16000 are silently clamped.
```

Key schema design points for specifiability:
- Every field has explicit `minimum`, `maximum`, `default`, and `description`.
- `viewport` requires both fields when present (partial viewport is nonsensical).
- `cookies` array has `maxItems: 50` to bound resource consumption.
- Cookie `domain` validation is called out in the description (server-side enforcement against the capture URL).
- Enum values for `waitUntil` and `sameSite` are explicit.

### 7. operationId Convention

The existing spec uses `createCapture` for `POST /v1/captures`. This doesn't change. The operation accepts more fields; the operationId stays the same. SDK method: `client.captures.create({ url, viewport, cookies, ... })`.

### 8. Error Response Design for Parameter Validation

Parameter validation errors should follow the existing RFC 9457 pattern but include field-level detail:

```json
{
  "type": "about:blank",
  "status": 400,
  "title": "Bad Request",
  "detail": "One or more capture parameters are invalid.",
  "errors": [
    { "field": "viewport.width", "detail": "Must be between 320 and 3840." },
    { "field": "cookies[0].domain", "detail": "Cookie domain '.evil.com' does not match capture URL host 'example.com'." }
  ]
}
```

This extends the current pattern (single `detail` string) with an optional `errors` array for multi-field validation. The `errors` array is an RFC 9457 extension field -- it's allowed by the spec.

**Cookie domain validation deserves special attention.** A caller should not be able to inject cookies for domains other than the target URL's domain (or parent domains). This is a security boundary: injecting cookies for `.google.com` when capturing `example.com` is either a mistake or an attack. Return 400 with a clear error.


## Proposed Tasks

1. **Define the `CaptureRequest` schema** in the OpenAPI spec, replacing the current inline `{ url }` schema with the full parameterized schema. All new fields optional. (api-spec-minion)

2. **Define the `AppliedParams` schema** in the OpenAPI spec, add it to `CaptureRecord` and `CaptureSummary` responses. (api-spec-minion)

3. **Implement request body parsing and validation** in `handleCreateCapture()`: extract new fields, validate constraints, clamp values, reject invalid cookie domains. (implementation)

4. **Pass parameters through to `performCapture()`**: extend the function signature to accept a params object instead of individual positional args. (implementation)

5. **Apply parameters in `defaultRenderer()`**: use caller-provided viewport, waitUntil, cookies, maxWaitMs, screenshotMaxHeight instead of hardcoded constants. (implementation)

6. **Store `appliedParams` in KV**: extend `createCapture()` to write the params, extend `completeCapture()` to preserve them, extend response builders to include them. (implementation)

7. **Include `appliedParams` in WACZ metadata**: add to `datapackage.json` so evidence provenance is cryptographically bound. (implementation)

8. **Update the OpenAPI spec** to document the `ignoredFields` behavior in the 202 response. (api-spec-minion)

9. **Add parameter validation tests**: viewport bounds, cookie domain matching, maxWaitMs clamping, unknown field warning. (testing)


## Risks and Concerns

### Cookie Injection and Evidence Integrity (HIGH)

Injecting cookies fundamentally changes the meaning of a capture. A screenshot taken after injecting an auth cookie shows a different page than an anonymous visitor would see. The API design handles this by recording `cookiesInjected` count in `appliedParams`, but the **product** must decide how to frame this to users:
- Should captures with injected cookies carry a different verification status?
- Should the verification page display a warning like "This capture used injected cookies"?
- Does the WACZ bundle need a different metadata field to flag non-clean-slate captures?

This is a product/evidence-integrity question, not purely an API design question. The API provides the mechanism (transparent recording); the product decides the policy.

### Cookie Domain Validation is a Security Boundary (MEDIUM)

The API must enforce that injected cookies only target the domain being captured (or its parent domains). Without this, a caller could inject tracking cookies for unrelated domains, which the browser would send during subresource loading. This is a form of cross-site request forgery facilitated by the API.

Implementation must validate: the cookie's `domain` field must be equal to, or a parent domain of, `new URL(url).hostname`. E.g., capturing `https://www.example.com` allows cookies for `.example.com` and `.www.example.com` but not `.evil.com`.

### Parameter Clamping vs. Rejection (LOW)

The recommendation is to clamp out-of-range values (e.g., `maxWaitMs: 50000` becomes `25000`) rather than reject. This is developer-friendly but means the caller might not realize their requested value wasn't honored. The `appliedParams` response mitigates this, but callers who don't check `appliedParams` may be surprised. An alternative is strict rejection (400 for any out-of-range value). The choice depends on the project's error philosophy.

**Recommendation**: Clamp for values that have a natural ceiling imposed by infrastructure (maxWaitMs, screenshotMaxHeight). Reject for values that are structurally wrong (negative width, non-matching cookie domain).

### KV Record Size Growth (LOW)

Adding `appliedParams` to every KV record increases record size. With the proposed schema, the additional JSON is roughly 200-500 bytes per record. KV values can be up to 25 MB, so this is negligible. However, if cookie injection grows (50 cookies * ~300 bytes each = 15 KB of cookie data), and we decide to store cookie names in `appliedParams`, records could grow. The current design (count only, not values) keeps this bounded.

### `performCapture()` Function Signature (LOW)

The current signature is `(env, url, ip, captureId, tenantId, renderer)` -- six positional parameters. Adding more is unsustainable. The implementation should refactor to accept an options object: `performCapture(env, { url, ip, captureId, tenantId, params }, renderer)`. This is an internal refactor, not an API change, but it's a prerequisite for parameter support.

### Forward Compatibility of `appliedParams` (LOW)

As new parameters are added in future versions, `appliedParams` grows. Old captures lack fields that new captures have. Consumers of `appliedParams` must tolerate missing fields (treat absence as "not available at capture time"). This is standard additive evolution but should be documented.


## Additional Agents Needed

- **security-minion**: Cookie injection opens new attack surface. Cookie domain validation is a security boundary. The security implications of allowing callers to control browser state in an evidence-capture service need explicit review. Also: should injected cookies be considered in rate limiting or abuse detection?

- **evidence-integrity specialist** (if one exists, or product owner): The interaction between parameterization and evidence claims needs a product decision. What does "evidence" mean when the capture was taken with injected state? This is not an API question.

- **api-spec-minion**: For authoring the updated OpenAPI spec with the `CaptureRequest` schema, `AppliedParams` response schema, `ignoredFields` in the 202 response, and updated examples.
