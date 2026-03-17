## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### 1. The three-endpoint surface is sufficient — but the GET response design matters most

POST/GET/DELETE covers the functional job. The cognitive risk is not in the route count but in what GET /v1/admin/keys returns. Operators managing keys need to answer: "Which keys are active? Who created them? When? What can they do?" If the list response omits label/description, createdAt, and scope, operators cannot make a revocation decision without guesswork. The response schema must include at minimum:

- `keyHash` — the identifier used in DELETE
- `label` or `description` — human-assigned name (set at creation, required)
- `createdAt` — ISO 8601
- `lastUsedAt` — ISO 8601 or null (critical for compromise triage; omit if operationally expensive)
- `scopes` — array of scope strings granted to this key

Without label, every key in the list is anonymous. An operator faced with three identical-looking hashes cannot confidently choose which to revoke. This violates Nielsen's "minimize memory load" — the user should not need an external log to identify their own keys.

**Recommendation:** Require `label` (string, 1-64 chars) in POST body. Return it in GET list and POST response. This is the single most important design decision for operator safety.

#### 2. Journey gap: key compromise recovery is the highest-stakes flow and it has no guardrails

The operator journey under compromise is:

1. Detect suspicious activity (outside this API)
2. GET /v1/admin/keys — identify which key is compromised
3. DELETE /v1/admin/keys/{keyHash} — revoke it
4. POST /v1/admin/keys — create replacement
5. Distribute new key to affected services

Step 2 is where operators will fail if GET returns anonymous entries. Step 3 is irreversible with no confirmation signal — that is fine for an API, but the 200/204 response should echo back the label and hash of what was just deleted, so the operator can confirm they revoked the right key. Without that echo, a fat-finger on the hash is silent and undetectable.

**Recommendation:** DELETE response body (204 is conventional but 200 is acceptable here) should return `{keyHash, label, revokedAt}`. This gives operators confirmation without requiring them to GET the list again.

#### 3. POST response: show the raw key once, but also show what it grants

The settled decision (raw key shown once in POST response) is correct. The cognitive gap is that operators receiving the key for the first time don't know what it unlocks. Showing `scopes: ["capture"]` in the POST response alongside the raw key answers "what can this key do?" at the moment of highest attention.

On whether to include a curl example: no. The OpenAPI spec is the documentation surface; embedding a curl example in a runtime API response conflates documentation with operation. It adds noise to automated consumers and looks amateurish in production logs. The OpenAPI doc (or a README) is the right place for examples. The POST response should be clean and machine-parseable.

**POST response should include:**
- `key` — raw key, shown once
- `keyHash` — the identifier for future DELETE calls
- `label` — echoed back
- `scopes` — array
- `createdAt` — ISO 8601

Do not add `hint`, `example`, or prose fields to the response body.

#### 4. Error message clarity: the 401/403 distinction is correct but the 403 detail needs work

The settled decision (403 names required scope, 401 for invalid/revoked) maps correctly to HTTP semantics. The operator cognitive model:

- 401: "My key is wrong or missing" — fix: check the key value
- 403: "My key is valid but lacks permission" — fix: use an admin-scoped key

The risk is in the detail string for 403. "Requires capture scope" would be a confusing detail on an admin endpoint — the operator would think they need a capture key, not an admin key. The detail must name the required scope precisely:

- Bad: `"Requires capture scope"`
- Bad: `"Insufficient permissions"`
- Good: `"Admin scope required; this endpoint requires Bearer token with 'admin' scope or ADMIN_KEY env var"`

This follows the existing `responses.js` convention: "State what is wrong and what to do." The existing 400 example "URL scheme 'ftp' is not allowed; use http or https" is a good model — it names the problem and the remedy in one sentence.

**Recommendation:** 403 detail string template: `"Admin scope required. Use a key with 'admin' scope or the ADMIN_KEY environment variable."`

The 401 detail should distinguish between "missing" and "invalid/revoked" because the remediation is different:
- Missing: `"Authorization header is required."`
- Invalid: `"API key is invalid or has been revoked."`

These are different operator journeys (one is a configuration error, one is a security event). The existing Problem401 response shows only the "missing" example — the "revoked" variant needs its own example in the OpenAPI spec.

#### 5. Journey gap: there is no signal that a DELETE target does not exist

DELETE /v1/admin/keys/{keyHash} on a non-existent hash should return 404 with a clear message, not silently succeed with 204. Silent success on a mistyped hash means an operator believes they revoked a key that is still active. This is a security gap masquerading as a UX gap.

