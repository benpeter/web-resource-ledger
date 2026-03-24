## Domain Plan Contribution: api-spec-minion

### Recommendations

#### (a) shareToken security scheme: Remove entirely, do not replace

The `shareToken` security scheme (lines 51-58) should be **deleted from `components/securitySchemes`** with no replacement. Reasons:

1. **There is no "ID-as-capability" security scheme in OpenAPI.** The capability model is an architectural decision, not an authentication mechanism. The spec should not invent a custom security scheme to describe it. The capture ID is a path parameter, not a credential -- it does not belong in `securitySchemes`.

2. **Documentation of the capability model belongs in prose, not schema.** The `info.description` or a new top-level description paragraph should mention that individual capture IDs are unguessable 128-bit identifiers and that knowing the ID grants read access. This is a design note, not a security scheme.

3. **Removing cleanly avoids SDK confusion.** If a security scheme exists, SDK generators create auth configuration for it. A "capability token" scheme that is really just a path segment would generate misleading SDK code (auth interceptors, token refresh logic, etc.).

Specific change: Delete lines 51-58 entirely. No replacement security scheme needed.

#### (b) GET capture endpoints: Use `security: []` to declare unauthenticated access

Three endpoints currently declare `security: [bearerAuth, shareToken]` and must change to `security: []`:

| Endpoint | operationId | Current security | New security |
|----------|------------|-----------------|-------------|
| GET `/v1/captures/{captureId}/status` | `getCaptureStatus` | `bearerAuth \| shareToken` | `[]` (none) |
| GET `/v1/captures/{captureId}` | `getCapture` | `bearerAuth \| shareToken` | `[]` (none) |
| GET `/v1/captures/{captureId}/artifacts/{name}` | `getCaptureArtifact` | `bearerAuth \| shareToken` | `[]` (none) |

The `security: []` pattern is already used correctly in this spec for the health, verification, and signing key endpoints. This is idiomatic OpenAPI for "no authentication required."

For each endpoint, the following changes are needed:

1. **Replace `security` block**: Change from the two-item array to `security: []`.
2. **Remove the `token` query parameter**: Each endpoint has a `token` query parameter (e.g., lines 2528-2533, 2615-2620, 2817-2822). These must be deleted entirely.
3. **Rewrite the `description`**: Remove all references to "share token", "?token=wrl_share_...", and "Bearer token" requirements. Replace with language like: "Returns metadata for a completed capture. No authentication required -- the capture ID serves as a capability token. Returns 404 if the capture does not exist or has not yet completed."
4. **Remove the cross-tenant enumeration note**: The current descriptions mention "cross-tenant access returns 404 to prevent enumeration." With public access, there is no concept of cross-tenant access on these endpoints. Simplify to just "Returns 404 if the capture does not exist."

**Cache-Control header consideration**: The GET `/v1/captures/{captureId}` and GET `/v1/captures/{captureId}/status` currently use `Cache-Control: private, no-store`. With public (unauthenticated) access, the `private` directive is semantically incorrect -- it tells shared caches (CDN, proxies) not to cache the response, which was appropriate when the response was tenant-scoped. Two options:
- Status endpoint: Keep `no-store` (drop `private`) since status is mutable and polling-oriented.
- Capture record endpoint: Consider `no-store` (drop `private`) since capture records are immutable once complete. However, the record contains tenant-derived data, and aggressive caching of captures would be a product decision, not a spec decision. Recommend `no-store` without `private` for now and flag as a future optimization.
- Artifacts endpoint: Already uses `public, max-age=31536000, immutable` -- no change needed.

The list endpoint (`GET /v1/captures`, line 1764) keeps `security: [bearerAuth]` unchanged. Its `private, no-store` cache directive is correct for tenant-scoped responses.

#### (c) Response status code changes: Remove 401 and 410 from three endpoints

