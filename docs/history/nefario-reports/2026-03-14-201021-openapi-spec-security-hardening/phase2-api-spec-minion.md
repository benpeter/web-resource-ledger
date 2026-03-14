# API Spec Minion -- Planning Contribution

## Domain Assessment

The existing `openapi.yaml` is well-structured and already follows most best practices: consistent `operationId` naming, RFC 9457 `ProblemDetail` reuse via `$ref`, real examples on every endpoint, reusable headers and response components, and proper OpenAPI 3.1.0 usage (including `const` keyword, `examples` arrays). This is one of the better-authored specs I could evaluate -- the gaps are additive, not structural.

Two pieces of work are needed:

1. **Add the verification endpoint** (`GET /v1/verify/{captureId}`) -- content-negotiated, returns JSON or HTML
2. **Add the signing-key endpoint** (`GET /.well-known/signing-key`)

Plus validation tooling to prevent spec drift.

---

## Question 1: Content Negotiation in OpenAPI 3.1

### Recommendation: Multiple media types under a single `200` response

OpenAPI 3.1 supports content negotiation natively through the `content` map on a Response Object. Each key is a media type; the server selects based on `Accept`. This is the canonical approach -- no hacks needed.

```yaml
responses:
  '200':
    description: Verification result. Returns JSON by default; HTML when Accept includes text/html.
    headers:
      Vary:
        description: Response varies by Accept header.
        schema:
          type: string
          enum: ['Accept']
      # ... other headers
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/VerificationResult'
        examples:
          verified:
            summary: All checks passed
            value: { ... }
          unverified:
            summary: Signature verification failed
            value: { ... }
      text/html:
        schema:
          type: string
          description: >
            Self-contained HTML page that fetches the JSON API client-side
            and renders a human-readable verification report. The HTML is a
            shell with embedded JavaScript -- it is NOT a server-rendered
            representation of the JSON response.
```

Key points:

- **`Vary: Accept` header** must be declared in the spec. The implementation already sends it (line 300 of `src/index.js`). This tells caches that the response depends on the `Accept` header.
- **Both media types under one `200`** is the correct pattern. Do not use separate paths or separate status codes for content negotiation.
- **The `text/html` schema should be `type: string`**, not a complex object. HTML responses are opaque to OpenAPI tooling -- there is no HTML schema language that OpenAPI can validate.

### Should the HTML response have a detailed schema?

**No.** The HTML response is a self-contained page (a "verification viewer app") that fetches the JSON API client-side. It is not a structured data format. The spec should:

1. Declare `text/html` as a valid response media type so SDK generators and contract tests know it exists
2. Describe its purpose in the `description` field
3. Not attempt to schema-validate the HTML content

This matches how the implementation works: `htmlVerifyResponse()` returns a static HTML shell that makes its own `fetch()` calls. The JSON response is the contract; the HTML is a convenience rendering.

---

## Question 2: Verification Endpoint Spec

Based on reading `src/index.js` lines 224-301 and `src/verify.js`, here is the full shape that needs to be captured:

### New schemas needed in `components/schemas/`

**VerificationCheck:**
```yaml
VerificationCheck:
  type: object
  required: [name, status]
  properties:
    name:
      type: string
      enum: [artifactHashes, bundleHash, signature]
      description: Name of the verification check.
    status:
      type: string
      enum: [pass, fail, skip]
      description: Outcome of this check.
    detail:
      type: string
      description: Present when status is "fail" or "skip". Human-readable explanation.
```

**VerificationSigning:**
```yaml
VerificationSigning:
  type: object
  description: >
    Cryptographic metadata extracted from the WACZ datapackage-digest.json.
    The publicKey is informational only -- verification uses the server's
    key, not this embedded value.
  required: [bundleHash, signature, publicKey, signedAt]
  properties:
    bundleHash:
      type: ["string", "null"]
      pattern: '^sha256:[a-f0-9]{64}$'
      description: SHA-256 hash of the canonical JSON of datapackage.json.
    signature:
      type: ["string", "null"]
      description: Base64-encoded Ed25519 signature over the bundleHash string.
    publicKey:
      type: ["string", "null"]
      description: >
        Base64-encoded public key embedded in the WACZ. Informational only --
        NOT used for the verification decision. The server verifies against
        its own key.
    signedAt:
      type: ["string", "null"]
      format: date-time
      description: ISO 8601 timestamp when the bundle was signed.
```

**VerificationCapture:**
```yaml
VerificationCapture:
  type: object
  required: [id, createdAt, completedAt]
  properties:
    id:
      $ref: '#/components/schemas/CaptureId'
    createdAt:
      type: string
      format: date-time
      description: ISO 8601 timestamp when the capture was submitted.
    completedAt:
      type: string
      format: date-time
      description: ISO 8601 timestamp when the capture completed.
```

