# Domain Plan Contribution: api-spec-minion

## Recommendations

### 1. Admin Tag -- Add, Do Not Restructure

Add a single new tag `admin` with description `API key management (operator-only)`. Place it after `signing` in the tag list. No tag nesting or `parent` (this is OpenAPI 3.1, not 3.2). The four existing tags are untouched.

### 2. Security Scheme -- Keep Single `bearerAuth`, Document Scopes in Descriptions

Do **not** create a separate `adminAuth` security scheme. The auth mechanism is identical (Bearer token via the same `bearerAuth` scheme); only the required scope differs. OpenAPI 3.1's `http`/`bearer` scheme does not support OAuth2-style scope declarations, so scope requirements must be communicated through operation `description` text and a shared `x-required-scope` extension.

Concrete approach:
- Keep `bearerAuth` as-is (no structural change).
- On each operation that requires auth, add a sentence in `description` stating the required scope: _"Requires a key with `capture` scope (or `admin` scope, which implies all scopes)."_
- Add an informational vendor extension `x-required-scope` on each secured operation (e.g., `x-required-scope: capture`). This is machine-readable for SDK generation or gateway enforcement but has no semantic meaning to the OpenAPI validator. The extension is optional -- if the team considers it premature, omit it and rely on descriptions alone.

Scope rules to document (from advisory):
| Endpoint | Required scope |
|---|---|
| `POST /v1/captures` | `capture` |
| `GET /v1/captures` | `read` (implied by `capture`) |
| `POST /v1/admin/keys` | `admin` |
| `GET /v1/admin/keys` | `admin` |
| `DELETE /v1/admin/keys/{keyId}` | `admin` |

Unauthenticated endpoints (`/health`, capture status, capture by ID, artifacts, verify, signing keys) remain `security: []` -- no change.

### 3. New 403 Response -- Add `Problem403`

The existing spec has `Problem401` but no `Problem403`. R12 introduces scope-based authorization failures (401 = bad key, 403 = valid key but insufficient scope). Add:

```yaml
Problem403:
  description: Forbidden -- valid API key but insufficient scope for this operation.
  headers: { ... same security headers as other Problem responses ... }
  content:
    application/problem+json:
      schema:
        $ref: '#/components/schemas/ProblemDetail'
      examples:
        insufficientScope:
          summary: Key lacks admin scope
          value:
            type: about:blank
            status: 403
            title: Forbidden
            detail: "This operation requires 'admin' scope."
```

Note: the `responses.js` title map already has a `403: 'Forbidden'` entry, so the implementation is ready. The response deliberately names the required scope in `detail` (per advisory: "name the required scope") but does **not** name the caller's actual scopes (information disclosure risk).

Add `'403': $ref: '#/components/responses/Problem403'` to:
- `POST /v1/captures` (key has `read` but not `capture`)
- `GET /v1/captures` (key has no `read` scope -- edge case since `capture` implies `read`)
- All three admin endpoints

### 4. New Schemas

#### `ApiKeyScope`

```yaml
ApiKeyScope:
  type: string
  enum: [capture, read, admin]
  description: >
    Permission scope for an API key. "capture" implies "read" (a key that can
    create captures can also list them). "admin" implies all scopes.
```

#### `CreateKeyRequest`

```yaml
CreateKeyRequest:
  type: object
  required: [tenantId, scopes]
  properties:
    tenantId:
      type: string
      pattern: '^[a-z0-9_-]{1,64}$'
      description: >
        Tenant identifier. Must match [a-z0-9_-]{1,64}. Used to namespace
        captures and KV records. Reusing an existing tenantId creates an
        additional key for that tenant.
      examples:
        - acme-corp
    scopes:
      type: array
      items:
        $ref: '#/components/schemas/ApiKeyScope'
      minItems: 1
      uniqueItems: true
      description: >
        Scopes granted to the new key. At least one scope is required.
        "capture" implies "read"; specifying both is allowed but redundant.
      examples:
        - [capture]
    name:
      type: string
      maxLength: 128
      description: >
        Optional human-readable label for the key (e.g., "CI pipeline",
        "staging frontend"). Returned in list responses to help operators
        identify keys. Has no authorization effect.
      examples:
        - CI pipeline
```

#### `CreateKeyResponse`