**Remove `401` response reference from three endpoints:**
- GET `/v1/captures/{captureId}/status` (line 2581): Delete `'401': $ref: '#/components/responses/Problem401'`
- GET `/v1/captures/{captureId}` (line 2699): Delete `'401': $ref: '#/components/responses/Problem401'`
- GET `/v1/captures/{captureId}/artifacts/{name}` (line 2880): Delete `'401': $ref: '#/components/responses/Problem401'`

The `Problem401` component itself (lines 1514-1539) **stays** -- it is referenced by 12+ other endpoints (list captures, create capture, batch capture, webhooks, admin, account, schedules).

**Remove `410` response from three endpoints:**
Each of the three endpoints has an inline 410 response block for "Share token has expired" (lines 2584-2593, 2702-2711, 2883-2892). These must be **deleted entirely** since share tokens no longer exist. The 410 status code had no other use on these endpoints.

**Summary of response changes per endpoint:**

| Endpoint | Remove 401 | Remove 410 | Keep 404 |
|----------|-----------|-----------|---------|
| `getCaptureStatus` | Yes | Yes | Yes (already present) |
| `getCapture` | Yes | Yes | Yes (already present) |
| `getCaptureArtifact` | Yes | Yes | Yes (already present, plus 451 stays) |

#### (d) Remove the POST /v1/captures/{captureId}/share endpoint entirely

The entire path item at `/v1/captures/{captureId}/share` (lines 2713-2796) must be deleted. This includes:
- The `post` operation with operationId `createShareToken`
- The request body schema (expiresIn)
- The 201 response with token/shareUrl/expiresAt schema
- The 401 and 404 error responses

**SDK generation implications:**

1. **Breaking change for generated SDKs**: Any SDK generated from the current spec will have a `createShareToken()` method. Removing the endpoint removes this method, which is a compile-time breaking change. The `oasdiff` check will flag this as an ERR-level breaking change (endpoint removed).

2. **Method removal is clean**: The `createShareToken` operationId maps to a standalone method in generated SDKs. It does not share request/response schemas with other endpoints (the 201 response schema with `token`/`shareUrl`/`expiresAt` is inline, not in `components/schemas`). Removal is a clean deletion with no orphan types.

3. **Auth parameter removal from three endpoints**: SDKs currently generate an optional `token` query parameter on `getCaptureStatus`, `getCapture`, and `getCaptureArtifact`. Removing this parameter is another breaking SDK change (callers passing `token` will get a type error). `oasdiff` will flag these as parameter-removed breaking changes.

4. **Security scheme removal**: SDKs generated with the `shareToken` security scheme will have configuration for it (e.g., a `setShareToken()` config method). Removing it is breaking for SDK consumers who used it. In practice, this is the same population affected by the endpoint removal.

5. **Version bump**: The `info.version` should bump from `0.7.0` to `0.8.0` (minor bump while pre-1.0, since this is a breaking API change). The pre-1.0 status means minor bumps are expected to carry breaking changes per semver conventions.

#### Additional spec-level changes

**CaptureId schema description (line 122):**
Currently reads: "Unique capture identifier. Use with tenant Bearer auth or a share token to access capture records and artifacts."
Change to: "Unique capture identifier (128-bit, unguessable). Knowing the capture ID grants read access to the capture record and its artifacts."

**CaptureRecord schema description (lines 511-520):**
- Remove: "Requires tenant authentication (Bearer token) or a valid share token."
- Remove: "To delegate read access, see POST /v1/captures/{captureId}/share."
- Add: "Individual captures are publicly accessible by ID. No authentication is required."

**bearerAuth description (lines 40-43):**
Currently reads: "Required for capture submission (POST /v1/captures) and capture listing (GET /v1/captures)."
This is already accurate for the new model. No change needed.

### Proposed Tasks

**Task 1: Remove shareToken security scheme and /share endpoint**
- Delete `shareToken` from `components/securitySchemes` (lines 51-58)
- Delete entire `/v1/captures/{captureId}/share` path item (lines 2713-2796)
- Complexity: Low (pure deletion)

