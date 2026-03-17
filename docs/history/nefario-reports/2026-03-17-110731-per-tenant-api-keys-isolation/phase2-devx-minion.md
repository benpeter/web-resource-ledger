## Domain Plan Contribution: devx-minion

### Recommendations

#### 1. Curl Examples for the Migration Runbook and OpenAPI Spec

Every admin endpoint needs a complete, copy-paste-ready curl example. The
operator will be provisioning keys infrequently -- maybe once a quarter --
so the examples must be self-contained (no "see above for auth" references).

**POST /v1/admin/keys -- Create a key:**

```bash
# Create a capture-scoped key for the default tenant
curl -s -X POST https://wrl.example.com/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "default", "scopes": ["capture"], "name": "prod-primary"}' \
  | jq .
```

The response includes the raw key exactly once. The example should pipe to
`jq` so the operator sees formatted JSON and can extract the key with
`jq -r .key` for storage:

```bash
# Create and immediately save the raw key to a file
curl -s -X POST https://wrl.example.com/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "default", "scopes": ["capture"], "name": "prod-primary"}' \
  | jq -r .key > /tmp/wrl-key-prod-primary.txt

echo "Key saved. Store it securely -- it cannot be retrieved again."
```

**GET /v1/admin/keys -- List keys:**

```bash
# List all active keys
curl -s https://wrl.example.com/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  | jq .

# List keys for a specific tenant
curl -s "https://wrl.example.com/v1/admin/keys?tenantId=default" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  | jq .
```

**DELETE /v1/admin/keys/{keyHash} -- Revoke a key:**

```bash
# Revoke a key by its hash (from the create or list response)
curl -s -X DELETE https://wrl.example.com/v1/admin/keys/a1b2c3d4e5f6... \
  -H "Authorization: Bearer $ADMIN_KEY" \
  | jq .
```

The DELETE example must show where to get the keyHash from. In the runbook,
place this immediately after the list example so the operator sees the
`keyHash` field in the list output before needing it for deletion.

The OpenAPI spec should include these examples verbatim in `x-codeSamples`
or the `description` field of each operation. The runbook in OPERATIONS.md
should duplicate them with environment-specific variables (`$WRL_BASE_URL`,
`$ADMIN_KEY`).

#### 2. One-Time Key Display UX

This is the most critical developer experience decision in the admin API.
The pattern is well-established (Stripe, GitHub, AWS) but the JSON API
version needs careful field design.

**Recommended POST response structure:**

```json
{
  "key": "wrl_live_base64urlstring...",
  "keyHash": "a1b2c3d4e5f6...",
  "tenantId": "default",
  "scopes": ["capture", "read"],
  "name": "prod-primary",
  "createdAt": "2026-03-17T14:30:00.000Z",
  "warning": "Store this key now. It cannot be retrieved after this response."
}
```

Key design decisions:

- **Field name `key`**, not `apiKey`, `rawKey`, or `secret`. The field name
  `key` is what the operator will `jq -r .key` for. Shortest path to
  extraction. Consistent with Stripe's `POST /v1/api_keys` response.

- **`warning` field in the response body**, not just documentation. Every
  tool that displays this JSON will surface the warning. This is defense
  against a distracted operator who pipes to `jq .key` without reading the
  docs. The warning text is advisory, not machine-parseable -- clients
  should not switch on it.