```yaml
CreateKeyResponse:
  type: object
  required: [key, keyId, tenantId, scopes, createdAt]
  description: >
    Newly created API key. The `key` field contains the raw API key and is
    shown exactly once -- it cannot be retrieved again. Store it securely.
  properties:
    key:
      type: string
      pattern: '^wrl_live_[A-Za-z0-9_-]{43}$'
      description: >
        Raw API key with "wrl_live_" prefix followed by 43 base64url characters
        (256-bit key). This value is returned exactly once and cannot be
        retrieved again. Use it as the Bearer token in the Authorization header.
      examples:
        - wrl_live_dGhpcyBpcyBhIHRlc3Qga2V5IGZvciBkb2N1bWVudGF0aW9u
    keyId:
      type: string
      pattern: '^[a-f0-9]{16}$'
      description: >
        Unique key identifier (first 16 hex chars of SHA-256 of the raw key).
        Use this to reference the key in DELETE and list operations.
      examples:
        - a1b2c3d4e5f6a7b8
    tenantId:
      type: string
      description: Tenant this key belongs to.
      examples:
        - acme-corp
    scopes:
      type: array
      items:
        $ref: '#/components/schemas/ApiKeyScope'
      description: Scopes granted to this key.
      examples:
        - [capture]
    name:
      type: ["string", "null"]
      description: Human-readable label, or null if not provided.
      examples:
        - CI pipeline
    createdAt:
      type: string
      format: date-time
      description: ISO 8601 timestamp when the key was created.
      examples:
        - '2026-03-17T14:30:00.000Z'
```

#### `ApiKeySummary`

```yaml
ApiKeySummary:
  type: object
  required: [keyId, tenantId, scopes, createdAt, revoked]
  description: >
    API key metadata returned by the list endpoint. Never includes the raw key.
  properties:
    keyId:
      type: string
      pattern: '^[a-f0-9]{16}$'
      description: Unique key identifier.
      examples:
        - a1b2c3d4e5f6a7b8
    tenantId:
      type: string
      description: Tenant this key belongs to.
      examples:
        - acme-corp
    scopes:
      type: array
      items:
        $ref: '#/components/schemas/ApiKeyScope'
      description: Scopes granted to this key.
    name:
      type: ["string", "null"]
      description: Human-readable label, or null if not provided.
    revoked:
      type: boolean
      description: True if the key has been revoked (soft-deleted).
    createdAt:
      type: string
      format: date-time
      description: ISO 8601 timestamp when the key was created.
    revokedAt:
      type: string
      format: date-time
      description: Present when revoked is true. ISO 8601 timestamp of revocation.
```

#### `KeyListResponse`

```yaml
KeyListResponse:
  type: object
  required: [data]
  description: List of all API keys. No pagination (admin key count is small).
  properties:
    data:
      type: array
      items:
        $ref: '#/components/schemas/ApiKeySummary'
      description: All API keys, including revoked ones. Empty array if none exist.
```

### 5. New Paths

#### `POST /v1/admin/keys` -- `createApiKey`

- **operationId**: `createApiKey`
- **tags**: `[admin]`
- **security**: `[bearerAuth: []]`
- **description**: Creates a new API key for the specified tenant. The raw key is returned exactly once in the response. Requires `admin` scope.
- **requestBody**: `$ref: CreateKeyRequest`
- **Responses**:
  - `201`: Key created. Body: `$ref: CreateKeyResponse`. Headers: standard security headers.
  - `400`: Invalid request (missing tenantId, invalid scopes, tenantId fails pattern). Reuse `Problem400` with admin-specific examples (bad tenantId pattern, empty scopes array).
  - `401`: `$ref: Problem401`
  - `403`: `$ref: Problem403`
  - `415`: Unsupported Media Type (not application/json). Match existing pattern from `POST /v1/captures`.
  - `429`: `$ref: Problem429` (admin rate limiter, 5/min)
  - `500`: KV write failure.

Example:
```yaml
created:
  summary: Key created for acme-corp tenant
  value:
    key: wrl_live_dGhpcyBpcyBhIHRlc3Qga2V5IGZvciBkb2N1bWVudGF0aW9u
    keyId: a1b2c3d4e5f6a7b8
    tenantId: acme-corp
    scopes: [capture]
    name: CI pipeline
    createdAt: '2026-03-17T14:30:00.000Z'
```

#### `GET /v1/admin/keys` -- `listApiKeys`

