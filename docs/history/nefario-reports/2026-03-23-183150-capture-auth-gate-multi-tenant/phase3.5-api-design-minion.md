# API Design Review — Capture Auth Gate & Share Tokens

**Verdict: ADVISE**

The design is solid and consistent with existing WRL patterns. Two items need resolution before execution begins. One is a correctness issue; one is a naming inconsistency that will be painful to fix after the spec ships.

---

## Issues

### 1. Revocation URL uses a truncated hash prefix, not a resource identifier (CORRECTNESS)

Proposed: `DELETE /v1/captures/{captureId}/share/{tokenHashPrefix}` where `{tokenHashPrefix}` is the first 16 hex chars of the `token_hash`.

Problem: Every other DELETE endpoint in WRL addresses resources by their actual identifier:
- `DELETE /v1/admin/keys/{64-hex-char-hash}` — the key hash IS the stable identifier
- `DELETE /v1/account/keys/{64-hex-char-hash}` — same
- `DELETE /v1/webhooks/{whk_id}` — a real, stable ID

The `tokenHashPrefix` is not an identifier — it is a search hint (the handler does `LIKE prefix%`). This introduces ambiguity: two tokens with the same 16-char prefix on the same capture would cause a non-deterministic delete. The plan caps tokens at 20 per capture, so collision probability is low but not zero with 16 chars of a 64-char hex string.

**Recommendation:** Return a stable `id` field from `POST /v1/captures/{captureId}/share`. The simplest option consistent with existing patterns is to use the full 64-char `token_hash` as the identifier — it is already the PK — just as `admin/keys` does. The revocation URL becomes:

```
DELETE /v1/captures/{captureId}/share/{token_hash}
```

The route regex becomes `([a-f0-9]{64})`, matching the admin and account key patterns exactly. The `listShareTokensForCapture` response should return the full `token_hash` (not just 8 chars) so callers can construct revocation URLs. The 201 response from share creation should also include a `tokenHash` field alongside `token` and `shareUrl`.

If exposing the full hash feels too verbose, a prefixed short ID (`shk_<16hex>`) returned from creation and stored alongside the record is also acceptable — but the prefix-search approach should not be used.

### 2. Query parameter name `token` is too generic (NAMING)

The share token is accessed via `?token=wrl_share_...`. The parameter name `token` is a collision magnet: future features (e.g., CSRF tokens, preview tokens, pagination tokens) may also need a `token` parameter. The `wrl_share_` prefix on the value provides some disambiguation, but the parameter name itself appears in OpenAPI security scheme definitions, logs, and SDK-generated code.

The existing API uses specific names for specific things: `Authorization: Bearer` for API keys, `X-WRL-CSRF` for CSRF, `session` for session cookies.

**Recommendation:** Rename the query parameter to `share_token`. This is consistent with the snake_case convention used elsewhere in the API (query params `?sort_by=`, `?tenant_id=`, etc. — verify against current openapi.yaml). The `shareToken` security scheme in OpenAPI becomes named `shareToken` with `name: share_token`. The 201 response `shareUrl` field would include `?share_token=wrl_share_...`.

This is a zero-cost change now and an expensive one after the spec ships.

---

## Confirmations (no changes needed)

**Token prefix `wrl_share_`**: Correct. Consistent with `wrl_live_` for API keys. The synthesis decision is sound.

**410 for expired tokens**: Acceptable. The synthesis correctly overrode the generic 404 recommendation. The spec requires it; the information leak (token once existed) is low-risk given intentional sharing semantics.

**Share token creation on `pending` captures**: Correct. The revised position (allow pending + complete, block failed) is right. The polling use case is real.

**Scoping: share tokens cannot access list endpoint**: Correct. The list endpoint serves all of a tenant's captures; a single-capture token must not grant list access. The 401 response for this case is right.

**Cross-tenant 404 (not 403)**: Correct. Enumeration prevention is well-reasoned and consistently applied.

**`env._captureAuth` sidecar pattern**: Consistent with `env._session` already in use for account routes. No API design concern here.

**`POST /v1/captures/{captureId}/share` response shape**: The three fields (`token`, `shareUrl`, `expiresAt`) are appropriate. Add `tokenHash` (full 64 chars) to enable revocation without a separate lookup step.

**`expiresIn` as seconds integer**: Consistent with existing duration fields in the API. The validation bounds (300s min, 31536000s max) are sensible.

---

## Summary of required changes for implementer

1. Change `DELETE /v1/captures/{captureId}/share/{tokenHashPrefix}` to use the full 64-char `token_hash` as the path parameter. Update the handler to do a direct PK lookup instead of a LIKE search. Update `listShareTokensForCapture` to return the full `token_hash`. Add `tokenHash` to the 201 creation response.

2. Rename the query parameter from `token` to `share_token` throughout: auth gate code, artifact URL construction in handlers, CLI propagation in `fetchWaczFromCaptureUrl`, OpenAPI security scheme definition, README examples, test assertions.

Both changes are scoped to Task 1 and Task 3. Task 2 (CLI) needs the renamed parameter in one place: the `searchParams.get('token')` call becomes `searchParams.get('share_token')`.
