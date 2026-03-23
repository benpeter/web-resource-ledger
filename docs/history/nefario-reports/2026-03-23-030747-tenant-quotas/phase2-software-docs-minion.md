## Domain Plan Contribution: software-docs-minion

### Recommendations

#### (a) OpenAPI schema strategy: referenced components, not inline

The existing `openapi.yaml` already follows a consistent pattern: all error responses are defined as `$ref` components (`Problem400`, `Problem401`, `Problem429`, `Problem503`), and reusable data shapes are defined under `components/schemas` (`ProblemDetail`, `UsageResponse`, etc.). The quota feature must extend this pattern, not break it.

**Specific recommendation:**

1. **Do NOT replace `Problem429` wholesale.** The existing `Problem429` response component describes rate limiting. Quota exhaustion is a semantically different 429 (monthly limit vs. per-minute limit). The spec should distinguish them by adding a **new `Problem429Quota` response component** alongside the existing `Problem429`. The two responses share the same HTTP status code but differ in:
   - The `detail` message (quota-specific: "Monthly capture limit reached")
   - Additional extension fields (`limit`, `used`, `resetsAt`) per the success criteria
   - The `Retry-After` semantics (rate limit: seconds; quota: potentially days until month reset)

   The `POST /v1/captures` and `POST /v1/captures/batch` endpoints should list both `Problem429` (rate limit) and `Problem429Quota` (quota exceeded) as possible 429 responses using `oneOf` in the response schema, or (more pragmatically, since OpenAPI 3.1 doesn't natively support multiple descriptions for the same status code) combine them under the existing `429` response with a description that covers both cases and examples for each.

   **Pragmatic approach (recommended):** Extend the existing `Problem429` response to cover both cases. Add a second example (`quotaExceeded`) alongside the existing `rateLimited` example. Extend the `ProblemDetail` schema documentation to note that quota responses include additional fields. The `extra` spread parameter in `problemResponse()` already supports arbitrary additional fields -- the spec should document this extension pattern.

2. **Create new referenced schemas for quota-specific types:**
   - `QuotaStatus` schema (used in `GET /v1/account/usage` response and potentially in the extended `Problem429` response) with fields like `limit`, `used`, `remaining`, `resetsAt`.
   - `TenantQuotaConfig` schema (used in admin tenant config endpoints) with fields for tier, per-metric limits, and override flags.

3. **New endpoint `GET /v1/account/usage`** should follow the existing `account.js` pattern (session-gated, `Cache-Control: private, no-store`). Schema should be a referenced `components/schemas/AccountUsageResponse` -- similar to the existing `UsageResponse` but augmented with quota limits and remaining counts. This is tenant-facing, distinct from the admin `GET /v1/admin/usage` which exists today.

4. **Admin endpoint additions:** If `PUT /v1/admin/tenants/:id/config` is being added (or an existing admin endpoint gains quota override fields), the request/response schema should reference a `TenantConfig` component that includes `tier`, `quotaOverrides`, and any other tenant-level configuration. This keeps the admin API spec DRY if the same shape appears in GET and PUT.

#### (b) Docs site: update existing content, add one new guide

There is currently **no dedicated rate limits guide** on the docs site. Rate limit information is scattered:
- `batch.md` mentions per-URL rate limit tokens and 429 handling
- `index.md` references the API Reference for rate limits
- `openapi.yaml` documents rate limits per-endpoint inline
- `README.md` mentions "10 per minute per IP" and "60 per minute per IP"

**Recommendation:** Create a single **"Limits & Quotas"** guide on the docs site that covers both concepts in one place. Separating them into two guides would fragment information that developers need to understand together (both can produce 429 responses, both affect capture submission). The guide should:

1. **Distinguish the two systems clearly** with a comparison table:
   - Rate limits: per-minute, per-IP, enforced by KV counters, `Retry-After` in seconds, affects all endpoints
   - Quotas: per-month, per-tenant, enforced by D1 usage counters, resets at month boundary, affects capture endpoints only
2. **Document the 429 response disambiguation** -- how clients tell whether a 429 is rate-limit or quota (the `detail` field, plus the presence/absence of `limit`/`used` extension fields)
3. **Document the `GET /v1/account/usage` endpoint** for self-serve usage checking
4. **Cross-reference** from the existing `batch.md` rate limits section and `authentication.md` (where scopes are listed)

**Do NOT create a standalone "API Rate Limits" guide** -- it would immediately need to reference quotas, and vice versa. One guide covering both is cleaner and avoids single-source-of-truth violations.

#### (c) Architecture documentation: yes, document the quota check as a pipeline stage

The capture request flow currently has these implicit stages: rate limit check -> auth check -> URL validation -> queue enqueue -> (async) browser launch -> capture -> store. Inserting a quota check between auth and queue enqueue is architecturally significant because:

1. It introduces a **new failure mode before expensive work** (the whole point of the feature)
2. It creates a **dependency on D1 in the synchronous request path** (previously D1 was only hit for auth and completion)
3. It has **different consistency semantics** from rate limiting (eventual consistency, slight overages acceptable)

**Recommendation:** Add a Mermaid sequence diagram to the evolution log (`docs/evolution/0056-tenant-quotas/decisions.md`) showing the capture request pipeline stages with the quota check inserted. This does NOT warrant a standalone architecture document -- it fits naturally in the evolution log decisions file. If a higher-level architecture diagram exists (I did not find one), the quota check should be annotated there too.

The pipeline stage ordering should be explicitly documented as:

```
Rate Limit (KV, per-IP) -> Auth (D1 key lookup) -> Quota Check (D1 usage counters) -> URL Validation -> Queue Enqueue
```

This ordering matters: rate limiting is cheapest (KV read), then auth (D1 read), then quota (D1 read), then validation (CPU), then enqueue (Queue write). Document why quota check sits after auth: you need the tenantId from auth to look up quota.

#### (d) Admin API documentation for quota overrides

Yes, there are documentation implications. The admin tenant config endpoint needs:

1. **OpenAPI spec additions:** The `PUT /v1/admin/tenants/:id/config` endpoint (if new) or the extended response for existing admin endpoints needs a schema showing:
   - `tier` field (enum: `free`, `pro`, or whatever tiers are defined)
   - `quotaOverrides` object (optional per-metric overrides that supersede tier defaults)
   - Clear documentation that overrides take precedence over tier defaults

2. **Admin docs in `authentication.md`:** The "Managing API Keys (Operators)" section should mention that quota overrides are managed per-tenant through the admin API. A sentence and a link to the API Reference is sufficient -- no need for a full walkthrough.

3. **README.md:** Does NOT need updates for quota overrides specifically. The README already links to OPERATIONS.md and the docs site for operator workflows. Adding quota configuration to the README would bloat it beyond its purpose.

4. **OPERATIONS.md:** Should get a brief section on quota override management as part of tenant onboarding, since the existing onboarding flow in CLAUDE.md already covers creating tenant keys and 1Password items.

### Proposed Tasks

#### Task 1: Extend OpenAPI spec with quota-related schemas and responses
**What:** Update `openapi.yaml` with:
- Extended `Problem429` response adding `quotaExceeded` example with `limit`, `used`, `resetsAt` extension fields
- New `AccountUsageResponse` schema under `components/schemas`
- New `GET /v1/account/usage` endpoint definition (session-gated, under a new `account` tag)
- New `TenantConfig` / `TenantQuotaConfig` schemas for admin endpoints
- Updated `POST /v1/captures` and `POST /v1/captures/batch` descriptions noting quota enforcement
- New `PUT /v1/admin/tenants/:id/config` endpoint definition (if this is a new endpoint)

**Deliverables:** Updated `openapi.yaml` with all quota-related additions
**Dependencies:** Requires finalized API design from api-design-minion (endpoint paths, field names, tier definitions). Must happen AFTER API design decisions but BEFORE implementation.

#### Task 2: Create "Limits & Quotas" docs site guide
**What:** Create `site/content/limits.md` covering:
- Rate limits vs. quotas comparison table
- 429 response disambiguation (how to tell which kind)
- Quota tiers and default limits
- `GET /v1/account/usage` endpoint usage examples
- Handling quota exceeded errors (client retry strategy: wait until month resets, or request tier upgrade)
- Cross-references to batch.md and authentication.md

**Deliverables:** New `site/content/limits.md`, updated navigation/index to include it, updated cross-references in `batch.md`
**Dependencies:** Finalized quota tiers and limits. Depends on Task 1 (spec must be settled first).

#### Task 3: Update docs site navigation and cross-references
**What:**
- Add "Limits & Quotas" to the docs site navigation (in `site/content/index.md` guides list)
- Update `batch.md` rate limits section to cross-reference the new guide
- Update `authentication.md` endpoint scope table to include `GET /v1/account/usage`
- Update `api-reference.njk` tag list if a new `account` tag is added to the spec

**Deliverables:** Updated `index.md`, `batch.md`, `authentication.md`
**Dependencies:** Task 2 completed.

#### Task 4: Document quota check pipeline in evolution log
**What:** Include a Mermaid sequence diagram in `docs/evolution/0056-tenant-quotas/decisions.md` showing:
- The capture request pipeline stages with quota check inserted
- The ordering rationale (cheapest checks first)
- The eventual consistency trade-off (best-effort enforcement, slight overages accepted)

**Deliverables:** Content in `decisions.md` (created as part of the standard evolution log workflow)
**Dependencies:** None -- this is part of the standard evolution log requirement and should be written during the implementation phase.

#### Task 5: Update OPERATIONS.md with quota override management
**What:** Add a section to OPERATIONS.md covering:
- How to check a tenant's current quota/tier (admin usage endpoint)
- How to override default quotas for a specific tenant (admin config endpoint)
- How to change a tenant's tier

**Deliverables:** Updated `OPERATIONS.md`
**Dependencies:** Task 1 (needs finalized admin API shape).

#### Task 6: Update README.md rate limit mention
**What:** The README currently says "Captures are rate-limited to 10 per minute per IP." This needs a brief addition noting that captures are also subject to monthly quotas based on tenant tier. One sentence, linking to the docs site for details. Do not expand the README significantly.

**Deliverables:** Updated `README.md` (one sentence addition)
**Dependencies:** Task 2 (so the link target exists).

### Risks and Concerns

1. **429 ambiguity is the biggest documentation risk.** Both rate limiting and quota exhaustion return HTTP 429. If the response bodies are not clearly distinguishable, clients cannot programmatically differentiate between "wait 60 seconds and retry" (rate limit) and "you're done for the month" (quota). The OpenAPI spec MUST document the distinguishing fields. The `problemResponse()` `extra` parameter supports this, but the spec must formalize which extension fields appear in which case. Recommend the api-design-minion specifies a `reason` field (e.g., `"rate_limit"` vs `"quota_exceeded"`) or a `type` URI that differs from `about:blank` for quota responses.

2. **Docs site is generated from the OpenAPI spec.** The API Reference page (`api-reference.njk`) auto-renders from `openapi.yaml`. Any schema additions must be valid OpenAPI 3.1 or the docs site build will break. The CI pipeline should catch this, but it's worth noting as a dependency.

3. **Two usage endpoints with different audiences.** The existing `GET /v1/admin/usage` (admin-only) and the proposed `GET /v1/account/usage` (tenant self-serve) show similar data but with different authorization and potentially different response shapes (tenant sees their own quotas and usage; admin sees raw counters). The documentation must be clear about which is which and avoid confusion. Naming them differently helps (`admin/usage` vs `account/usage` follows the existing `admin/keys` vs `account/keys` pattern).

4. **Tier definitions need to be documented somewhere authoritative.** The prompt mentions "free" and "pro" tiers with specific limits. These defaults need a single source of truth -- either in the OpenAPI spec as enum documentation, in a constants file in the codebase, or in the docs site guide. If they're only in code, the docs will drift. Recommend defining tier defaults in the OpenAPI spec description AND in the "Limits & Quotas" guide, with the code being the actual enforcement point.

5. **Web UI usage dashboard documentation.** The success criteria mention "Web UI usage dashboard shows current period usage vs. quota with a progress bar per metric." This is a UI feature, not an API documentation feature. I flag it but do NOT own it -- the frontend implementation is separate from the API documentation. However, the `GET /v1/account/usage` endpoint that feeds this dashboard IS in my scope.

### Additional Agents Needed

**None for the documentation tasks specifically.** However, the documentation work has a hard dependency on the api-design-minion finalizing:
- The exact endpoint paths (`GET /v1/account/usage` vs alternatives)
- The response schema shape (especially the 429 disambiguation strategy)
- The tenant config admin endpoint path and schema
- The tier names and default limits

The api-design-minion's output is the input to all documentation tasks. If api-design-minion has not yet been consulted for this feature, it is a blocker for Tasks 1-3 and 5-6.
