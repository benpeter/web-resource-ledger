# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. The three-endpoint admin API is the right abstraction -- with one refinement

The operator's JTBD: "When I need to onboard a new tenant, I want to provision them a key with the right permissions, so they can start capturing immediately."

Three endpoints (POST create, GET list, DELETE revoke) map directly to three mental operations: make a key, see what keys exist, kill a key. This is a natural CRUD subset -- no abstraction mismatch. The operator does not need to think in terms of "tenants" as a separate entity; tenants are an attribute of keys, not a lifecycle of their own.

**Do not add a tenant management API.** Tenants should be created implicitly when the first key is created for a tenantId. The operator's mental model is "I create keys for people" -- not "I create tenants, then create keys within tenants." Requiring tenant pre-provisioning adds a step that serves the system, not the user. It violates progressive disclosure: introduce complexity only when the operator has a reason to manage tenants independently (e.g., tenant-level quotas or billing, which are out of scope).

**One refinement**: the POST response must include the `keyHash` alongside the raw key. The operator needs the hash to later revoke the key (DELETE requires `{keyHash}`). If POST returns only the raw key and GET returns only the hash, the operator must mentally link these across two requests. Returning both in the creation response collapses this into a single "save this output" moment. (The devx-minion consultation likely raises this too -- coordinate to ensure we converge on the same answer.)

### 2. Error message design: operator-centric, action-oriented

The existing error convention in `responses.js` is good: "Name the specific resource. State what is wrong and what to do." Apply this consistently to admin API errors.

#### DELETE on already-revoked key: idempotent, not an error

**Recommendation: Return 200 with `"revoked": true` and `"revokedAt": "<timestamp>"`.** Do not return 409 or 410.

Rationale from operator journey: The operator's intent is "this key should be revoked." If it already is, the intent is fulfilled. Returning an error for "key already revoked" creates a moment of "wait, did something go wrong?" -- unnecessary cognitive load. Idempotent DELETE is the established REST pattern (Stripe, Cloudflare, AWS IAM all do this). The operator sees confirmation that the key is revoked, regardless of whether they caused it.

If the key hash is not found at all (never existed), return 404: `"No key found with this identifier."` -- this is a real error (typo, wrong hash) and requires operator action.

#### Tenant creation: implicit on first key

As stated above, do not require pre-provisioning. If `POST /v1/admin/keys` specifies `tenantId: "acme"` and no "acme" tenant exists, create it. The tenantId is validated against the existing `TENANT_ID_RE` regex (`/^[a-z0-9_-]{1,64}$/`), which is sufficient constraint.

No "tenant not found" error should exist. The only tenant-related error: if the tenantId fails regex validation, return 400 with `"tenantId must contain only lowercase letters, digits, hyphens, and underscores (1-64 characters)."` This tells the operator exactly what is wrong and exactly what to fix.

#### Scope validation errors

If the operator provides an invalid scope value, return 400:
`"Unknown scope 'writes'. Valid scopes: capture, read, admin."`

This follows the existing pattern of naming the invalid input and stating the valid alternatives. Enumerate valid scopes in the error -- the operator should not have to look up documentation to fix the request.

If the operator provides an empty scopes array, return 400:
`"At least one scope is required. Valid scopes: capture, read, admin."`

#### Name uniqueness

Key names should be unique per tenant (not globally). If the operator reuses a name, return 409:
`"A key named 'production-reader' already exists for tenant 'acme'. Use a different name or revoke the existing key first."`

Name the conflicting key, name the tenant, and state what to do. This is actionable. However, consider whether name uniqueness is a must-have or an over-constraint. The operator may legitimately want two keys with the same label (e.g., rotating "production" keys). If uniqueness is enforced, it should only apply to active (non-revoked) keys -- revoked keys release their names.

**Alternative to consider**: Do not enforce name uniqueness at all. Names are labels for human recall, not identifiers. The `keyHash` is the identifier. Unique names create friction during key rotation: the operator must either revoke the old key first (breaking the rotation window) or invent a temporary name. Non-unique names with timestamps in the list response solve the identification problem without the constraint. This is a judgment call -- flag it for the api-design-minion and security-minion to weigh in on.

### 3. Migration runbook: structure around the operator's mental model

The operator's mental model for this migration has three phases, not seven steps. Structure the runbook accordingly.

**Phase 1: "Deploy the new code" (nothing breaks)**

The operator's key question: "Can I deploy this without affecting anything?"
Answer: Yes. The dual-mode fallback means the existing `CAPTURE_API_KEY` continues to work. This phase is zero-risk.

Single action: merge and let CD deploy.
Verification: existing curl commands still work.