**VerificationResult:**
```yaml
VerificationResult:
  type: object
  description: >
    Structured verification result for a WACZ-signed capture. The `verified`
    field is the top-level verdict; `checks` provides granular pass/fail/skip
    per check. The server verifies against its own signing key -- the
    embedded publicKey in `signing` is informational only.
  required: [verified, capture, signing, checks]
  properties:
    verified:
      type: boolean
      description: >
        True if and only if ALL checks passed. False if any check
        failed or was skipped.
    capture:
      $ref: '#/components/schemas/VerificationCapture'
    signing:
      oneOf:
        - $ref: '#/components/schemas/VerificationSigning'
        - type: "null"
      description: >
        Cryptographic metadata from the WACZ bundle. Null when the
        WACZ bundle cannot be read (e.g., missing from storage).
    checks:
      type: array
      items:
        $ref: '#/components/schemas/VerificationCheck'
      minItems: 3
      maxItems: 3
      description: >
        Exactly three checks in order: artifactHashes, bundleHash, signature.
        All three always run (no short-circuiting).
```

### Path operation

```yaml
/v1/verify/{captureId}:
  get:
    operationId: verifyCapture
    summary: Verify a WACZ-signed capture
    description: >
      Performs cryptographic verification of a WACZ-signed capture bundle.
      Returns a structured result with three independent checks: artifact
      hash integrity, bundle hash integrity, and Ed25519 signature
      verification against the server's signing key.

      Content negotiation: returns JSON by default. When the Accept header
      includes text/html, returns a self-contained HTML page that renders
      the verification result client-side.

      No authentication required -- the capture ID acts as the access secret.
      Rate-limited per IP to prevent abuse of the CPU-intensive verification.
    tags: [verification]
    security: []
    parameters:
      - name: captureId
        in: path
        required: true
        schema:
          $ref: '#/components/schemas/CaptureId'
        description: Capture ID to verify.
    responses:
      '200':
        description: >
          Verification result. JSON by default; HTML when Accept includes text/html.
          A 200 status does NOT mean the capture is verified -- check the `verified`
          field in the JSON response.
        headers:
          Vary:
            description: Response varies by Accept header.
            schema:
              type: string
              enum: ['Accept']
          Cache-Control:
            description: >
              Verified results cached publicly for 24h. Unverified results
              not cached.
            schema:
              type: string
          Access-Control-Allow-Origin:
            description: Cross-origin access allowed.
            schema:
              type: string
              enum: ['*']
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VerificationResult'
            examples:
              verified:
                summary: All three checks passed
                value:
                  verified: true
                  capture:
                    id: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
                    createdAt: '2024-01-15T10:30:00.000Z'
                    completedAt: '2024-01-15T10:30:45.123Z'
                  signing:
                    bundleHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                    signature: 'dGVzdC1zaWduYXR1cmU='
                    publicKey: 'dGVzdC1wdWJsaWMta2V5'
                    signedAt: '2024-01-15T10:30:45.000Z'
                  checks:
                    - { name: artifactHashes, status: pass }
                    - { name: bundleHash, status: pass }
                    - { name: signature, status: pass }
              unverified:
                summary: Signature verification failed
                value:
                  verified: false
                  capture:
                    id: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
                    createdAt: '2024-01-15T10:30:00.000Z'
                    completedAt: '2024-01-15T10:30:45.123Z'
                  signing:
                    bundleHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                    signature: 'dGVzdC1zaWduYXR1cmU='
                    publicKey: 'dGVzdC1wdWJsaWMta2V5'
                    signedAt: '2024-01-15T10:30:45.000Z'
                  checks:
                    - { name: artifactHashes, status: pass }
                    - { name: bundleHash, status: pass }
                    - { name: signature, status: fail, detail: Ed25519 signature verification failed }
              storageLoss:
                summary: WACZ bundle missing from storage
                value:
                  verified: false
                  capture:
                    id: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
                    createdAt: '2024-01-15T10:30:00.000Z'
                    completedAt: '2024-01-15T10:30:45.123Z'
                  signing: null
                  checks:
                    - { name: artifactHashes, status: fail, detail: WACZ bundle not found in storage }
                    - { name: bundleHash, status: fail, detail: WACZ bundle not found in storage }
                    - { name: signature, status: fail, detail: WACZ bundle not found in storage }
          text/html:
            schema:
              type: string
              description: >
                Self-contained HTML page that fetches the JSON verification
                API client-side and renders a human-readable report. Not a
                server-rendered representation of the JSON data. Includes
                embedded CSS and JavaScript with a strict CSP.
      '404':
        $ref: '#/components/responses/Problem404'
      '422':
        description: WACZ bundle exceeds maximum verifiable size (100 MB).
        content:
          application/problem+json:
            schema:
              $ref: '#/components/schemas/ProblemDetail'
      '429':
        $ref: '#/components/responses/Problem429'
      '503':
        $ref: '#/components/responses/Problem503'
```