**Task 2: Update three GET capture endpoints to unauthenticated**
- For each of `getCaptureStatus`, `getCapture`, `getCaptureArtifact`:
  - Replace `security` block with `security: []`
  - Remove `token` query parameter
  - Rewrite `description` to remove share token and auth references
  - Remove `401` response reference
  - Remove `410` inline response block
  - Update Cache-Control from `private, no-store` to `no-store` (status and capture record endpoints)
- Complexity: Medium (three endpoints, each with multiple sections to edit, easy to miss one reference)

**Task 3: Update component-level descriptions**
- Update `CaptureId` schema description
- Update `CaptureRecord` schema description
- Complexity: Low

**Task 4: Bump spec version**
- Change `info.version` from `0.7.0` to `0.8.0`
- Complexity: Trivial

**Task 5: Run oasdiff breaking check**
- Run `oasdiff breaking` between current main spec and updated spec
- Verify that only the expected breaking changes are flagged (endpoint removed, parameters removed, security schemes removed)
- No surprise breakage from unintended edits
- Complexity: Low

**Task 6: Validate updated spec with Spectral**
- Run `spectral lint` against the updated spec
- Ensure no new violations from the edits (broken $ref, missing descriptions, etc.)
- Verify the `shareToken` security scheme is not referenced anywhere after removal
- Complexity: Low

**Recommended execution order**: Tasks 1-4 as a single atomic edit (they are interdependent -- removing the security scheme without updating the endpoints that reference it would break $ref resolution). Task 5 and 6 as validation after the edit.

### Risks and Concerns

1. **Orphan references**: The `shareToken` security scheme is referenced in three endpoint `security` blocks. If any of those references are not cleaned up in the same edit, the spec becomes invalid (dangling $ref). Mitigation: grep for `shareToken` across the entire spec after editing to verify zero references remain.

2. **Inline 410 response blocks are easy to miss**: The 410 responses are not $ref'd to a component -- they are inline on each of the three endpoints. A find-and-replace for `Problem410` would miss them. Mitigation: search for `410` and `Share token` in the spec after editing.

3. **SDK consumers with pinned versions**: If any external consumer has generated an SDK from the current spec and is calling `createShareToken()`, their code breaks on the next SDK regeneration. Risk is low (pre-1.0 API, limited distribution), but the version bump to 0.8.0 signals the contract change clearly.

4. **Cache-Control change from `private, no-store` to `no-store`**: This is a behavioral change that could affect CDN behavior if the API sits behind a caching layer. The `private` directive prevents shared caches from storing the response. Dropping it means a CDN *could* cache the response if it ignores `no-store` (non-compliant but not unheard of). This is a minor concern since `no-store` is a strong enough signal, but worth noting.

5. **The verify endpoint already fetches capture data**: The verify endpoint (`/v1/verify/{captureId}`) is already `security: []` and internally fetches capture/artifact data. If the capture GET endpoints are also public now, the verify page's client-side JavaScript can fetch capture metadata directly. This is the intended behavior and a consistency win -- flagging it for awareness, not as a concern.

6. **No breaking-change annotation in spec**: OpenAPI has no built-in mechanism to annotate that an endpoint was removed or that the access model changed. The version bump (0.7.0 -> 0.8.0) is the signal. Consider a release note in `info.description` or a separate changelog, but that is a documentation-minion concern, not a spec-minion concern.

### Additional Agents Needed

No additional agents needed beyond those already planned. The spec changes are well-scoped and self-contained. The test-minion and software-docs-minion already in the planning cover the downstream effects (test assertions changing from 401 to 200, SECURITY.md updates, etc.).

One note for the **test-minion**: any spec-validation tests (e.g., Schemathesis or Prism-based contract tests) will need the updated spec to run correctly. If such tests exist, they must be updated in the same PR as the spec change to avoid CI failures.