**Phase 2: "Set up the admin API" (new capability, nothing breaks)**

The operator's key question: "How do I start using the new system?"
Answer: Set the ADMIN_KEY secret, then create your first tenant key.

Two actions:
1. `wrangler secret put ADMIN_KEY` (both staging and production)
2. `curl -X POST .../v1/admin/keys` to create first key for `default` tenant

Verification: use the new key to submit a capture.

**Phase 3: "Remove the old key" (cleanup, only after confidence)**

The operator's key question: "When is it safe to remove the legacy key?"
Answer: When all clients have switched to KV-based keys and you have verified they work.

Two actions:
1. Update any client configurations to use the new key
2. `wrangler secret delete CAPTURE_API_KEY`

Verification: captures still work with the new key. Old key returns 401.

**Runbook formatting principles:**

- Lead each phase with the operator's question (reduces anxiety, builds mental model)
- Bold the single-sentence answer before the steps
- Mark each phase with its risk level: Phase 1 (zero risk), Phase 2 (additive only), Phase 3 (destructive, reversible)
- Include a "What if something goes wrong?" callout in each phase (not a separate rollback section -- the rollback context should be proximate to the risk, not separated by pages)
- Use the existing OPERATIONS.md style (code blocks with copy-pasteable commands, no placeholder URLs except the established `<YOUR_PRODUCTION_URL>` pattern)
- Keep the runbook under one screen height per phase. The operator should never have to scroll to see the full picture of a phase.

**Critical detail**: The runbook must explicitly state the relationship between PR merge, deploy, and secret provisioning. These are three separate events. The current OPERATIONS.md already explains that "the CD pipeline deploys code only" and "worker runtime secrets persist across all subsequent deploys" -- the runbook should reference this rather than re-explain it, to avoid contradictory documentation.

### 4. Key prefix: `wrl_live_` is good, add `wrl_test_` for staging

`wrl_live_` is a strong prefix. It follows the Stripe convention that operators already recognize. It provides:

- **Namespace identification**: "wrl" tells the operator which service this key belongs to, critical when managing dozens of API keys in a password manager or env file.
- **Environment identification**: "live" distinguishes production keys from test keys.
- **Visual scanability**: the underscore-separated segments are easy to parse in a terminal or config file.

**Recommendation**: Also generate `wrl_test_` prefixed keys when the admin API is called on a staging environment. Distinguish by checking `env.ENVIRONMENT` or similar binding. This prevents the "used a staging key against production" class of operator error, which is otherwise invisible until a 401 with no useful diagnostic. If environment detection is not straightforward, defer this and document it as a follow-on enhancement -- do not block the implementation.

**Key length consideration**: The full key (`wrl_live_` + 43 chars base64url of 256 bits) will be approximately 52 characters. This is within the range operators expect for API keys and fits comfortably in env files and CLI arguments. No concern here.

### 5. 403 message format: sentence, not label

**Recommendation**: Use natural language, not label syntax.

Proposed format:
`"This action requires a key with 'capture' scope. Your key has 'read' scope only."`

Rationale:

- `"Requires scope: capture"` reads like a log entry, not a message to a human. It demands the operator already know the scope model to interpret it. It follows machine convention (key-value pairs), not human convention (sentences).
- The natural-language form follows the existing convention in `responses.js`: "State what is wrong and what to do." It names the required scope AND the actual scope, so the operator can self-diagnose without a second request.
- Including the actual scope of the presented key is critical. A 403 that says "you need capture scope" without saying "you have read scope" forces the operator to go check what scopes their key has -- a separate mental task. Collapsing this into one message eliminates a round trip.

**For admin endpoints specifically** (where `ADMIN_KEY` env var is the credential):
`"Admin endpoints require the ADMIN_KEY credential. Bearer token authentication is not accepted here."`

This prevents the common mistake of using a tenant key against the admin API. Name the correct credential, not just the rejection.

**For revoked keys:**
`"This API key has been revoked. Provision a new key via the admin API."`

State the fact, then state the fix. Do not say "contact your administrator" -- the operator IS the administrator.

**For expired or malformed keys:**
`"Invalid API key. Keys begin with 'wrl_live_' and are provisioned via the admin API."`