- **operationId**: `listApiKeys`
- **tags**: `[admin]`
- **security**: `[bearerAuth: []]`
- **description**: Lists all API keys across all tenants, including revoked keys. Never returns raw key values. Requires `admin` scope.
- **No parameters** (no pagination -- key count is expected to remain small).
- **Responses**:
  - `200`: Body: `$ref: KeyListResponse`. Headers: standard security headers + `Cache-Control: private, no-store`.
  - `401`: `$ref: Problem401`
  - `403`: `$ref: Problem403`
  - `429`: `$ref: Problem429`
  - `500`: KV list failure.

#### `DELETE /v1/admin/keys/{keyId}` -- `revokeApiKey`

- **operationId**: `revokeApiKey`
- **tags**: `[admin]`
- **security**: `[bearerAuth: []]`
- **description**: Revokes an API key (soft-delete). The key immediately stops working for authentication. Revoking an already-revoked key returns 204 (idempotent). Requires `admin` scope.
- **parameters**: `keyId` path param (string, pattern `^[a-f0-9]{16}$`)
- **Responses**:
  - `204`: Key revoked (or already revoked). No body.
  - `401`: `$ref: Problem401`
  - `403`: `$ref: Problem403`
  - `404`: `$ref: Problem404` (keyId does not exist at all)
  - `429`: `$ref: Problem429`
  - `500`: KV write failure.

### 6. Update Existing Endpoints with Scope Documentation

Existing authenticated endpoints (`POST /v1/captures`, `GET /v1/captures`) need:

1. **Description update**: Add scope requirement sentence. For `POST /v1/captures`: _"Requires `capture` scope."_ For `GET /v1/captures`: _"Requires `read` scope (implied by `capture`)."_

2. **Add 403 response**: Reference the new `Problem403` component response. Currently these endpoints only have 401 for auth failures.

3. **No structural auth changes**: The `security: [bearerAuth: []]` stays the same. The scope enforcement is an implementation detail behind the same Bearer scheme.

### 7. Version Bump: 0.4.0 to 0.5.0

This is a new feature addition (admin API surface) with no breaking changes to existing endpoints. Existing clients with CAPTURE_API_KEY continue to work identically during the dual-mode period. Semver minor bump to `0.5.0` is correct.

The only spec change to existing endpoints is the addition of 403 responses, which is additive (new possible status code). Strictly speaking, a client that assumed 401 was the only auth error would need updating, but RFC 9457 problem responses are self-describing and any well-behaved client handles unexpected status codes. This does not warrant a major version bump.

### 8. Spec Patterns to Follow

From the existing spec, these conventions must be maintained:

- **Security headers on every response**: All six standard headers (Referrer-Policy, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Link/TermsLink) must be present on every response object. Use `$ref` to the existing header components.
- **ProblemDetail schema for all errors**: All 4xx and 5xx responses use `application/problem+json` with `$ref: ProblemDetail`.
- **Realistic examples**: Every response needs named examples with realistic values, not placeholder data.
- **No CORS on admin endpoints**: Admin endpoints are curl/API-only. No Access-Control-Allow-Origin headers. (Contrast with capture endpoints which have CORS for browser-based submission.)
- **Cache-Control: private, no-store** on admin list endpoint (tenant-scoped data, same pattern as `GET /v1/captures`).
- **operationId naming**: camelCase, verb-first (`createApiKey`, `listApiKeys`, `revokeApiKey`). Consistent with existing `createCapture`, `listCaptures`, `getCapture`.

## Proposed Tasks

### Task 1: Add admin tag and Problem403 response component
**File**: `openapi.yaml`
**Changes**:
- Add `admin` tag to `tags` array after `signing`
- Add `Problem403` to `components/responses` following the same header/example pattern as `Problem401`
- Add `ApiKeyScope` enum schema to `components/schemas`

**Estimated effort**: Small (copy existing response pattern, add one enum schema)

### Task 2: Add admin API request/response schemas
**File**: `openapi.yaml`
**Changes**:
- Add `CreateKeyRequest`, `CreateKeyResponse`, `ApiKeySummary`, `KeyListResponse` schemas to `components/schemas`
- All schemas need descriptions on every property, realistic examples, correct `type`/`required`/`pattern` constraints

**Estimated effort**: Medium (four new schemas with examples)

### Task 3: Add admin path operations
**File**: `openapi.yaml`
**Changes**:
- Add `POST /v1/admin/keys` with full request/response definitions
- Add `GET /v1/admin/keys` with full response definition
- Add `DELETE /v1/admin/keys/{keyId}` with path parameter and response definitions
- Each operation needs: operationId, summary, description (including scope requirement), tags, security, all response status codes with examples

