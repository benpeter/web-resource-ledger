## Domain Plan Contribution: security-minion

### Recommendations

#### Question 1: Minimum viable security posture for a second user

The 8 `[must]` items in Auth/Access Control are NOT all equal. They form a
dependency chain and can be staged into two tiers: a hard gate (must ship
before the second user touches production) and a fast-follow (must ship
before the service is broadly available, but not before a single trusted
second user).

**Hard gate -- ship before any second user:**

1. **Per-tenant API keys** -- The current auth model (`auth.js`) compares
   against a single `CAPTURE_API_KEY` env var. A second user sharing this key
   means: no attribution of who captured what, no ability to revoke one user
   without revoking both, and a shared rate-limit bucket (keyed on
   `CF-Connecting-IP`, not tenant). This is the single biggest blocker.

2. **Tenant isolation** -- Without tenant-scoped data, all captures from all
   users live in one flat KV namespace under `capture:{captureId}`. Capture IDs
   are the sole access secret (the comment in `index.js:143` says this
   explicitly). Any user who guesses or enumerates a capture ID can access
   another user's captures. The ID space is 128-bit hex, so brute-force is
   infeasible, but there is no defense-in-depth: no ownership check, no tenant
   prefix, nothing. Before a second user, captures must carry a tenant
   identifier and retrieval must enforce `tenant == requesting_tenant`.

3. **Audit logging of key usage** -- You need to know who did what from day
   one of multi-tenancy. Retrofitting audit logs after an incident is useless.
   The current security logging (`log.js`) records `security.auth_fail` but
   NOT successful authentications or which key was used. The minimum viable
   audit log entry is: `{event: 'api.request', tenant_id, method, path,
   status, timestamp}`.

4. **Key scoping (read vs write)** -- This is surprisingly important for
   WRL's architecture. Today, the API key gates only `POST /v1/captures`.
   Retrieval endpoints (GET capture, GET artifact, GET verify) are
   unauthenticated -- capture ID is the access secret. If you add per-tenant
   keys and a list endpoint (`GET /v1/captures`), a read-only key compromise
   does not grant capture-creation privileges. Without scoping, every key
   leak is a full write-access compromise. Given the explicit plan for a list
   endpoint (first post-MVP addition), this must ship with per-tenant keys.

**Fast-follow -- ship before broad availability but NOT a hard gate for one trusted second user:**

5. **API key rotation without downtime** -- Important for operational hygiene,
   but for a second trusted user, you can coordinate a brief rotation window.
   The implementation is straightforward: accept an array of valid keys per
   tenant instead of one.

6. **RBAC** -- Full role-based access control is overkill for 2 users. Key
   scoping (read/write) covers the immediate need. RBAC becomes necessary
   when you have team accounts or admin operations.

7. **OAuth for web UI** -- Explicitly `[consider]`, correctly deferred. No
   web UI exists.

8. **Social signup** -- Explicitly `[consider]`, correctly deferred.

**Net answer:** 4 of the 8 are a hard gate (per-tenant keys, tenant
isolation, audit logging, key scoping). The other 4 can be staged. Items 7
and 8 are already `[consider]` and are correctly deferred indefinitely.

**Implementation sequence for the hard-gate items:**

```
per-tenant keys  --->  tenant isolation  --->  key scoping  --->  audit logging
     (1)                   (2)                    (3)                 (4)
```

Rationale: per-tenant keys are the foundation (you need a tenant identity
before you can scope it). Tenant isolation depends on having a tenant ID to
tag captures with. Key scoping refines the permission model. Audit logging
wraps around all of the above (you log tenant ID, key ID, and scope on every
request).

In practice, items 1-3 should be implemented as a single unit (one PR that
replaces the auth module, adds tenant tagging to KV records, and introduces
read/write scopes). Item 4 (audit logging) can be a separate follow-on PR
that adds `api.request` log entries with the tenant context.

