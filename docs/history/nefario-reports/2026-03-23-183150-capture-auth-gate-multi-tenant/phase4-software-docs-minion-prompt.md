## Task: Update all documentation to reflect the capture auth gate

The capture retrieval endpoints now require tenant authentication, and share tokens provide delegated access. You need to update SECURITY.md, README.md, openapi.yaml, and the backlog to reflect the new access model.

### Context

**What changed (Task 1 implemented these):**
- `GET /v1/captures/{id}`, `/status`, `/artifacts/*` now require tenant auth (API key or session) or a valid share token (`?token=wrl_share_...`)
- `POST /v1/captures/{id}/share` creates share tokens (returns token, shareUrl, expiresAt)
- Cross-tenant access returns 404 (not 403) to prevent enumeration
- `GET /v1/verify/{id}` remains unauthenticated (unchanged)
- Expired share tokens return 410 Gone; invalid tokens return 401
- Share token format: `wrl_share_` prefix + 43 chars base64url (256-bit entropy)
- Tokens stored as SHA-256 hash in D1 share_tokens table
- **No revocation endpoint** -- explicitly out of scope for this issue
- **No label field** on share tokens -- YAGNI

### What to update

#### 1. SECURITY.md

The current file is at `SECURITY.md` (project root). Restructure the "Scope" section:

**Remove**: The "Known gap (single-tenant deployments)" paragraph. This gap is now closed.

**Add these new subsections** within Scope:

**Access Model** -- Three access paths:
- Tenant authentication (Bearer token): required for all capture retrieval endpoints. Tenants can only see their own captures. Cross-tenant access returns 404 (not 403) to prevent enumeration.
- Share tokens (query parameter `?token=wrl_share_...`): delegated read-only access to a specific capture and its artifacts. Cryptographically random (256-bit), time-limited or permanent. Scoped to a single capture.
- Public verification (no auth): `GET /v1/verify/{id}` remains unauthenticated by design.

**Share Token Design**:
- 256-bit cryptographic randomness, base64url encoded, `wrl_share_` prefix
- Stored as SHA-256 hash in D1 (raw token never stored, same as API keys)
- Created via `POST /v1/captures/{id}/share` (requires tenant auth)
- Expired tokens: 410 Gone. Invalid tokens: 401.
- Grants: read access to capture metadata + all artifacts for that specific capture
- Does NOT grant: list access, access to other captures, write operations

**Threat Analysis**:
- Mitigated: capture ID guessing (now returns 401), cross-tenant data access (tenant isolation), credential sharing via capture URL (share tokens decouple access from API keys)
- Residual risks:
  - Share token in URL query string: visible in server logs, browser history, proxy logs. Mitigated by time-limited tokens, `Referrer-Policy: no-referrer` header.
  - Verify endpoint confirms capture existence without auth (intentional -- verification must be public for trust)

Keep the document concise (target 80-120 lines). Do not duplicate OpenAPI content.

#### 2. README.md

The current file has multiple "capture ID acts as the access secret" references that must be updated. Key locations:

- **Step 2 polling**: Remove "No auth required -- the capture ID acts as the access secret." Add `Authorization: Bearer $WRL_API_KEY` to curl examples.
- **Step 3 retrieval**: Add `-H "Authorization: Bearer $WRL_API_KEY"` to curl examples.
- **Line ~89**: Replace text about capture ID granting full access with text about share tokens for sharing.
- **Finding and sharing**: Replace "The capture ID in any URL works without authentication" with updated sharing guidance.

**Add a "Sharing captures" subsection** after Step 4 showing how to generate share links.

**Grep for all "ID as secret" references** and update exhaustively. Search patterns: `access.*secret`, `ID.*acts.*secret`, `no.*auth.*required.*capture`, `without authentication`.

#### 3. openapi.yaml

Update `docs/openapi.yaml`:

**Add security scheme** to `components/securitySchemes`:
```yaml
shareToken:
  type: apiKey
  in: query
  name: token
  description: Share token granting read-only access to a specific capture
```

**Update retrieval endpoints**: Change security to include shareToken option. Add 401 and 410 responses.

**Add new endpoint** `POST /v1/captures/{captureId}/share`:
- Request body schema: `{ expiresIn: integer (optional, 300-31536000) }`
- Response 201 schema: `{ token: string, shareUrl: string, expiresAt: string|null }`
- Security: bearerAuth

**Keep verify endpoint** with `security: []` -- unchanged.

#### 4. Backlog update

Update `docs/backlog.md`:
- Mark done: any items related to auth requirement for capture retrieval
- Add parking lot: "Share token revocation API", "Share token analytics (access counts, last-used tracking)", "Auto-share tenant configuration"

#### 5. Source code comments

Grep `src/index.js` for any comments referencing "no authentication" or "ID as secret" on capture retrieval. Update them to reflect the new auth model.

#### 6. Docs site content

Check `site/content/index.md` for "capture ID acts as the access secret" references and update.

### What NOT to do

- Do NOT modify any JavaScript implementation code (src/*.js, test/*.js). Documentation only.
- Do NOT add documentation for features not yet implemented (revocation, autoShare, share token analytics).
- Do NOT remove the verify endpoint's public access documentation -- it stays public.
- Do NOT write CLI documentation -- Task 2 handles packages/verify/README.md.

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