**Recommendation:** 404 response for DELETE with detail: `"Key {keyHash} not found. Use GET /v1/admin/keys to list active keys."`

The "what to do" clause (list active keys) follows the established responses.js convention and closes the cognitive loop by pointing back to the discovery endpoint.

#### 6. Scope discovery: operators cannot currently enumerate what scopes exist

Nothing in the current design tells an operator which scopes are valid when creating a key. If POST accepts an invalid scope string, the error should name the valid options. This is a Kano must-be: an operator who cannot enumerate valid scopes cannot self-serve.

**Recommendation:**
- POST 400 on invalid scope: `"Unknown scope 'foo'. Valid scopes: capture, admin"`
- Document valid scopes in OpenAPI `enum` on the scopes field (not runtime discovery — static documentation is sufficient here)

---

### Proposed Tasks

**T1 — Require `label` field in POST /v1/admin/keys**
- Input validation: required, string, 1-64 chars, reject empty/whitespace
- Store label alongside key record
- Return label in POST response and all GET list entries
- 400 detail if missing: `"Field 'label' is required. Provide a name to identify this key."`

**T2 — Design GET /v1/admin/keys response schema**
- Fields per entry: `keyHash`, `label`, `scopes`, `createdAt`, `lastUsedAt` (nullable)
- Paginated using the existing cursor pattern (consistent with CaptureListResponse)
- Empty list returns `{data: [], pagination: {cursor: null, hasMore: false, limit: 20}}` — not 404

**T3 — DELETE /v1/admin/keys/{keyHash}: return 200 with confirmation body**
- Body: `{keyHash, label, revokedAt}`
- 404 with actionable detail when hash not found
- This deviates from REST purist 204, justified by operator safety (confirms correct target was revoked)

**T4 — Tighten 401/403 error detail strings**
- 401 "revoked" variant: `"API key is invalid or has been revoked."`
- 403 admin scope: `"Admin scope required. Use a key with 'admin' scope or the ADMIN_KEY environment variable."`
- Add both variants as named examples in OpenAPI Problem401 and Problem403 response components

**T5 — Add scope enum to OpenAPI, validate at POST**
- Define valid scope values as an enum in the ApiKeyCreate schema
- 400 on unknown scope names the valid set

**T6 — Document the admin API in OpenAPI with full examples**
- POST, GET, DELETE paths with all response codes
- POST 201 example showing full response including `key` (raw, shown once), `keyHash`, `label`, `scopes`, `createdAt`
- GET 200 example with populated list
- DELETE 200 example with confirmation body
- All error codes with realistic detail strings

---

### Risks and Concerns

**Risk 1 — `lastUsedAt` may be operationally expensive**
Tracking last-use time requires a write on every authenticated request (or an async update). On an edge runtime with KV, this could add latency or create write contention under high key volume. If the team judges this too expensive, omit it but document the absence explicitly in the spec — operators should not assume it exists. This is a product decision; flag for the engineering minion.

**Risk 2 — Silent 204 on DELETE of non-existent key is a common default**
Many REST implementations return 204 for idempotency on DELETE regardless of whether the resource existed. The standard rationale is "the desired state is achieved." For API key management, this is wrong — if the hash was mistyped, the operator has a false sense of security. Establish the 404-on-missing-key behavior explicitly in the spec and tests so it does not regress.

**Risk 3 — "Raw key shown once" requires the POST response to be reliable**
If the POST response is lost (network interruption, premature tab close), the key is unrecoverable and the operator must create a new one. This is acceptable behavior but should be documented. The spec should include a `note` field in the POST 201 response body (consistent with the existing CaptureAccepted schema pattern): `"Store this key securely. It will not be shown again."` This is not help documentation — it is a one-sentence operational signal at the right moment.

**Risk 4 — Admin API has no rate limiting signal in the current design**
The existing capture endpoints have `X-RateLimit-Limit` and `Retry-After` headers. The admin endpoints should either inherit this pattern or explicitly document that they do not. An operator who hits an undocumented rate limit on key creation during an incident has no signal to back off.

---

### Additional Agents Needed

No additional agents required for UX strategy. The recommendations above are design decisions that feed into:

- **Engineering minion**: implement label field, response schemas, 404 behavior on DELETE, error detail strings, `lastUsedAt` feasibility assessment
- **API docs / OpenAPI author**: translate the response schema recommendations and error examples into openapi.yaml additions (T6)

The UX work is complete at the design decision level.