#### Question 2: Highest risk-to-effort ratio among `[should]` security items

Ranked by risk-to-effort ratio (highest first):

1. **HSTS preload submission** -- Effort: 15 minutes (add `preload` to the
   existing HSTS header, submit to hstspreload.org). Risk mitigated:
   SSL-stripping attacks on first visit. The HSTS header is already in place
   (`index.js:53`), just missing the `preload` directive. This is the
   single highest ROI security item on the entire backlog.

2. **Hashed IP logging** -- Effort: ~1 hour (HMAC-SHA256 of
   CF-Connecting-IP with a daily-rotating key). Risk mitigated: enables
   brute-force correlation and abuse detection without storing PII (GDPR-
   compatible). The design is already documented; implementation is
   mechanical. This becomes critical the moment a second user exists,
   because you need to distinguish between normal use and credential
   stuffing.

3. **Content moderation policy and abuse reporting** -- Effort: ~2 hours
   (static policy page + abuse@ email endpoint). Risk mitigated: legal
   liability. WRL stores arbitrary web content in R2 and serves it
   (as text/plain with Content-Disposition, but still). Without a DMCA/
   abuse reporting mechanism, the operator has no safe harbor defense.
   This is not a code change -- it is a policy document and a contact
   point. Very low effort, very high legal risk reduction.

4. **Terms of service prohibiting illegal use** -- Same logic as above.
   Ship alongside the content moderation policy. Combined effort with
   item 3: ~3 hours total.

5. **Content security scanning (Safe Browsing)** -- Effort: moderate
   (integrate Google Safe Browsing API, ~4-8 hours). Risk mitigated:
   WRL being used as a malware mirror or phishing content host. This is
   important but the blast radius is limited by the fact that artifacts
   are served as `text/plain` with `attachment` disposition, which
   significantly reduces the XSS/phishing vector. Move this up if WRL
   ever serves HTML with `text/html` content type. For now, it is
   correctly a `[should]`.

**Recommendation:** Move HSTS preload, hashed IP logging, content moderation
policy, and ToS to the same tier as the multi-user auth work. They are low
effort and close real gaps. Content scanning can stay `[should]` for now.

#### Question 3: Signing/legal chain depth -- what to commit to now

The signing chain is: key versioning -> old key archive -> RFC 3161 TSA -> eIDAS.

**Commit to now (near-term, ship with multi-user):**

1. **Key versioning / key ID in signature entries** -- This is not optional
   if you ever plan to rotate keys, which you must do for any production
   service. The current signing implementation (`signing.js`) has exactly
   one key cached in module scope. `wacz.js` embeds the public key in
   `datapackage-digest.json` (`signedData.publicKey`), but there is no
   key ID. If you rotate the signing key, every WACZ signed with the old
   key becomes unverifiable unless the verifier knows to try the old key.

   The fix is straightforward: add a `keyId` field to `signedData` (e.g.,
   SHA-256 fingerprint of the public key, truncated to 8 hex chars). The
   verification endpoint uses the keyId to select the correct public key
   for verification. This is a small schema change with large operational
   payoff.

   **Dependency note:** This must ship before the first key rotation,
   which should be part of the multi-user launch. If you rotate keys
   before adding key IDs, you create a backward-compatibility break that
   requires a migration of all existing WACZ bundles.

2. **Old public key archive endpoint** -- A simple extension of the
   existing `/.well-known/signing-key` endpoint: add support for
   `?keyId=xyz` or a `/.well-known/signing-keys` endpoint that returns
   all current and historical public keys. Without this, third-party
   verifiers cannot verify captures signed with rotated keys.

   **Storage:** KV is sufficient for this. The number of keys will be
   small (single digits over the lifetime of the service). A KV key like
   `signing-key:{keyId}` with the base64 public key as the value is all
   you need. No D1 required.

