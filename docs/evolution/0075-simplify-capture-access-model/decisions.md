# Decisions: 0075 — Simplify Capture Access Model

## D1: Public access pattern for capture handlers

**Chosen:** If `env._captureAuth` is unset, serve capture publicly; if set, enforce tenant isolation.
**Over:** Always setting a synthetic "public" auth context object with null tenantId.
**Why:** Simpler — no synthetic auth object needed. The handlers already need to check if `captureAuth` exists. The null-check pattern is clearer than a sentinel object. Presenting bad credentials still returns 401 (not silently ignored).

## D2: D1 migration timing

**Chosen:** Deploy code + migration together in the same PR.
**Over:** Staged deployment (code first, migration later).
**Why:** After the code change, the share_tokens table is completely unused. Old `?token=` URLs continue working because the endpoint is now public and the token param is ignored. Deploying together is simpler and reduces operational steps.

## D3: Deferred security recommendations

**Chosen:** Defer rate limiting on metadata/status endpoints, X-Robots-Tag, error field audit, and ID generation change.
**Over:** Including them in this PR.
**Why:** YAGNI / Helix Manifesto. This issue is about removing code and simplifying. Each deferred item is a separate concern with its own trade-offs. The artifact endpoint already had rate limiting which was preserved.

## D4: Share token references in verify package

**Chosen:** Remove `shareTokenFromUrl` entirely, rewrite 401 error message.
**Over:** Keeping dead code as defense against future reintroduction.
**Why:** Dead code contradicts YAGNI. Trivially recoverable from git history if ever needed. The error message now correctly guides users to expect public access.

## D5: Cache-Control header change

**Chosen:** Change `private, no-store` to `no-store` on newly-public capture/status endpoints.
**Over:** Keeping `private` directive.
**Why:** Responses are no longer per-tenant. The `private` directive is misleading for public endpoints. `no-store` alone is sufficient — CF Workers do not cache `no-store` responses.
