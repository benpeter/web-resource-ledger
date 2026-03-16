# Margo -- Complexity Review: R8 Auth Identity + R1 List Captures (Code)

## Verdict: APPROVE

The implementation is proportional to the problem. Both R8 (auth identity
enrichment) and R1 (list captures endpoint) are justified backlog items
with concrete need (eliminate the lost-ID problem, lay groundwork for
tenant isolation). The code is lean, flat, dependency-free (zero new deps),
and avoids the premature abstractions I typically flag.

The plan-phase recommendation to simplify the status filter was adopted:
the implementation uses a single-pass `limit * 3` over-fetch with no
iteration loop, exactly as I advised. Good.

Three advisory-grade observations follow. None warrant blocking.

---

## Findings

### 1. ADVISE: Duplicated `TENANT_ID_RE` regex across `auth.js` and `kv.js`

**Files**: `src/auth.js:20`, `src/kv.js:29`

The same `/^[a-z0-9_-]{1,64}$/` regex is defined independently in two
modules. The `kv.js` comment says "mirrors the contract in auth.js" --
which means a future editor could update one without the other.

**Why accidental**: Two sources of truth for one invariant. Not complex
today, but divergence is a latent defect.

**Simpler alternative**: Export `TENANT_ID_RE` from `auth.js` and import
it in `kv.js`. Or, since `tenantPrefix()` already validates, remove the
regex from `kv.js` and rely on the auth layer guarantee. The
defense-in-depth argument is reasonable -- I am noting the duplication,
not demanding removal.

**When to act**: R12 (per-tenant keys) is the natural trigger to
consolidate this, since tenantId will no longer be hardcoded.

**Severity**: Low.

---

### 2. ADVISE: Status filter under-fill is acceptable but undocumented in the API

**File**: `src/kv.js:193-195`

```js
const fetchLimit = status ? limit * 3 : limit;
```

The single-pass over-fetch is a sound KISS tradeoff. However, when a
tenant has captures spread across statuses, a `?status=pending&limit=20`
request may return fewer than 20 results while `hasMore` is `false` (the
over-fetch window did not contain enough matching captures, and KV
reported `list_complete: true` within its view). This under-fill is
standard for cursor-based pagination over filtered views, but neither the
OpenAPI spec nor response body signals this explicitly.

**Why notable**: Clients that assume "hasMore: false means all matching
captures have been returned" will be correct in most cases but technically
wrong if the 3x window exhausts while matches exist beyond it in later KV
pages. In practice, this can only occur if KV itself paginates below the
3x threshold AND the matching density is <33%, which is unlikely at
current scale.

**Simpler alternative (if ever needed)**: Add a sentence to the OpenAPI
`status` parameter description: "Filtered results may return fewer than
`limit` items per page." No code change needed.

**When to revisit**: If Coralogix `list.success` events show
`resultCount` consistently below the requested limit when status filter
is active.

**Severity**: Low. Cosmetic documentation gap.

---

### 3. ADVISE: `note` field on 202 is marked `required` in the OpenAPI schema

**Files**: `src/index.js:141`, `openapi.yaml:86`

The `CaptureAccepted` schema has `required: [id, statusUrl, note]`. The
`note` field is a static string pointing users to the new list endpoint:

```js
note: 'Use GET /v1/captures to list and search your captures.',
```

Making `note` required means removing or conditionalizing it later is a
breaking API change. An optional field is more future-proof.

**Why accidental**: The note is UX sugar, not a semantic contract. Required
fields should be load-bearing data that clients depend on for correctness.

**Simpler alternative**: Change `required: [id, statusUrl]` in the OpenAPI
spec. Leave the code as-is (the field will still be present in every
response). Clients that use it will still get it; clients that ignore it
will not break if it changes.

**Severity**: Negligible. The API has no external consumers yet. Easy to
fix before any public commitment.

---

## Complexity Budget Tally

| Item | Column | Cost |
|------|--------|------|
| New technology | -- | 0 |
| New service | -- | 0 |
| New abstraction layer | -- | 0 |
| New dependency | -- | 0 |
| **Total** | | **0** |

Zero complexity budget spend. The changes add no new technologies,
services, abstraction layers, or dependencies.

### Code footprint

- 1 new route handler in `index.js` (~90 lines: param validation, auth,
  rate limiting, KV call, response projection, logging)
- 1 new KV function `listCaptures()` (58 lines)
- Secondary index writes in existing `createCapture`, `completeCapture`,
  `failCapture` (~15 lines each, non-fatal try/catch)
- 1 exported helper `tenantPrefix()` (6 lines)
- `tenantId` enrichment in `auth.js` (8 lines)
- 3 new OpenAPI schemas (CaptureSummary, Pagination, CaptureListResponse)
- 2 new test files (~720 lines for ~170 lines of new production code)

Test-to-code ratio (~4:1) is appropriate for a paginated list endpoint
with cursor encoding, status filtering, tenant isolation, and security
boundaries (ip/artifact exclusion).

## What I Looked For and Did Not Find

- **No premature optimization**: no caching, no indexing beyond the KV
  secondary key, no batch pre-fetching.
- **No unnecessary abstraction**: `listCaptures` is a function, not a
  class, not a repository pattern, not behind an interface. Called
  directly from the route handler.
- **No dependency bloat**: zero new entries in `package.json`.
- **No scope creep**: delivers exactly R8 + R1 as specified in the
  backlog. The `note` field is the only minor addition, justified by
  discoverability.
- **No over-engineering in cursor design**: base64url-wrapped JSON
  containing the native KV cursor. The JSON envelope (`{ kv: ... }`)
  allows cursor format evolution without breaking clients -- a
  reasonable forward-compatible choice, not YAGNI, since the alternative
  (raw KV cursor) would make any cursor change a breaking change.
- **No SOLID over-application**: no interfaces, no dependency injection
  framework, no class hierarchies. Just functions calling functions.
- **Plan-phase advice adopted**: the status filter iteration loop I
  flagged was replaced with the single-pass approach I recommended.