- **`scopes` array reflects effective scopes**, not just requested scopes.
  If the operator requests `["capture"]`, the response should return
  `["capture", "read"]` because `capture` implies `read`. This makes the
  scope model transparent and prevents confusion ("I asked for capture,
  why can this key read?"). The POST response is the truth -- what you see
  is what the key can do.

- **`keyHash` in the response**. The operator needs this to DELETE the key
  later, and they cannot compute it from the raw key without knowing the
  hash algorithm. Including it in the create response and in list responses
  closes the loop. This is the identifier for all subsequent operations on
  this key.

- **No `keyPrefix` or masked display**. Unlike Stripe (which shows `sk_live_...1234`
  in the dashboard), WRL has no dashboard. The list endpoint will show the
  key hash and name, which is sufficient for identification. Showing a prefix
  of the raw key in the list response would be a security decision (partial
  key disclosure) that security-minion should weigh in on.

#### 3. Auth Header: Use `Authorization: Bearer` for Both, Not `X-Admin-Key`

**Do not use a custom `X-Admin-Key` header.** Use `Authorization: Bearer`
for both admin and tenant keys. Here is the reasoning:

- **Consistency**: The existing API uses `Authorization: Bearer`. The admin
  API should use the same pattern. Operators and tools (curl, Postman, HTTP
  clients) already know how to set Bearer auth. A custom header requires
  learning a new convention.

- **Prevention through key format, not header format**: The `wrl_live_`
  prefix on tenant keys and the separate `ADMIN_KEY` credential are already
  distinct. If an operator accidentally uses the admin key as a capture key,
  the auth module should reject it with a clear 403: `"Admin credentials
  cannot be used for capture operations. Use a tenant key with 'capture'
  scope."` This is a safer protection than relying on operators to remember
  which header to use.

- **Scriptability**: Every HTTP client in every language knows
  `Authorization: Bearer <token>`. Custom headers require per-client
  configuration. The admin API will be called from scripts, CI/CD, and
  possibly a future CLI -- all of which benefit from standard auth headers.

- **Security argument for `X-Admin-Key`**: The only argument for a separate
  header is that browser extensions and autocomplete tools might leak the
  admin key if it is stored alongside regular Bearer tokens. This does not
  apply -- the admin API has no browser-facing CORS or UI. It is strictly
  server-to-server or operator-to-API via curl.

**Exception**: If the admin API and tenant API share the same Worker and
the same `Authorization: Bearer` header, the auth module must distinguish
admin keys from tenant keys. The recommended approach (per the advisory)
is: `ADMIN_KEY` env var checked first for `/v1/admin/*` routes, then
KV-based lookup for all other routes. The admin key never enters KV; it
is an infrastructure secret only.

#### 4. Error Messages for Admin Operations

Every error message follows the existing RFC 9457 pattern with `detail`
that tells the operator what went wrong and what to do. Here is the
complete error catalog for admin operations:

**Authentication errors (admin routes):**

| Condition | Status | Detail |
|-----------|--------|--------|
| Missing Authorization header | 401 | `Authorization header is required` |
| Non-Bearer scheme | 401 | `Authorization header must use Bearer scheme` |
| Invalid admin key | 401 | `Invalid admin key` |
| ADMIN_KEY not configured | 503 | `Admin API is not configured` |

**POST /v1/admin/keys validation errors:**

| Condition | Status | Detail |
|-----------|--------|--------|
| Missing Content-Type | 415 | `Content-Type must be application/json` |
| Invalid JSON body | 400 | `Request body must be valid JSON` |
| Missing tenantId | 400 | `Field 'tenantId' is required` |
| tenantId wrong type | 400 | `Field 'tenantId' must be a string` |
| tenantId invalid format | 400 | `Field 'tenantId' must be 1-64 lowercase alphanumeric characters, hyphens, or underscores` |
| Missing scopes | 400 | `Field 'scopes' is required` |
| scopes wrong type | 400 | `Field 'scopes' must be a non-empty array` |
| Invalid scope value | 400 | `Invalid scope 'foo'. Valid scopes: capture, read, admin` |
| Missing name | 400 | `Field 'name' is required` |
| name wrong type | 400 | `Field 'name' must be a string` |
| name too long | 400 | `Field 'name' must be 1-64 characters` |
| name invalid chars | 400 | `Field 'name' must contain only alphanumeric characters, hyphens, or underscores` |
| Duplicate name for tenant | 409 | `A key named 'prod-primary' already exists for tenant 'default'` |

The duplicate name check is a convenience, not a security constraint.
Operators will use names to identify keys in list output, so uniqueness
per tenant prevents confusion. The 409 tells the operator exactly what
collided and where.

**DELETE /v1/admin/keys/{keyHash} errors:**

| Condition | Status | Detail |
|-----------|--------|--------|
| keyHash not found | 404 | `Key not found` |
| Key already revoked | 200 | (idempotent success -- see below) |

**DELETE should be idempotent.** If the key is already revoked, return 200
with the same response shape as a successful revocation. This matches HTTP
semantics (the desired state is achieved) and prevents operators from
needing to handle a "was it already revoked?" error path in scripts. The
`revokedAt` timestamp from the original revocation is preserved.

If the keyHash format is invalid (not a valid hex string), return 400:
`"Key hash must be a lowercase hex string"`.

**Scope enforcement errors (on capture/read endpoints):**

| Condition | Status | Detail |
|-----------|--------|--------|
| Key lacks required scope | 403 | `This key does not have 'capture' scope` |
| Revoked key used | 401 | `API key has been revoked` |
| Admin key used on capture endpoint | 403 | `Admin credentials cannot be used for capture operations. Use a tenant key with 'capture' scope.` |

The 403 for scope enforcement names the specific missing scope. The message
format `"This key does not have 'capture' scope"` is better than
`"Requires scope: capture"` because:

- It tells the operator that the *key* is the problem, not the endpoint
- It names the scope they need, which is actionable (create a new key
  with that scope, or use a different key)
- It reads as natural English, not a code-style label

The revoked key case uses 401 (not 403) because the credential is no longer
valid -- the key's identity is not recognized. This is consistent with the
existing `Invalid API key` pattern. The detail message is different so the
operator knows the cause is revocation specifically, not a typo.

The admin-key-on-capture-endpoint case is 403 because the credential is
valid (the admin key is real) but not authorized for this operation. The
message tells the operator what to do instead.

#### 5. Include keyHash in Create and List Responses

**Yes, absolutely.** The keyHash must be in both POST (create) and GET (list)
responses. This is the primary identifier for key management operations
after creation.

**POST response**: includes `keyHash` alongside the one-time `key` field.
The operator should save both: the raw key for API calls, the hash for
future management.

**GET response**: each key object includes `keyHash`, `tenantId`, `scopes`,
`name`, `createdAt`, and optionally `revokedAt`. The raw `key` is never
shown -- this is the whole point of one-time display.

```json
{
  "data": [
    {
      "keyHash": "a1b2c3d4e5f6...",
      "tenantId": "default",
      "scopes": ["capture", "read"],
      "name": "prod-primary",
      "createdAt": "2026-03-17T14:30:00.000Z"
    },
    {
      "keyHash": "7890abcdef12...",
      "tenantId": "default",
      "scopes": ["capture", "read"],
      "name": "prod-backup",
      "createdAt": "2026-03-18T09:00:00.000Z",
      "revokedAt": "2026-03-19T11:00:00.000Z"
    }
  ]
}
```

The `keyHash` should be the full SHA-256 hex string (64 characters). Do not
truncate -- the operator will copy-paste this into DELETE commands.
Truncation creates ambiguity risk (what if two keys share a prefix?) and
requires the API to implement prefix matching, which is unnecessary complexity.

Revoked keys should appear in list output by default with a `revokedAt`
field present. This gives operators a complete view of key lifecycle.
If the list grows large enough to be noisy, add `?active=true` as a
filter. But for MVP (single-digit keys per tenant), showing all keys with
clear revocation status is better than hiding revoked keys behind a flag.

### Proposed Tasks

1. **Define curl example set for OPERATIONS.md migration runbook** --
   Write the complete step-by-step curl workflow: (a) provision ADMIN_KEY
   via wrangler secret, (b) create first tenant key, (c) verify the key
   works by making a capture, (d) list keys to confirm, (e) revoke legacy
   key. Each step includes the exact curl command, expected response, and
   what to verify before proceeding. Estimated size: ~50 lines of
   documented shell commands.

2. **Add curl examples to OpenAPI spec operations** -- Each of the three
   admin endpoints (`POST`, `GET`, `DELETE`) gets a curl example in its
   OpenAPI `description` or `x-codeSamples`. These are reference examples,
   not tutorial-style like the runbook.

3. **Design the one-time key display response schema** -- Define the POST
   response JSON schema with `key`, `keyHash`, `warning`, `tenantId`,
   `scopes`, `name`, `createdAt`. The `warning` field is a string constant.
   Add this schema to the OpenAPI components.

4. **Write the complete admin error message catalog** -- Implement all
   error messages from the table in Recommendation 4 as `problemResponse()`
   calls. Each message must follow the existing convention in
   `src/responses.js`: name the specific resource, state what is wrong and
   what to do, human-readable.

5. **Design the GET /v1/admin/keys list response** -- Define the response
   schema showing `keyHash`, `tenantId`, `scopes`, `name`, `createdAt`,
   and optional `revokedAt`. Wrap in `{ data: [...] }` for consistency
   with `GET /v1/captures` list response pattern. Pagination is not needed
   for MVP (single-digit keys per tenant).

6. **Validate DELETE idempotency behavior** -- Ensure DELETE returns 200
   for already-revoked keys, not 409 or 404. Write test cases for: first
   DELETE (success), second DELETE (idempotent success), DELETE on
   nonexistent hash (404).

### Risks and Concerns

1. **One-time key display has no recovery path.** If the operator loses the
   raw key, they must revoke the lost key and create a new one. This is by
   design, but the runbook must make this explicit. The POST response
   `warning` field helps, but operators who pipe to `jq .keyHash` (wrong
   field) instead of `jq .key` will lose the raw key. Consider: should the
   curl example in the runbook save the full JSON response to a file as
   well? e.g., `| tee /tmp/wrl-key-response.json | jq .key`. This gives
   a safety net at the cost of writing the raw key to disk (operator must
   clean up).

2. **keyHash as DELETE path parameter leaks key existence.** An attacker
   who can reach the admin API (past rate limiting) could enumerate valid
   key hashes by probing `DELETE /v1/admin/keys/{hash}` and observing 404
   vs 200. This is low-risk because (a) the admin API requires the
   `ADMIN_KEY` infrastructure secret, and (b) knowing a key hash does not
   help without the raw key. But security-minion should confirm this is
   acceptable.

3. **Scope expansion in POST response could confuse operators.** If the
   operator sends `scopes: ["capture"]` and gets back `scopes: ["capture", "read"]`,
   they might wonder why the response differs from their request. The
   alternative is to store and return only the explicitly requested scopes,
   and handle the implication at enforcement time. I recommend the expanded
   form (show effective scopes) with a note in the API docs explaining
   that `capture` implies `read`. This is the "no surprises at enforcement
   time" approach.

4. **Duplicate name enforcement across revoked keys.** If a key named
   "prod-primary" is revoked and the operator wants to create a new key
   with the same name, the 409 duplicate check must exclude revoked keys.
   Otherwise the operator cannot reuse meaningful names. The duplicate check
   should be: "active key with this name for this tenant already exists."

5. **admin key used on capture endpoint fallthrough.** If the ADMIN_KEY
   env var is checked for all routes (not just `/v1/admin/*`), an operator
   who accidentally uses the admin key for a capture request would get
   authenticated. The auth module must enforce that ADMIN_KEY only
   authenticates `/v1/admin/*` routes and returns 403 with the actionable
   message on all other routes. This is a coordination point with
   security-minion.

### Additional Agents Needed

No additional agents needed beyond those already in the meta-plan. The
devx concerns identified here have natural coordination points with:

- **security-minion**: Validation that the admin-key-on-capture-endpoint
  guard (Recommendation 3) is correctly placed in the auth flow, and that
  the keyHash enumeration risk (Risk 2) is acceptable.
- **api-design-minion**: Agreement on the POST response schema
  (Recommendation 2), particularly the `warning` field and the effective-
  vs-requested scopes question (Risk 3).
- **ux-strategy-minion**: Alignment on the 403 message format
  (Recommendation 4) and migration runbook structure (Task 1). The
  ux-strategy-minion is handling the operator mental model; devx-minion
  is handling the curl-level ergonomics. These should be consistent.