### Implementation gap: `verifyUrl` in `getCapture` response

The implementation (line 160 of `src/index.js`) adds a `verifyUrl` field to the `CaptureRecord` response when a WACZ exists. The current `CaptureRecord` schema does not include this field. It needs to be added:

```yaml
# Add to CaptureRecord properties:
verifyUrl:
  type: string
  format: uri
  description: >
    URL to the verification endpoint for this capture. Present only
    when the capture has a signed WACZ bundle.
  examples:
    - https://wrl.example.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

And the `withWacz` example in the `getCapture` response should include it.

### New tag needed

```yaml
- name: verification
  description: WACZ bundle cryptographic verification
```

---

## Question 3: Signing Key Endpoint Spec

Based on the MVP spec (line 237): "returns current Ed25519 public key (base64-encoded raw bytes) with appropriate caching headers."

```yaml
/.well-known/signing-key:
  get:
    operationId: getSigningKey
    summary: Get the current Ed25519 public signing key
    description: >
      Returns the server's current Ed25519 public key as base64-encoded raw
      bytes (32 bytes, not SPKI-wrapped). This is the key used to verify
      WACZ bundle signatures. The key changes only on manual rotation.
    tags: [signing]
    security: []
    responses:
      '200':
        description: >
          Current signing key. Cache aggressively but revalidate on
          rotation.
        headers:
          Cache-Control:
            description: Long cache with revalidation.
            schema:
              type: string
          Content-Type:
            description: Always application/json.
            schema:
              type: string
              enum: ['application/json']
        content:
          application/json:
            schema:
              type: object
              required: [algorithm, publicKey]
              properties:
                algorithm:
                  type: string
                  const: Ed25519
                  description: Signing algorithm. Always Ed25519.
                publicKey:
                  type: string
                  description: >
                    Base64-encoded raw Ed25519 public key (32 bytes).
                    This is the raw key bytes, not SPKI or JWK formatted.
                  examples:
                    - 'MCowBQYDK2VwAyEAexamplekeybase64encoded='
              additionalProperties: false
            examples:
              currentKey:
                summary: Current Ed25519 public key
                value:
                  algorithm: Ed25519
                  publicKey: 'MCowBQYDK2VwAyEAexamplekeybase64encoded='
      '503':
        description: Signing key not configured.
        content:
          application/problem+json:
            schema:
              $ref: '#/components/schemas/ProblemDetail'
            examples:
              notConfigured:
                summary: No signing key configured
                value:
                  type: about:blank
                  status: 503
                  title: Service Unavailable
                  detail: Signing key is not configured.
```

### Design note for api-design-minion

I have drafted a minimal JSON envelope (`algorithm` + `publicKey`) rather than raw base64 text, because:

1. A bare base64 string with `text/plain` gives consumers no machine-readable way to know the algorithm
2. JWK is overkill for a single Ed25519 key (YAGNI)
3. A simple JSON object with two fields is the minimum viable envelope that allows future extensibility (add `keyId`, `createdAt`, `expiresAt` if key versioning is added later) without breaking existing consumers

The api-design-minion should confirm or override this format choice. If the issue's "base64-encoded raw bytes" is meant to be literally raw bytes (not JSON), the spec would change to `text/plain` with `type: string` -- but that's harder for consumers to use correctly.

### New tag needed

```yaml
- name: signing
  description: Signing key management
```

---

## Question 4: Validation Tooling

### Recommendation: `@redocly/cli` (not IBM's `openapi-validator`)

The issue mentions "openapi-validator (or equivalent)." I recommend **Redocly CLI** over IBM's `openapi-validator` for this project. Reasons:

1. **OpenAPI 3.1 support** -- Redocly CLI fully supports OpenAPI 3.1.0 (the version this spec uses). IBM's `openapi-validator` has historically lagged on 3.1 support.
2. **Bundling + linting in one tool** -- If the spec ever goes multi-file, Redocly handles both.
3. **Lighter dependency** -- Single npm package (`@redocly/cli`), no Java requirement.
4. **Structure-aware linting** -- Goes beyond JSON Schema validation to check semantic correctness (unused components, ref resolution, operation ID uniqueness).

### Implementation plan

Add to `package.json` devDependencies:
```json
"@redocly/cli": "^1.34.0"
```

Add npm script:
```json
"lint:api": "redocly lint openapi.yaml"
```

Add a minimal `redocly.yaml` config at project root:
```yaml
extends:
  - recommended

