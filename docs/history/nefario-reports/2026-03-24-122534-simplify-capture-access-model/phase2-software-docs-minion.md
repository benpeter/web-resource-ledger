# Software Documentation Minion -- Planning Contribution

## Summary

The access model simplification touches **7 documentation surfaces** with varying severity. The most important are SECURITY.md (complete rewrite of the access model section), the documentation site's authentication page, and the OpenAPI spec. The backlog has already been updated to reflect Phase 0075 decisions.

---

## (a) SECURITY.md: Section-by-Section Analysis

### Sections requiring full rewrite

**"Access Model" (lines 29--35):** Replace the three-path model (tenant auth, share tokens, public verification) with a two-path model:

- **Tenant authentication (Bearer token):** Required only for `GET /v1/captures` (list endpoint) and `POST /v1/captures`. Tenants can only list their own captures. Cross-tenant list access returns empty results.
- **Public access (capture ID as capability):** `GET /v1/captures/{id}`, `/status`, `/artifacts/*`, and `GET /v1/verify/{id}` are all public. The 128-bit capture ID (cap_ + 32 hex) functions as a capability token -- knowing the ID is sufficient to access the capture.

Key framing: the document should explain *why* this is secure (128 bits of entropy = computationally infeasible to enumerate) rather than just stating the rule.

### Sections requiring complete removal

**"Share Token Design" (lines 37--45):** Remove entirely. Share tokens no longer exist. No replacement section needed -- the access model section now covers the simplified design.

### Sections requiring rewrite

**"Threat Analysis" (lines 47--55):** Significant rewrite needed.

*Mitigated* section changes:
- Remove "Capture ID guessing: retrieval endpoints now return 401 without auth" -- this is no longer true. Replace with: "Capture ID enumeration: 128-bit IDs (2^128 possible values) make brute-force enumeration computationally infeasible. List endpoint requires tenant auth, preventing catalog-based discovery."
- Remove "Credential sharing via capture URL: share tokens decouple artifact access from API keys" -- share tokens no longer exist. Replace with: "Credential exposure for sharing: capture URLs are inherently shareable without API key exposure. The capture ID itself grants access, eliminating the need to share credentials."
- Keep "Cross-tenant data access" bullet but reframe: tenant isolation applies to the list endpoint only.

*Residual risks* section changes:
- Remove "Share token in URL query string" entirely (no share tokens).
- Keep "Verify endpoint confirms capture existence" but expand to cover all individual capture endpoints (not just verify).
- Add new residual risk: "Capture ID as bearer capability: anyone who obtains a capture ID (from logs, shared URLs, browser history) can access that capture and all its artifacts. This is the intended design -- capture IDs are meant to be shareable. Tenants should treat capture IDs with the same care as they would a document link in Google Docs with 'anyone with the link can view.' The list endpoint remains auth-gated to prevent enumeration."

### Sections that need minor updates

**"Scope" section (lines 19--27):** Update "Authentication or API key bypass" to reflect that auth applies to list and capture-creation endpoints only, not individual capture access. The scope items themselves are still valid.

---

## (b) ADR Recommendation

**Yes, this should be an ADR.** This is a textbook ADR candidate for three reasons:

1. **It reverses a prior architectural decision** (Phase 0062's auth gate on individual captures). Future developers will ask "why did we add auth in 0062 then remove it in 0075?" An ADR explicitly records the reasoning chain.
2. **It has lasting security implications.** The capability-token model is a fundamental access control design choice. A future developer might look at the public endpoints and think "this is a bug, we need auth here." The ADR prevents that misunderstanding.
3. **It documents rejected alternatives.** The share token system was built, shipped, and then removed. Without an ADR, that history only lives in evolution logs which are harder to discover.

**However:** This project does not currently use ADRs (no `docs/adr/` directory exists). The evolution log system (`docs/evolution/`) serves a similar purpose -- it captures decisions, rationale, and rejected alternatives per phase.

**Recommendation:** Write the ADR as part of the Phase 0075 `decisions.md` evolution log entry rather than creating a new `docs/adr/` directory for this one decision. The evolution log is where this project tracks architectural rationale. If the project later adopts formal ADRs, this decision is already documented and can be promoted.

The `decisions.md` should explicitly cover:
- **Context:** Phase 0062 added auth + share tokens. This broke verify page, CLI verifier, and the "anyone can verify" value proposition.
- **Decision:** Individual capture access is public (128-bit ID = capability). List endpoint stays authed. Share tokens removed.
- **Alternatives rejected:** (1) Keep share tokens as the public-access mechanism, (2) auto-generate share tokens at capture time, (3) separate public/private artifact tiers.
- **Consequences:** Simpler access model. Fewer moving parts. Capture IDs must be treated as sensitive-ish links. No revocation mechanism for individual capture access (must delete the capture itself).

---

## (c) Other Documentation Files Referencing Share Tokens or Old Auth Model

### Files requiring changes (in priority order)

| File | What references share tokens / old auth | Change needed |
|------|----------------------------------------|---------------|
| **`openapi.yaml`** (lines 51-57, 513-520, 2515-2892) | `shareToken` security scheme, `POST /v1/captures/{captureId}/share` endpoint, `?token=wrl_share_...` parameters on status/artifacts endpoints, 410 Gone responses for expired tokens | Remove entire share endpoint. Remove `shareToken` security scheme. Remove `token` query parameters from all capture retrieval endpoints. Remove auth requirement from GET /v1/captures/{id}, /status, /artifacts/*. Keep auth on GET /v1/captures (list). |
| **`site/content/authentication.md`** (lines 41-44, 56) | Endpoint scope table lists `(or share token)` on three endpoints, `POST /v1/captures/{id}/share` row, note about share tokens | Remove `(or share token)` from three rows. Remove `/share` endpoint row. Update three endpoints to show "None (public)" instead of `read (or share token)`. Rewrite the note at line 56 to explain capability-token model. |
| **`site/content/index.md`** (line 74) | Note recommends `POST /v1/captures/{id}/share` for sharing artifact access | Replace with note explaining that capture URLs are directly shareable -- no token needed. |
| **`README.md`** (lines 62-113, 91-92, 126) | "Sharing captures" section with share token curl example. Step 3 mentions `shareUrl`. Step 2 has `Authorization: Bearer` header. "Finding and sharing captures" section. | See section (d) below. |
| **`docs/backlog.md`** (lines 68-71, 270) | Already updated with Phase 0075 strikethrough annotations | No further changes needed -- already reflects the decision. |
| **`docs/evolution/0062-capture-auth-gate/outcome.md`** | Historical record of what was built | **Do not modify.** This is an immutable historical record. Phase 0075's outcome.md will record the reversal. |
| **`docs/mcp.md`** | No share token references | No changes needed. |
| **`OPERATIONS.md`** | No share token references | No changes needed. |
| **`CONTRIBUTING.md`** | No share token references | No changes needed. |
| **`docs/audit-log-schema.md`** | No share token references | No changes needed, but consider whether share-token-related audit events need removal from the code. |

### Source code documentation (not my domain, but flagged for other minions)

The implementation files will also need share token removal. These are code changes, not documentation, but the inline comments and JSDoc in these files constitute code-level documentation:
- `src/share-tokens.js` -- entire module removal
- `src/index.js` -- auth gate routing logic comments
- `test/share-token.test.js` -- entire test file removal
- `packages/verify/` -- CLI help text referencing share tokens

---

## (d) README Changes

The README needs significant updates in multiple sections. Here is the specific scope:

### Section: "Step 2: Poll for completion" (lines 67-73)

**Remove** the `Authorization: Bearer` header from the curl example. The status endpoint becomes public.

Before:
```bash
curl https://api.webresourceledger.com/v1/captures/cap_.../status \
  -H "Authorization: Bearer $WRL_API_KEY"
```

After:
```bash
curl https://api.webresourceledger.com/v1/captures/cap_.../status
```

### Section: "Step 3: Retrieve artifacts" (lines 76-80)

**Remove** the `Authorization: Bearer` header. Individual capture access is public.

### Section: "Step 4: Verify the bundle" (lines 83-89)

No changes needed -- verify was already public.

### Section: "Sharing captures" (lines 93-113)

**Remove entirely.** Share tokens no longer exist. Replace with a brief note:

> Capture URLs are directly shareable -- anyone with the capture ID can access the capture and its artifacts. For proof-of-authenticity, share the `verifyUrl` which renders as a human-readable verification page.

This is much simpler than the current 20-line section with curl examples and JSON responses.

### Section: "Finding and sharing captures" (lines 124-153)

**Rewrite** to remove the "sharing" framing. This section should focus on the list endpoint (which still requires auth) and explain that individual capture URLs are inherently shareable.

### Lines 91-92 (after Step 4)

Remove "The `verifyUrl` is safe to share publicly. To share artifact access with others, use share tokens..." Replace with simpler text: "The `verifyUrl` renders as a human-readable verification page in browsers. Capture URLs are directly shareable -- no tokens needed."

### Lines 6-7 (tagline)

The current tagline says "The verification URL works for anyone -- no account needed." This is still accurate and needs no change. The simplification actually makes it more true -- now *all* capture access works for anyone, not just verification.

### Line 63 (after Step 1 response)

"Your captures are always accessible. Use `GET /v1/captures` to list them, or save the capture ID for direct access." -- This is still accurate. No change needed.

---

## Risks and Dependencies

### Risk: Documentation drift during implementation

The documentation changes span 4+ files and 2 separate concerns (share token removal and auth relaxation). If the implementation PR updates SECURITY.md but misses `site/content/authentication.md`, the documentation site will be wrong.

**Mitigation:** Include a documentation checklist in the implementation task that explicitly lists every file and section. The checklist from section (c) above serves this purpose.

### Risk: Cached documentation site

If the documentation site (`docs.webresourceledger.com`) has CDN caching, stale content about share tokens may persist after deploy.

**Mitigation:** Purge cache after deploy, or accept that staleness resolves within the TTL.

### Risk: Third-party integrations relying on share token API

If any external tool or integration uses `POST /v1/captures/{id}/share`, removing the endpoint is a breaking change.

**Mitigation:** Given this is a pre-1.0 project with likely no external consumers of the share token API, the risk is low. The endpoint should return 410 Gone (not 404) for a grace period if there is any doubt, but this is an API design decision, not a documentation one.

### Dependency: OpenAPI spec must change before documentation site

The documentation site likely generates API reference from `openapi.yaml`. The spec changes and site content changes should ship together to avoid inconsistency.

---

## Implementation Scope for Documentation Task

Estimated file changes (documentation only -- not counting code):

| File | Effort | Type |
|------|--------|------|
| `SECURITY.md` | Medium | Rewrite access model, remove share tokens, rewrite threat analysis |
| `README.md` | Medium | Remove share section, update curl examples, simplify sharing language |
| `openapi.yaml` | Large | Remove share endpoint, security scheme, token params, update auth requirements |
| `site/content/authentication.md` | Small | Update endpoint table, remove share token references |
| `site/content/index.md` | Trivial | Update one note (line 74) |
| `docs/evolution/0075-*/decisions.md` | Medium | Write the ADR-equivalent decision record |

Total: ~6 files, with openapi.yaml being the most labor-intensive due to the number of scattered references.
