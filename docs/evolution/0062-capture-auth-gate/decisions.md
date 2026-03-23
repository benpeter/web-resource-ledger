# Phase 0062: Decisions

## Conflict 1: CLI Backward Compatibility — HMAC vs --token flag vs URL propagation

Three competing proposals for how the verify CLI should work after the auth gate:

**Option A (devx-minion):** HMAC-signed ephemeral waczUrl in verify response. The verify endpoint would include a time-limited signed URL for WACZ download. Zero-config for CLI users.
- Rejected: Adds a second token mechanism (HMAC + opaque), complicates secret rotation, and turns the public verify endpoint into a download vector. The devx-minion themselves flagged dual-token confusion risk.

**Option B (security-minion):** `--token` CLI flag. Users pass the share token explicitly.
- Rejected: Breaks the zero-config experience. The token is already in the share URL — why make users extract and re-type it?

**Option C (chosen): URL-based token propagation.** The CLI detects `?token=` in the input URL and forwards it to artifact downloads. Tenant generates a share URL, gives it to someone, they paste it into `npx @w-r-l/verify` — done.
- Simplest approach, no new CLI flags, no second token mechanism, backward compatible.

## Conflict 2: Expired Token Response — 410 Gone vs 404

**Issue spec:** 410 Gone for expired share tokens.
**api-design-minion:** 404 everywhere to prevent information leakage.

**Chosen: 410 Gone (per spec).** The information leaked (that a token once existed) is acceptable because the token was intentionally shared. The 410 helps legitimate users: "this link has expired, ask the owner for a new one." Invalid/not-found tokens still return 401.

## Conflict 3: Token Prefix — stk_ vs wrl_share_

**security-minion:** `stk_` prefix.
**data-minion + api-design-minion:** `wrl_share_` prefix for consistency with `wrl_live_` API keys.

**Chosen: wrl_share_.** Consistent naming makes it trivial for the auth gate to route tokens to the correct lookup table without trying both. Two-to-one consensus.

## Decision: Share Creation on Pending Captures

**api-design-minion initially:** Restrict to `complete` only.
**api-design-minion revised:** Allow for `pending` and `complete`.

**Chosen: Allow pending + complete.** A tenant may want to share a capture link immediately after submission so a colleague can poll for completion. Failed captures are excluded.

## Decision: No Revocation, No Label, No Per-Capture Limit

Phase 3.5 reviewers (lucy, margo) both flagged these as scope creep:
- **Revocation endpoint:** Issue explicitly scopes it out. The columns and API can be added later.
- **Label field:** YAGNI. No user has asked for it.
- **Per-capture token limit (20):** Rate limiting already handles abuse. An application-layer limit adds complexity without clear benefit.

All three were removed from the schema and implementation.

## Decision: Auth Context via env._captureAuth

Two options for passing auth state from the fetch() gate to handlers:
1. **env._captureAuth object** — follows the existing `env._session` pattern in the codebase.
2. **Function parameter threading** — would require signature changes to all handlers.

**Chosen: env._captureAuth.** Consistent with existing patterns, minimal code churn.

## Decision: Raw Token Not Stored in Auth Context

Phase 3.5 reviewer (margo) flagged storing the raw token on env._captureAuth as unnecessary exposure. Handlers that need the raw token for URL propagation extract it directly from `url.searchParams.get('token')` in their own scope instead.

## Decision: Mutual Exclusion of Share Token and API Key

If `?token=` is present in the URL, the auth gate only validates the share token — it does NOT also check the Authorization header. This prevents confused-deputy attacks where an attacker crafts a URL with an expired token expecting fallback to the user's session.