rules:
  operation-operationId-unique: error
  no-unresolved-refs: error
  no-unused-components: warn
  operation-summary: error
  operation-operationId: error
  tag-description: error
  info-description: error
  operation-description: error
```

### Spectral alternative

If the team prefers Spectral (more common in contract-first workflows), the equivalent would be:

```json
"@stoplight/spectral-cli": "^6.15.0"
```

```yaml
# .spectral.yaml
extends: ["spectral:oas"]
```

I recommend Redocly for this project because it aligns with the technology preferences (Helix/Adobe-adjacent), is a single tool for linting and future bundling, and provides clearer error messages. But either tool satisfies the acceptance criterion.

### CI integration

Whichever tool is chosen, add a `lint:api` script that can be run in CI:

```bash
npx redocly lint openapi.yaml --format=stylish
```

This should fail the build on errors (not warnings), matching the acceptance criterion: "reports no errors against `openapi.yaml`."

---

## Gaps Found in Existing Spec

Beyond the two new endpoints, I identified these gaps between the implementation and the current spec:

### 1. Missing `verifyUrl` field in `CaptureRecord`

`src/index.js` line 160 adds `verifyUrl` to the getCapture response when WACZ is present. The schema does not include this field. This is a spec-implementation divergence.

### 2. Missing `Vary` header on verify and artifact responses

The verify endpoint sends `Vary: Accept` (line 300). The artifact endpoint sends `Access-Control-Allow-Origin: *` (line 217). These headers should be declared in the spec.

### 3. `CaptureRecord.artifacts.headers` is conditional

The implementation (lines 141-143) only includes `artifacts.headers` when `record.artifacts?.headers` exists. The schema marks `headers` as not required (correct) but the `description` could be clearer about this conditionality.

### 4. `Access-Control-Allow-Origin` header on artifact responses

The artifact endpoint (line 217) sends `Access-Control-Allow-Origin: *` but the spec for that endpoint (line 596) doesn't declare this header.

### 5. 500 error response

The implementation can return a 500 for `createCapture` (line 104: "Could not create capture record") but no `Problem500` response is defined in components. This is a minor gap -- 500s are often left implicit -- but for completeness it should be there.

---

## Risks and Dependencies

### Risks

1. **Content negotiation and SDK generators** -- Some SDK generators (openapi-generator, Speakeasy) handle multiple response media types differently. The `text/html` response on the verify endpoint may cause SDK generators to emit an awkward union type or a raw string method. This is acceptable since the HTML response is for browsers, not SDK consumers. Marking the JSON response as the "default" (by listing it first) is sufficient.

2. **Validation tooling version pinning** -- Redocly CLI and Spectral both evolve rapidly. Pin to a specific major version in `package.json` to avoid surprise failures from new rules.

3. **Spec size** -- The spec will grow from ~634 lines to approximately 850-900 lines with these additions. This is still a single-file spec, which is fine at this scale. Multi-file splitting would be premature.

### Dependencies

- **api-design-minion** must confirm the signing-key endpoint response format (JSON envelope vs. raw base64). The spec draft above assumes JSON.
- **security-minion** decisions on HSTS and X-Frame-Options will add headers to the global spec declarations. The `components/headers` section will need updating.
- **edge-minion** backpressure decision may add a new error response (global 503) that should be declared in the spec.

---

## Deliverables Summary

| Item | File | Estimate |
|------|------|----------|
| Add `VerificationResult`, `VerificationCheck`, `VerificationSigning`, `VerificationCapture` schemas | `openapi.yaml` | ~60 lines |
| Add `GET /v1/verify/{captureId}` path with content negotiation | `openapi.yaml` | ~80 lines |
| Add `GET /.well-known/signing-key` path | `openapi.yaml` | ~50 lines |
| Add `verifyUrl` field to `CaptureRecord` schema | `openapi.yaml` | ~8 lines |
| Add missing `Vary` and `Access-Control-Allow-Origin` headers | `openapi.yaml` | ~15 lines |
| Add `verification` and `signing` tags | `openapi.yaml` | ~4 lines |
| Add `@redocly/cli` devDependency + `redocly.yaml` config | `package.json`, `redocly.yaml` | ~20 lines |
| Add `lint:api` npm script | `package.json` | 1 line |
| Update examples to include `verifyUrl` | `openapi.yaml` | ~5 lines |

Total estimated spec growth: ~220 lines, bringing `openapi.yaml` to approximately 850 lines.

---

## No Additional Specialists Needed

The metaplan already includes all relevant specialists. The api-design-minion is the key dependency for the signing-key format decision. No other specialists are needed beyond those already planned.
