# Domain Plan Contribution: software-docs-minion

## Recommendations

### 1. SECURITY.md Restructure

The current SECURITY.md is minimal (40 lines) and organized around vulnerability reporting. The "known gap" paragraph on line 29 is the key section that must be replaced, but the overall document should grow to reflect the new multi-layered access model. Proposed structure:

**Keep as-is:**
- Supported Versions (lines 3-5)
- Reporting a Vulnerability (lines 7-10)
- What to Expect (lines 12-14)
- Disclosure (lines 38-39)

**Restructure the Scope section (lines 16-29) into:**

1. **Access Model** -- Replace the single "Known gap" paragraph with a complete description of the three access paths:
   - **Tenant authentication** (Bearer token): required for GET /v1/captures/{id}, artifacts, status, and list. Tenants can only see their own captures (tenant isolation via D1 `tenantId` column). Cross-tenant access returns 404 (not 403) to prevent enumeration.
   - **Share tokens** (query parameter `?token=...`): delegated read-only access to a specific capture and its artifacts. Cryptographically random (256-bit, URL-safe base64). Can be time-limited or permanent. Expired tokens return 410 Gone. Share tokens are scoped to a single capture -- they do not grant list access or access to other captures.
   - **Public verification** (no auth): GET /v1/verify/{id} remains unauthenticated by design. Verification is the product's core value proposition -- requiring auth would undermine it.

2. **Share Token Design** -- A dedicated subsection covering:
   - Token properties: 256-bit cryptographic randomness, URL-safe encoding, stored in D1
   - Generation: POST /v1/captures/{id}/share (requires tenant auth), returns token
   - Validation: server-side lookup and expiry check, not JWT (no client-side forgery)
   - Time-limited tokens: server-side expiry, 410 Gone on expired
   - Permanent tokens: no expiry, deletable only by tenant (out of scope for R33 per spec, but mention the gap)
   - What tokens grant: read access to capture metadata + all artifacts for that capture ID only
   - What tokens do NOT grant: list access, access to other captures, write operations

3. **Threat Analysis** -- Document the threats this change mitigates and residual risks:
   - **Mitigated**: Capture ID guessing/brute-force (now returns 401 without auth), cross-tenant data access (tenant isolation enforced), credential sharing via capture URL (share tokens decouple access from API keys)
   - **Residual**: Share token leakage (token in URL = referer leakage, browser history, server logs). Mitigation: time-limited tokens, Referrer-Policy: no-referrer header already present. Share token revocation not in R33 scope -- document as a known gap.
   - **Residual**: The `npx @w-r-l/verify` CLI tool fetches WACZ artifacts via `GET /v1/captures/{id}/artifacts/wacz` without authentication. This flow must continue to work. The spec says "Must not break the CLI tool" -- document how it will work (likely the verify endpoint itself remains public, and the CLI can pass a share token or the verification endpoint proxies artifact access).

4. **Scope** -- Update the existing security scope list. Remove the "Known gap" paragraph entirely. Add:
   - "Share token leakage via URL parameters (token in query string visible in logs, referer)" -- known risk, mitigated by Referrer-Policy header and time-limited option
   - "Share token revocation" -- not in R33 scope; tracked as future enhancement

### 2. README.md Updates

The README has multiple references to "capture ID acts as the access secret" that must be updated:

- **Line 71** (Step 2 polling): Says "No auth required -- the capture ID acts as the access secret." This must change. Status polling should require auth (per R33 spec), or if it remains public for backward compat, the language must be updated.
- **Line 76-79** (Step 3 retrieval): Currently shows `curl` without `-H "Authorization: Bearer $WRL_API_KEY"`. Must add auth header.
- **Line 89** (verifyUrl): "The capture ID grants full access to all artifacts without authentication -- treat it as a secret." This is exactly what R33 changes. Replace with share token guidance.
- **Line 103** (Finding and sharing): "The capture ID in any URL works without authentication" must be replaced with share token sharing model.
- **Line 69-70** (status endpoint): The `curl` example has no auth header. If status now requires auth, add it. If status remains public, clarify why.

Add a new section or expand Step 3 to show share token usage:

```bash
# Generate a share token
curl -X POST https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/share \
  -H "Authorization: Bearer $WRL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expiresIn": "7d"}'

# Access via share token (no API key needed)
curl "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6?token=shr_..."
```

### 3. OpenAPI Specification Updates

The openapi.yaml has `security: []` on four endpoints that will gain auth requirements:

- `/v1/captures/{captureId}/status` (line 2468) -- add bearerAuth or shareToken
- `/v1/captures/{captureId}` (line 2534) -- add bearerAuth or shareToken
- `/v1/captures/{captureId}/artifacts/{name}` (line 2631) -- add bearerAuth or shareToken
- All three descriptions reference "capture ID acts as the access secret" -- replace

New additions needed:
- Add a `shareToken` security scheme (query parameter type) to `components/securitySchemes`
- Add `POST /v1/captures/{captureId}/share` endpoint definition
- Update security arrays on retrieval endpoints to accept either bearerAuth or shareToken
- Add 401 response to retrieval endpoints
- Add 410 response for expired share tokens
- Keep `security: []` on `/v1/verify/{captureId}` (line 2745) -- this stays public

### 4. CLI Verify Tool Documentation

The `@w-r-l/verify` CLI at `packages/verify/` fetches WACZ artifacts via direct HTTP (see `key-resolver.js` line 130: `fetchWaczFromCaptureUrl`). This will break when artifact endpoints require auth. The solution needs documenting:

- Option A: The CLI passes a share token as a query parameter when fetching artifacts
- Option B: The verification endpoint (`GET /v1/verify/{id}`) remains public and the CLI continues to work through that path (but currently the CLI fetches the WACZ binary directly, not via the verify endpoint)
- Option C: The `.well-known/signing-keys` and verify endpoints proxy the needed data without requiring artifact access

Whatever the chosen approach, `packages/verify/README.md` and the docs site MCP guide will need updating.

### 5. Docs Site (docs.webresourceledger.com)

The docs site at `site/content/index.md` (line 73) also references "capture ID acts as the access secret." The external documentation site will need a corresponding update. This is a separate deployment but should be coordinated.

### 6. Backlog Cleanup

The backlog entry at `docs/backlog.md` line 68 should be marked DONE:
```
| [should] Evaluate auth requirement for GET /v1/captures/{id} post-multi-tenant | ...
```

Add new parking lot entry for share token revocation API (explicitly out of scope per R33 spec).

## Proposed Tasks

1. **Rewrite SECURITY.md** -- Replace the "Known gap" paragraph with the Access Model, Share Token Design, and Threat Analysis sections described above. Keep the document concise (target 80-120 lines). Do not duplicate OpenAPI content -- reference it.

2. **Update README.md API examples** -- Add auth headers to retrieval examples (Steps 2-4), add share token generation/usage example, update the "Finding and sharing" section, remove all "capture ID acts as access secret" language.

3. **Update openapi.yaml** -- Add shareToken security scheme, add POST /v1/captures/{id}/share endpoint, change `security: []` to `security: [bearerAuth, shareToken]` on retrieval endpoints, add 401/410 responses, update descriptions.

4. **Update @w-r-l/verify documentation** -- Whatever approach is chosen for CLI compatibility, update `packages/verify/README.md` to document it.

5. **Update backlog** -- Mark the auth evaluation item done, add share token revocation as parking lot item.

6. **Update docs site content** -- Coordinate with docs site to update "capture ID as secret" references.

Tasks 1, 2, and 3 are in the critical path for R33. Tasks 4-6 can follow.

## Risks and Concerns

### Critical: CLI Verify Tool Breakage

The `@w-r-l/verify` CLI tool (`packages/verify/lib/key-resolver.js`, line 127-140) constructs artifact URLs directly:
```javascript
const waczUrl = `${origin}/v1/captures/${captureId}/artifacts/wacz`;
```
It uses plain `fetch()` with no auth headers. Adding auth to artifact endpoints will break `npx @w-r-l/verify https://api.webresourceledger.com/v1/captures/cap_...`. The implementation team must decide the compatibility strategy BEFORE coding the auth gate:

- If share tokens are used: the CLI needs a `--token` flag or the capture URL must include the token
- If the verify endpoint provides artifact access: the CLI's `fetchWaczFromCaptureUrl` function needs restructuring
- If artifacts remain public when accessed via a specific path: document the security implications

This is a **design decision** that affects the share token API design and should be resolved during planning, not discovered during implementation.

### Moderate: "ID as Secret" Language Is Pervasive

The phrase "capture ID acts as the access secret" appears in at least 8 locations across README.md, openapi.yaml, SECURITY.md, src/index.js source comments, docs/backlog.md, and site/content/index.md. Missing even one creates inconsistency. The implementation should grep for this pattern and update exhaustively. Recommended grep patterns:
- `access.*secret`
- `ID.*acts.*secret`
- `no.*auth.*required.*capture`
- `security: \[\]` in openapi.yaml (verify which ones should stay vs change)

### Moderate: Status Endpoint Auth Decision

The R33 spec says "GET /v1/captures/{id} requires a valid tenant API key" but does not explicitly mention the status endpoint (`/v1/captures/{id}/status`). The README currently tells users to poll status without auth. The implementation team needs to decide: does status require auth too? It should, for consistency, but this affects the capture submission flow (POST returns a statusUrl -- does the caller already have auth? Yes, they just submitted with auth. So status requiring auth is safe).

### Low: Share Token in Query String

Share tokens passed as query parameters (`?token=shr_...`) are visible in:
- Server access logs
- Browser history
- HTTP Referer headers (mitigated by existing Referrer-Policy: no-referrer)
- Proxy logs

This is a known, accepted tradeoff (same pattern as Google Docs shared links, pre-signed S3 URLs). Document it honestly in the threat analysis. Time-limited tokens are the primary mitigation.

### Low: Docs Site Coordination

The docs site at docs.webresourceledger.com is a separate deployment (11ty static site). Content updates there are a follow-up task, not a blocker for R33, but should be tracked.

## Additional Agents Needed

- **security-minion**: Must review the share token design for cryptographic adequacy (entropy, storage, timing-safe comparison), the threat analysis for completeness, and the CLI compatibility decision for security implications. The threat model for token-in-query-string needs explicit sign-off.

- **api-design-minion**: Should review the share token endpoint design (POST /v1/captures/{id}/share request/response schema, query parameter name and format, expiry semantics, 410 vs 404 for expired tokens) before documentation is written. The OpenAPI spec updates depend on these API design decisions being finalized.

- **test-minion**: The CLI verify tool integration tests need updating to work with the new auth model. Test coverage for share token validation (valid, expired, wrong capture, revoked) needs planning.