Naming the expected prefix helps the operator immediately check whether they pasted the right credential. This is a recognition aid (Nielsen's "recognition over recall"), not a security leak -- the prefix is not secret.

## Proposed Tasks

### T-UX-1: Define error message catalog for admin API

Create a complete catalog of admin API error messages before implementation begins. Each entry: HTTP status, detail string, when it occurs. This catalog should be reviewed as part of the admin API contract gate.

Covers:
- 400: invalid tenantId format, missing required fields, invalid scope values, empty scopes array
- 401: missing Authorization header (on admin endpoints, point to ADMIN_KEY)
- 403: scope mismatch (include required AND actual scope), revoked key used, tenant key used on admin endpoint
- 404: key hash not found (on DELETE)
- 409: key name conflict (if uniqueness enforced -- see recommendation 2)
- 429: admin rate limit exceeded

### T-UX-2: Structure migration runbook as three-phase operator journey

Write the runbook using the three-phase model (deploy, enable, cleanup) with per-phase risk levels and inline rollback instructions. Coordinate with software-docs-minion on placement within OPERATIONS.md.

### T-UX-3: Define 403 response format with scope diagnostics

Specify the exact 403 response body for each scope-mismatch scenario: insufficient tenant key scope, tenant key on admin endpoint, admin key on tenant endpoint (if applicable), revoked key. Each must name what was expected and what was provided.

### T-UX-4: Specify key prefix by environment

Document whether `wrl_test_` prefix applies on staging. If implemented, specify the detection mechanism. If deferred, add to backlog with activation condition.

## Risks and Concerns

### Risk 1: One-time key display is a single point of failure

The raw key is shown exactly once in the POST response. If the operator misses it (terminal scrolls, pipe swallows output, network hiccup), the key is unrecoverable. The only remedy is to create a new key and revoke the lost one.

**Mitigation**: The POST response should include a prominent warning field (not just the key in a data field). Proposed response structure:

```json
{
  "key": "wrl_live_...",
  "keyHash": "abc123...",
  "warning": "Save this key now. It cannot be retrieved again.",
  "tenantId": "acme",
  "name": "production-capture",
  "scopes": ["capture"],
  "createdAt": "..."
}
```

The `warning` field is atypical in API responses, but this is a security-critical moment where the API must communicate urgency. Stripe and GitHub both include similar messaging in their key-creation responses. This is a must-be feature (Kano) -- its absence will cause operator incidents.

### Risk 2: Key hash as DELETE identifier creates a usability gap

The operator receives a raw key from POST, but needs a hash to DELETE. If they did not save the hash from the POST response, they must call GET /v1/admin/keys to find it. This is not terrible (one extra call), but it creates friction for the most stressful operation (emergency key revocation during a compromise).

**Mitigation**: Ensure GET /v1/admin/keys returns keyHash prominently and that the list is filterable by name, so the operator can find the right key quickly. Also ensure the POST response includes keyHash (per recommendation 1).

### Risk 3: Migration runbook length may exceed operator attention

If the runbook tries to document every edge case, it will not be read. Operators satisfice -- they scan for the next command to run, not the full rationale.

**Mitigation**: Keep the runbook scannable. Use the three-phase structure. Put copy-pasteable commands in code blocks. Put rationale in collapsed details or footnotes, not inline. Test the runbook by timing a cold read: if it takes more than 3 minutes to understand the full sequence, it is too long.

### Risk 4: Scope model learnability for infrequent operators

Three scopes (`capture`, `read`, `admin`) with one implication rule (`capture` implies `read`) is simple enough for a first encounter. However, the rule that `admin` does NOT imply `capture`/`read` is counter-intuitive -- most permission models make admin a superset. An operator who creates an admin-scoped key and then tries to capture will get a confusing 403.

**Mitigation**: The 403 response for this case must be especially clear:
`"This action requires 'capture' scope. Admin-scoped keys do not include capture permissions. Create a separate key with 'capture' scope for this tenant."`

This names the misconception ("admin does not include capture") and the fix ("create a separate key"). The scope model should also be documented in the POST response's input validation help and in the migration runbook's Phase 2.

## Additional Agents Needed

No additional agents are needed beyond the eleven already planned. However, I want to flag coordination points:

- **devx-minion** and I have overlapping concerns on error message design and the one-time key display pattern. Our recommendations should be synthesized, not applied independently. If we disagree, the synthesis should favor the recommendation that reduces operator cognitive load at the moment of highest stress (key creation and emergency revocation).

- **api-design-minion** should weigh in on whether the `warning` field in the POST response is appropriate for the API contract. It is atypical but justified by the one-time-display security constraint. If the api-design-minion prefers a header-based warning (`Warning: 199 - "Save this key now"`) over a body field, that is also acceptable from a UX perspective -- the key is that the warning reaches the operator regardless of how they consume the response.

- **security-minion** should validate that including the actual scope in 403 responses ("Your key has 'read' scope only") does not leak information that aids an attacker. My assessment: it does not, because the scope model is public (advisory decision) and the attacker already possesses the key. But security-minion should confirm.