**Estimated effort**: Large (three new path operations with full header/error response treatment, following the verbose existing pattern)

### Task 4: Update existing authenticated endpoints
**File**: `openapi.yaml`
**Changes**:
- `POST /v1/captures`: add scope sentence to description, add 403 response
- `GET /v1/captures`: add scope sentence to description, add 403 response
- Both: update description to mention scope model

**Estimated effort**: Small (two description edits + two `$ref` additions)

### Task 5: Version bump
**File**: `openapi.yaml`
**Changes**:
- `info.version`: `0.4.0` -> `0.5.0`

**Estimated effort**: Trivial

### Task 6: Validate updated spec
**Action**: Run Spectral lint against the updated spec. Verify no broken `$ref` links, no missing examples, no operationId conflicts.

**Estimated effort**: Small

### Execution order
Tasks 1 and 2 can run in parallel (schemas and responses are independent). Task 3 depends on both (path operations reference the schemas and responses). Task 4 depends on Task 1 (references Problem403). Task 5 is independent. Task 6 runs last.

Recommended linear order: 1 -> 2 -> 3 -> 4 -> 5 -> 6.

## Risks and Concerns

### Risk 1: keyId format not yet finalized in advisory
The advisory says keys are looked up by SHA-256 hash of the raw key in KV. The `keyId` (first 16 hex chars of SHA-256) is my inference for a stable, non-secret identifier. If the implementation team uses a different identifier format (e.g., a UUID, or a different hash prefix length), the spec schemas need updating. **Mitigation**: Confirm keyId format with security-minion and edge-minion before spec authoring begins. The pattern `^[a-f0-9]{16}$` should be validated against the actual KV key structure.

### Risk 2: Verbose spec pattern creates maintenance burden
The existing spec inlines security headers on every response (no shared response template). Adding three admin endpoints means approximately 15 new response definitions, each with 5-6 header `$ref`s. This is already an issue in the existing spec (the file is ~1860 lines) and R12 will push it past 2200 lines. **Mitigation**: This is not something to fix in R12. A future backlog item could extract a multi-file spec structure. For now, follow the existing pattern exactly.

### Risk 3: 403 addition to existing endpoints is technically a behavior change
Adding 403 responses to `POST /v1/captures` and `GET /v1/captures` documents a new possible response that existing clients might not expect. However, these clients currently only have one key with all scopes, so they will never see a 403 in practice. **Mitigation**: Document in the 0.5.0 changelog that 403 is now a possible response. Since all existing keys get `capture` scope (which implies `read`), this is a documentation-only change for existing clients.

### Risk 4: No pagination on admin key list
The spec proposes no pagination for `GET /v1/admin/keys`. This is appropriate for the expected scale (tens of keys, not thousands) but should be documented as a deliberate choice. If the system grows to hundreds of tenants with multiple keys each, pagination would need to be retrofitted. **Mitigation**: Add a sentence in the operation description: _"Returns all keys without pagination. Pagination is not needed at the expected scale (tens of keys)."_

### Risk 5: Raw key in POST response body
The `CreateKeyResponse` includes the raw key in the response body. This is the correct design (the key must be shown once) but introduces a security consideration: the response must never be cached, logged at the HTTP layer, or returned through a shared proxy that logs response bodies. **Mitigation**: Add `Cache-Control: no-store` and `Pragma: no-cache` headers on the 201 response. Add a description note: _"Do not log or cache this response -- it contains the raw API key."_

## Additional Agents Needed

None beyond those already in the metaplan. The spec work is self-contained once the following inputs are confirmed:

1. **From security-minion**: Confirm the `keyId` format (SHA-256 prefix length and encoding). The spec schemas depend on this.
2. **From edge-minion**: Confirm the admin rate limiter binding name (`ADMIN_RATE_LIMITER`) and limit (5/min) for accurate spec documentation of 429 responses.
3. **From observability-minion**: No spec dependencies, but the admin subsystem log events should match the operation IDs used here (`createApiKey`, `listApiKeys`, `revokeApiKey`) for traceability.

The spec work should execute **after** security-minion and edge-minion confirm their implementation designs, since the schemas encode those decisions. If their plans change the keyId format or response structure, the spec must be updated to match.
