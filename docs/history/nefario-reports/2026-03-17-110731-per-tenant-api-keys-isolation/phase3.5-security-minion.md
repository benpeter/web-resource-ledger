# Security Minion Review -- Per-Tenant API Keys and Tenant Isolation

**Verdict: ADVISE**

The plan is architecturally sound. Structural separation of `verifyAdminKey` from `verifyApiKey`, timing-safe comparison, no raw key in logs, the misconfiguration guards, and the dual-mode fallback design are all correct. The test requirements explicitly cover the critical adversarial cases. No blocking issues.

Three advisories follow, ordered by risk.

---

## ADVISORY 1 -- Misconfiguration guard logic is under-specified for the dual-mode window

**SCOPE**: Task 1 (`src/auth.js`), specifically the misconfiguration guard at step 7 of `verifyApiKey`.

**CHANGE**: The prompt describes the guard as: "if BOTH `env.KV` has no apikey records AND `env.CAPTURE_API_KEY` is absent, return 503." This check requires a `kv.list()` call to determine whether any `apikey:` records exist. That is a live KV read on every unauthenticated or failed request, which creates a denial-of-service surface and a latency regression on the failure path. More critically, it means the 503 guard fires on a newly provisioned instance (KV exists but has zero keys and CAPTURE_API_KEY is also absent) -- which is exactly when the admin operator needs 503 feedback, but also when a first-time deploy with ADMIN_KEY-only will incorrectly 503 on all tenant requests until a tenant key is created.

The safer and cheaper guard is: return 503 if `!env.KV && !env.CAPTURE_API_KEY`. The `!env.KV` check is a binding-presence test (synchronous), not a content test. If KV is bound but empty, the auth flow will simply return 401 (no matching key, no legacy fallback) -- which is the correct behavior for an unconfigured tenant. The 503 should only fire when the service cannot function at all, not when no keys have been created yet.

**WHY**: A KV list on every failed auth request is O(n) and consumes KV read units. On a cold deployment during the migration window (CAPTURE_API_KEY deleted, no tenant keys yet created), every request 503s, which masks the actual problem (operator forgot to create keys) behind a misleading service-unavailable response. The correct failure mode is 401 ("key not found") so the operator sees an auth failure, not a service failure.

**TASK**: Replace the guard condition. The implementing agent should check `!env.KV && !env.CAPTURE_API_KEY` (binding-level, synchronous), not "KV has no apikey records AND CAPTURE_API_KEY absent" (requires a KV list call). Update the corresponding test: `describe('verifyApiKey -- existing behavior')` → `misconfigured environment returns 503` test should seed an env with neither KV binding nor CAPTURE_API_KEY, not just empty KV.

---

## ADVISORY 2 -- `handleGetCapture` and `handleGetCaptureArtifact` remain unauthenticated after this PR, exposing tenant capture data via guessable IDs

**SCOPE**: `src/index.js` -- `handleGetCapture`, `handleGetCaptureArtifact`, `handleCaptureStatus`. Not in the current task's explicit scope, but made newly material by this PR.

**CHANGE**: Today these endpoints use capture ID as an access secret ("`SECURITY: No authentication required -- capture ID acts as the access secret`"). Post-PR, captures are tagged with `tenantId` and the list endpoint enforces tenant isolation. But `GET /v1/captures/{id}` and `GET /v1/captures/{id}/artifacts/*` still return any capture to any caller who guesses the ID. The capture ID is `cap_` + 32 hex chars of a UUID, so it is 128 bits of entropy -- not easily brute-forced in practice. However:

1. The current design comment says "capture ID acts as the access secret" -- that assumption was acceptable when all callers shared the same single key. Post-PR, the threat model changes: tenant A can now enumerate or guess tenant B's capture IDs and retrieve their captures without an API key.
2. Any log line, referral header, CDN access log, or link share that exposes the capture ID bypasses tenant isolation entirely.

This is not a blocker for this PR because the existing behavior is unchanged and the isolation risk only escalates if multiple real tenants exist (the gating condition is not yet satisfied). But the plan does not acknowledge this gap or add it to the backlog.

**WHY**: If this PR ships without the gap being acknowledged, a future operator who provisions two real tenants will have a false sense of isolation. The architecture review should surface this so it is either (a) explicitly accepted as a known limitation, or (b) added to the backlog as a near-term follow-on item.

**TASK**: In Task 5 (documentation), the software-docs-minion should add a backlog item: "Add tenant-scoped auth to GET /v1/captures/{id} and artifact endpoints (currently secured by capture ID entropy; becomes a cross-tenant isolation gap once multiple real tenants exist)." Mark it as a blocker before onboarding a second production tenant. Also update the `SECURITY.md` scope addition to include this known limitation.

---

## ADVISORY 3 -- `POST /v1/admin/keys` response includes raw `keyHash` which is a partial oracle for timing attacks against future revoke calls

**SCOPE**: Task 3 (`src/admin.js`) -- `handleAdminCreateKey` response body.

**CHANGE**: The `POST /v1/admin/keys` 201 response returns `keyHash` (the full 64-hex-char SHA-256 hash). The `DELETE /v1/admin/keys/{keyHash}` endpoint accepts this hash as a path parameter and uses it to look up and revoke the key. The revoke path is protected by `verifyAdminKey` (timing-safe), so there is no direct timing attack here. However, returning the full hash in the create response means the hash is transmitted in plaintext over the wire and may appear in client-side logs, browser history, or curl output, even though the raw key is not. The hash itself is not sensitive in the same way as the key -- it cannot be used to authenticate as the tenant. But it does allow anyone with admin access who observes the create response to construct the DELETE URL without needing to list keys first. This is low severity in a single-admin model (only one person holds ADMIN_KEY) but worth noting.

The spec calls for returning `keyHashPrefix` (first 8 chars) in log events for found-but-rejected keys. The implementation should be consistent: if the logging convention is to use only the prefix for correlation, the question is whether the full hash needs to be in the create response body at all. The full hash is needed for the DELETE call, so this is a real operational need -- but it should be noted in the API docs that the key hash is not secret and has limited security sensitivity.

**WHY**: This is primarily a documentation gap, not a design flaw. The distinction matters because operators need to understand that the hash is safe to store in config management or share with teammates (unlike the raw key), but that it does not need to be protected as a secret credential.

**TASK**: In Task 5 (OpenAPI spec), add a description field to the `keyHash` property in `AdminKeyCreated` schema: "The SHA-256 hash of the raw key (hex-encoded). Used to identify the key in list and revoke operations. This value is safe to store and share -- it cannot be used to authenticate as the tenant." This prevents operators from either over-protecting it (storing it in secrets managers alongside the key) or under-protecting it (being surprised when it appears in logs).

---

## Summary

| Advisory | Severity | Blocking | Task |
|----------|----------|----------|------|
| Misconfiguration guard uses KV list call; should use binding-presence test | Medium | No | Task 1 |
| GET /v1/captures/{id} unauthenticated -- gap not acknowledged in backlog | Medium | No | Task 5 |
| keyHash semantics not documented in OpenAPI | Low | No | Task 5 |

None of these are blockers. The auth architecture, scope separation, rate-limit-before-auth ordering, and test coverage plan are all correct. The approval gate on Task 1 is well-placed.