**Defer (commit to a timeline, but don't build now):**

3. **RFC 3161 TSA** -- The architecture already supports this (the
   `signatures` array design in the WACZ manifest was explicitly designed
   for TSA upgrade). However, implementing it requires ASN.1 parsing,
   which is non-trivial in a Workers environment. The security value is
   real (independent timestamp authority eliminates self-asserted timestamp
   trust), but the current self-asserted timestamps are acceptable for
   the current use case (internal compliance, not courtroom evidence).

   **When to build:** When the first customer asks for timestamps that
   would hold up in a legal proceeding, or when the list endpoint ships
   and captures become discoverable (at which point the evidentiary value
   of the archive increases).

4. **eIDAS Qualified TSA** -- Strategically important for European
   customers (eIDAS 2.0 rolling out through 2026), but this is a business
   decision, not a security decision. The technical prerequisite is RFC
   3161 support, so it is naturally sequenced after item 3. Defer until
   there is a paying European customer or a clear product-market signal.

**Net answer:** Ship key versioning and the key archive endpoint with the
multi-user launch. Defer RFC 3161 and eIDAS with a clear note that the
architecture supports the upgrade path and no schema migration will be
needed.

### Proposed Tasks

#### Task 1: Per-tenant auth and tenant isolation (Hard Gate)

**What:** Replace the single-static-key auth model with per-tenant API keys,
add tenant tagging to KV capture records, enforce tenant-scoped retrieval,
and add read/write key scoping.

**Deliverables:**
- New `auth.js` that looks up API keys from KV (key: `apikey:{hash}`,
  value: `{tenantId, scope, createdAt, label}`). Keys are SHA-256 hashed
  at rest.
- `verifyApiKey()` returns `{ok: true, tenantId, scope}` on success
- KV capture records include `tenantId` field
- `GET /v1/captures/{id}` enforces `record.tenantId == authed.tenantId`
  (or falls through to the unauthenticated capture-ID-as-secret model for
  public verification)
- `POST /v1/captures` requires `write` scope
- `GET /v1/captures` (list endpoint) requires `read` scope and filters by
  tenant
- Rate limiting keyed on `tenantId` instead of `CF-Connecting-IP`
- CLI tooling or admin script to provision/revoke keys

**Dependencies:** None (foundational)

**Security constraints:**
- API keys must be hashed (SHA-256) at rest in KV -- never stored plaintext
- Timing-safe comparison must remain (compare against hash, not raw key)
- Migration path for existing captures (backfill tenantId or treat as
  "system" tenant)

#### Task 2: Audit logging for authenticated requests

**What:** Add structured audit log entries for all authenticated API requests
(not just auth failures).

**Deliverables:**
- Log entry on every authenticated request: `{event: 'api.request',
  tenantId, keyId, scope, method, path, status, durationMs}`
- Log entry on key provisioning/revocation: `{event: 'key.provision',
  tenantId, keyId}` / `{event: 'key.revoke', tenantId, keyId}`
- No PII in logs (no raw IP, no API key values)

**Dependencies:** Task 1 (per-tenant auth)

#### Task 3: Signing key versioning

**What:** Add key ID to signature entries and implement key archive for
backward-compatible verification after key rotation.

**Deliverables:**
- `keyId` field added to `signedData` in `datapackage-digest.json`
  (SHA-256 fingerprint of public key, truncated to 8 hex chars)
- `/.well-known/signing-key` response includes `keyId` field
- New `/.well-known/signing-keys` endpoint returns all current + historical
  keys with their keyIds
- Historical keys stored in KV (`signing-key:{keyId}`)
- Verification endpoint (`/v1/verify/{id}`) reads keyId from WACZ and
  selects the correct public key
- Key rotation procedure documented (add new key, old key moves to archive)

**Dependencies:** None (can be done in parallel with Task 1)

#### Task 4: HSTS preload + content moderation policy + ToS

**What:** Quick-win security items that close real gaps with minimal effort.

**Deliverables:**
- Add `preload` to HSTS header and submit to hstspreload.org
- Content moderation policy document (abuse reporting mechanism)
- Terms of service prohibiting illegal use
- Both served as static pages or linked from the API

**Dependencies:** None

#### Task 5: Hashed IP logging

**What:** HMAC-SHA256 of CF-Connecting-IP with daily-rotating key for
abuse detection without PII storage.

**Deliverables:**
- HMAC function using a daily key derived from a secret + date
- Hashed IP included in security log entries
- Enables correlation of requests from the same source within a day
  without storing raw IPs

**Dependencies:** None (can ship independently)

### Risks and Concerns

**Risk 1: Capture-ID-as-secret model breaks under multi-tenancy.**
Today, capture IDs are the sole access control mechanism for retrieval.
The code comment at `index.js:143` explicitly states this: "No
authentication required -- capture ID acts as the access secret." This
is fine for single-tenant, but in multi-tenant mode, a list endpoint
would enumerate all capture IDs for a tenant, and any leaked ID grants
access to anyone. The transition to per-tenant auth MUST include a
decision on whether retrieval endpoints become authenticated or whether
capture IDs remain bearer tokens. My recommendation: keep capture IDs
as bearer tokens for the public verification use case (anyone with the
link can verify), but add tenant-scoped authentication for the list
endpoint and metadata retrieval. This is a nuanced access control
design that needs explicit agreement.

**Risk 2: KV is not a database -- tenant isolation queries will get awkward.**
The current KV model stores captures under `capture:{captureId}`. There is
no way to list captures by tenant without a secondary index. When the list
endpoint ships, you will need either: (a) a per-tenant index key in KV
(e.g., `tenant:{tenantId}:captures` with a JSON array of capture IDs), or
(b) D1. The KV approach works for small scale but has consistency issues
(KV is eventually consistent, and list operations are not atomic). This is
an infrastructure decision that iac-minion should weigh in on, but the
security implication is: if the tenant index is inconsistent, a capture
could be "invisible" to its owner but accessible to anyone with the ID.

**Risk 3: Key rotation without key versioning will break verification.**
If the signing key is rotated before key versioning ships, every existing
WACZ bundle becomes unverifiable through the API (the verification endpoint
hardcodes the current public key). This is a data integrity risk. Task 3
(key versioning) MUST ship before the first key rotation.

**Risk 4: No admin authentication model.**
The backlog items assume key provisioning and revocation, but there is no
admin API or admin authentication model. Who provisions tenant keys? How?
If it is `wrangler kv:key put` directly, that works for 2 users but does
not scale. If it is an admin API endpoint, that endpoint needs its own
authentication (and it cannot use the same tenant key system, or you have a
bootstrap problem). This needs a design decision early.

**Risk 5: CORS on capture POST.**
The backlog notes that the capture POST endpoint should restrict CORS
origins. Currently, the retrieval endpoints set `Access-Control-Allow-Origin: *`,
which is correct for public verification. But the capture POST has no CORS
headers at all (which is fine -- browsers will block cross-origin POSTs by
default). If CORS is ever added to the capture endpoint, it MUST NOT be
`*`. This is a "don't break it" risk rather than a "fix it now" risk.

**Risk 6: Rate limiting shifts from IP to tenant.**
When rate limiting moves from `CF-Connecting-IP` to `tenantId`, a
compromised API key allows an attacker to exhaust the tenant's rate limit
(denial of service against the legitimate user). The per-IP limit should
be retained as a secondary control in addition to per-tenant limits.

### Additional Agents Needed

**privacy-minion (or legal-minion)** -- If such a specialist exists. The
content moderation policy, terms of service, and GDPR implications of
hashed IP logging are legal/policy decisions that benefit from specialized
review. If no such agent exists, these items should be flagged for human
review before shipping.

Otherwise, the current team (api-design-minion for API contract, iac-minion
for KV vs D1 storage decisions) is sufficient for the security aspects of
this roadmap.
