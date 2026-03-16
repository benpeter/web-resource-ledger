## Domain Plan Contribution: security-minion

### Recommendations

#### 1. tenantId value: "default" is safe with strict validation

Hardcoding `tenantId: 'default'` for the single static key is a sound
approach. It establishes the identity envelope now so R12 (per-tenant keys)
is a lookup change, not a structural refactor. However, the safety depends
entirely on what validation is applied to tenantId at the point of use --
not at the point of assignment.

**Specific guidance:**

- The `verifyApiKey()` return value is a trusted boundary output. Today it
  returns a hardcoded string, but when R12 lands, tenantId will come from a
  key-to-tenant mapping (KV lookup, env config, etc.). The validation must
  be applied at that boundary regardless of the current hardcoding.
- Validate tenantId with a strict allowlist pattern: `/^[a-z0-9_-]{1,64}$/`.
  This blocks colons, slashes, null bytes, Unicode, and any character that
  could have meaning in KV key construction, R2 paths, or log field parsing.
- Apply this validation inside `verifyApiKey()` itself -- not downstream.
  The auth module is the trust boundary; it should never emit a tenantId it
  hasn't validated. Today that's redundant (it's literal `'default'`), but
  it establishes the invariant R12 will depend on.
- Document the validation contract in the JSDoc: "tenantId matches
  /^[a-z0-9_-]{1,64}$/ -- callers may use it in key construction without
  further sanitization."

#### 2. Auth enforcement: extract a reusable wrapper, do not duplicate

The current `handleCreateCapture` inlines the auth check at step 2. Adding
the same pattern to `handleListCaptures` creates duplication that will grow
with every authenticated endpoint (R12 adds tenant-scoped variants of
existing endpoints, R13 adds audit logging endpoints, etc.).

**Specific guidance:**

- Create a `requireAuth(request, env)` wrapper that calls `verifyApiKey()`
  and returns `{ ok: true, tenantId }` or `{ ok: false, response }`. This
  is functionally identical to `verifyApiKey()` today, so the wrapper's
  real value is as the single call site where:
  - Security logging (`security.auth_fail`) is centralized
  - The tenantId extraction point is documented
  - Future middleware concerns (rate limiting per tenant, audit logging)
    attach to one location
- However, do NOT over-engineer this into Express-style middleware or a
  chain pattern. A plain function that each handler calls at the top is
  the right abstraction for a Cloudflare Worker with 3-4 authenticated
  routes. The handlers should still explicitly call it -- implicit middleware
  makes security reasoning harder.
- The existing `handleCreateCapture` security log (`security.auth_fail`) is
  good. Ensure the same log fires for list endpoint auth failures.
  Include `tenantId: 'unknown'` (not the provided key!) in auth failure
  logs to distinguish failed attempts from misconfiguration.

#### 3. KV key construction: colon-injection is the primary risk

The proposed key format `tenant:{tenantId}:ts:{ISO}:{captureId}` uses `:` as
a delimiter. If tenantId contains `:`, an attacker (in a future multi-tenant
world) could craft a tenantId that crosses into another tenant's keyspace.

**Specific guidance:**

- The regex validation in recommendation 1 (`/^[a-z0-9_-]{1,64}$/`) is the
  primary defense. It rejects `:` categorically.
- In `kv.js`, assert the invariant defensively at the key construction site:
  ```js
  function tenantPrefix(tenantId) {
    if (!/^[a-z0-9_-]{1,64}$/.test(tenantId)) {
      throw new Error('Invalid tenantId in key construction');
    }
    return `tenant:${tenantId}:`;
  }
  ```
  This is defense-in-depth: if a future code path somehow bypasses auth
  validation and passes an unsanitized tenantId to KV, it fails closed
  (throws) rather than constructing a dangerous key.
- The `KV.list({ prefix })` call for the list endpoint MUST use the
  validated tenant prefix. If the prefix is constructed from unvalidated
  input, an attacker could list another tenant's keys by injecting prefix
  characters. This is the highest-severity risk in the entire implementation.
- The ISO timestamp in the key (`ts:{ISO}`) must also be validated or
  generated server-side. If any part of it comes from user input, reject it.
  For cursor-based pagination, the cursor is opaque to the client -- KV's
  native `cursor` from `list()` is the right approach (it's a server-side
  token, not a client-constructed value).

#### 4. List endpoint auth model: access control escalation from per-capture to per-tenant

This is a meaningful security boundary change. Today, knowing a capture ID
grants access to exactly one capture's metadata and artifacts. The list
endpoint grants access to ALL captures for a tenant. This is correct for the
owner, but the implications must be designed carefully:

**Specific guidance:**

- **The API key IS the tenant credential.** Anyone with the API key can now
  enumerate all captures, not just access individual ones. This is an
  acceptable tradeoff for a single-operator service, but document it
  explicitly in the security comments and OpenAPI spec.
- **The capture-ID-as-secret model is not broken by this.** Unauthenticated
  access to individual captures via their ID continues to work. The list
  endpoint is additive -- it provides a recovery mechanism for the key
  holder. This dual model (public by ID, enumerable by key) is intentional
  and should be stated clearly.
- **Response body filtering is critical.** The list endpoint must NOT return
  fields that the unauthenticated per-capture endpoints redact. Specifically:
  - Never return `ip` (the resolved target IP from SSRF validation)
  - Never return R2 keys (`artifacts.*` values, `wacz.key`)
  - Return only: `id`, `status`, `url`, `createdAt`, `completedAt`,
    `error` (for failed), `retryable` (for failed)
  - This filtering must happen in the handler, not be delegated to the
    KV layer. The KV records store operational data; the API contract
    determines what's exposed.
- **Cache-Control: private, no-store** on list responses. The response
  contains a tenant's full capture inventory -- it must never be cached
  by intermediaries.
- **Rate limit the list endpoint.** KV `list()` + N `get()` calls per page
  is expensive. Without rate limiting, an attacker with a valid key could
  DoS the service via rapid list requests. Use the same per-IP rate limiter
  as capture, or add a dedicated one.

#### 5. Cursor validation for pagination

KV `list()` returns an opaque cursor string for pagination. The client sends
this cursor back on subsequent requests.

**Specific guidance:**

- Treat the cursor as opaque and untrusted. Pass it directly to
  `KV.list({ cursor })` without parsing, transforming, or logging it.
- KV will reject invalid cursors (they're server-signed tokens), so there's
  no injection risk from a malformed cursor -- but do handle the error
  gracefully (400 with "Invalid cursor" rather than 500).
- Do NOT log the cursor value. It may contain internal KV metadata.
- The `status` query parameter for filtering must be validated against an
  allowlist: `['pending', 'complete', 'failed']`. Reject any other value
  with 400. Do not pass arbitrary user input into KV operations.

#### 6. Information disclosure via list endpoint error messages

The list endpoint introduces a new error surface. Ensure:

- 401 responses for missing/invalid auth do not differ between "no key"
  and "wrong key" (already handled by `verifyApiKey`'s uniform 401).
- 404 is never returned for an empty list -- return `{ data: [],
  pagination: { cursor: null } }` with 200. Returning 404 for "no captures"
  would be an information leak (distinguishes "valid tenant with no captures"
  from "invalid tenant").
- The endpoint returns the same 401 whether the tenant exists or not.
  Since there's only one tenant today, this is trivially satisfied, but
  the pattern must hold for R12.


### Proposed Tasks

1. **Validate tenantId in verifyApiKey() return path** -- Add regex
   validation (`/^[a-z0-9_-]{1,64}$/`) to the auth module. Today it guards
   a literal; for R12 it guards a lookup result. Document the contract in
   JSDoc. [MUST -- foundational for key injection prevention]

2. **Add defensive validation in KV key construction** -- Create a
   `tenantPrefix(tenantId)` helper in `kv.js` that re-validates the
   tenantId before building keys. This is defense-in-depth against bypass
   of auth-layer validation. [MUST -- defense-in-depth]

3. **Extract auth helper with centralized security logging** -- Factor
   `verifyApiKey()` + security logging into a `requireAuth()` function
   (in `auth.js`) that both `handleCreateCapture` and
   `handleListCaptures` call. Not middleware -- explicit function call.
   [SHOULD -- reduces duplication without over-engineering]

4. **Filter response fields in list endpoint** -- Ensure the list handler
   strips `ip`, R2 keys, and any internal fields from the response body.
   Apply the same redaction as `handleGetCapture` but for the summary
   view. [MUST -- information disclosure prevention]

5. **Rate limit the list endpoint** -- Apply per-IP rate limiting (reuse
   existing limiter or add a dedicated one). The N+1 KV cost pattern
   makes this endpoint expensive to abuse. [SHOULD]

6. **Validate status query parameter** -- Allowlist `['pending',
   'complete', 'failed']`. Reject anything else with 400. [MUST]

7. **Validate/handle cursor parameter** -- Accept opaque cursor, pass to
   KV, catch errors gracefully. Never log the cursor value. Return 400
   for invalid cursor. [MUST]

8. **Set Cache-Control: private, no-store on list responses** -- The
   response is tenant-scoped and must not be cached by intermediaries.
   [MUST]

9. **Return 200 with empty data array for no results** -- Never 404 for
   an empty list. This prevents tenant existence enumeration. [MUST]

10. **Security tests for the new surface** -- Test cases needed:
    - List endpoint rejects requests without Bearer auth (401)
    - List endpoint rejects requests with wrong key (401)
    - List response does not contain `ip` or R2 keys
    - Invalid status parameter returns 400
    - Empty result set returns 200 with `{ data: [] }`
    - tenantId containing `:` or other special chars is rejected (for
      future-proofing; testable now against the validation regex)
    [MUST]


### Risks and Concerns

**HIGH -- KV key prefix injection (tenantId in key construction)**
If tenantId is ever derived from external input (R12) without validation,
an attacker could manipulate KV `list()` prefixes to enumerate another
tenant's captures. The regex validation in `verifyApiKey()` plus
defense-in-depth in `kv.js` mitigates this, but BOTH layers must ship.
This is not a "nice to have" -- it's the primary injection vector in the
new key format.

**MEDIUM -- Access model escalation awareness**
The list endpoint changes the threat model from "leak one capture ID, lose
one capture" to "leak the API key, enumerate all captures." This is
inherent to the feature requirement and acceptable for a single-operator
service, but it should be explicitly documented in security comments so
the R12 implementation (multi-tenant) knows this is a conscious decision,
not an oversight.

**MEDIUM -- N+1 KV operation cost enables resource exhaustion**
Each list page costs 1 `list()` + up to 20 `get()` calls. Without rate
limiting, an attacker with a valid key could generate significant KV
billing load. Rate limiting mitigates this, but also consider setting a
maximum page size (e.g., 20) that is not overridable by the client.

**LOW -- Cursor as opaque token**
KV cursors are server-signed and not forgeable, but malformed cursor input
could cause unhandled errors if not caught. Wrap the `KV.list({ cursor })`
call in try/catch and return 400 for invalid cursors.

**LOW -- Browser rendering accepted risks carry forward**
`capture.js` documents accepted risks around DNS rebinding and cross-origin
iframe navigation that are explicitly scoped to "single-tenant deployment."
The list endpoint itself doesn't change these risks, but the comment in
`capture.js` (line 54-55: "Revisit both if multi-tenant deployment is
implemented") should be flagged as a dependency for R12 planning.


### Additional Agents Needed

- **test-minion** -- to implement the security test cases enumerated in
  Proposed Task 10. The security-minion identifies what to test; test-minion
  builds the test implementations.
- **api-design-minion** -- to confirm the `{ data, pagination }` envelope
  design, status filter semantics, and cursor parameter naming are
  consistent with the existing API contract (RFC 9457 error responses,
  existing response shapes).
