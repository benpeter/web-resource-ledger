# Phase 2: Margo -- YAGNI/KISS Audit of MVP Scope

## Verdict: ADVISE

PRODUCT.md describes a full-featured SaaS platform. The MVP goal is radically
smaller: "capture a URL, store it immutably, and let a third party verify the
capture." Most of PRODUCT.md is post-MVP. The danger is building a miniature
version of the full product instead of a complete version of the essential thing.

Below is a feature-by-feature audit against the MVP user story.

---

## (a) Multi-tenancy, auth, or user management

**OUT. Not required for the core value prop.**

The MVP user story is: someone submits a URL, gets back a capture with
cryptographic proof, and a third party can verify it. None of that requires
knowing *who* submitted the URL.

- **Multi-tenancy** is a scaling and billing concern. MVP has one operator (the
  developer). Tenant isolation, RBAC, per-tenant config, per-tenant quotas --
  all YAGNI. Complexity budget: this is easily 10+ points of accidental
  complexity (user model, session management, permission checks, tenant-scoped
  queries, social login integration).
- **Auth** at the API level should be at most a static API key or shared secret
  to prevent abuse. Not a user management system. A single environment variable
  holding a bearer token is sufficient. This is a rate-limiting concern, not an
  identity concern.
- **Social signup (GitHub first)** is explicitly YAGNI. Zero users exist.

**Simpler alternative:** Single static API key via environment variable. No user
model, no database table, no OAuth flow. Add auth when there is a second user
who is not the developer.

---

## (b) Web UI

**OUT. API-only is sufficient for MVP.**

The core value prop is the *verification* -- that a third party can confirm the
capture is authentic. The submission path can be a curl command or API call. The
verification path is the part that needs to be accessible, but "accessible"
means a public URL that returns proof data, not necessarily a rendered web page.

However, there is a gray area worth flagging:

- **Verification endpoint**: a bare JSON response is functional but not
  user-friendly for the "shareable proof link" use case described in PRODUCT.md.
  A minimal static HTML page that displays the verification result (capture
  metadata, hash, timestamp, pass/fail) would make the proof link meaningfully
  shareable to non-technical recipients. This is a single static HTML file, not
  a web application.
- **Capture submission UI**: definitely out. curl or any HTTP client suffices.

**Recommendation:** API-only for capture submission. For the verification
endpoint, consider a single static HTML page that renders the verification
result client-side. This is ~50 lines of vanilla HTML/JS, not a framework or
SPA. But even this can be deferred to a fast-follow -- JSON-only verification
works for MVP if the primary audience is technical.

**Decision point for the plan owner:** if "third party" includes non-technical
people (lawyers, compliance officers), a minimal verification display page moves
from nice-to-have to essential. Clarify the verification audience.

---

## (c) Scheduled captures / watch lists

**OUT. On-demand-only is sufficient for MVP.**

PRODUCT.md itself acknowledges this: "Watch lists: sets of URLs captured on a
recurring schedule -- The sticky use case -- single URL capture is table stakes."
Table stakes is exactly what an MVP delivers.

Scheduled captures require:
- A scheduler (cron, CloudWatch Events, or equivalent)
- Persistent URL lists (database or config store)
- Execution tracking (did capture N succeed? retry?)
- A concept of "ownership" of a watch list (which brings back auth)

This is an entire subsystem. Complexity budget: ~8 points minimum (scheduler
service, state management, retry logic, URL list CRUD). None of it is needed
for "capture a URL."

**Simpler alternative:** Single on-demand API endpoint. User calls it when they
want a capture. No scheduler, no state, no URL lists.

---

## (d) Change detection

**OUT. Not required for core value prop.**

Change detection requires:
- Multiple captures of the same URL over time (implies scheduled captures, which is also OUT)
- Diffing logic (HTML diff, visual diff, or both)
- A concept of "same resource" identity across captures

This is a feature that builds on top of watch lists, which are themselves out.
It has no relationship to the core value prop of "capture, store, verify."

**Simpler alternative:** Each capture is a standalone, independent artifact.
Comparing captures is a future feature that requires the foundation (multiple
captures of the same URL) to exist first.

---

## (e) Notifications

**OUT. No notification system for MVP.**

Notifications (capture success/failure, quota warnings, change alerts) require:
- An event system or message queue
- Notification channel integrations (email, webhooks)
- User preferences for notification routing
- A concept of "who to notify" (which brings back auth/users)

For an on-demand, synchronous-request MVP: the API response IS the notification.
You submit a capture, you get back a result (or a polling URL for async
completion). No separate notification channel needed.

**Simpler alternative:** API response codes and bodies communicate success/failure
directly to the caller. The caller already knows the result because they
initiated the request.

---

## (f) Database vs. filesystem/blob storage

**OUT -- no database. Blob storage is the only state store for MVP.**

This is the highest-leverage simplification in the entire audit.

What state does the MVP need to persist?

1. **Capture artifacts** (screenshot, HTML, headers, manifest) -- these are
   files/blobs by nature.
2. **Capture metadata** (URL, timestamp, content hashes, signing data) -- this
   can be a JSON file stored alongside the artifacts.
3. **Lookup by capture ID** -- the capture ID can be the content hash or a
   deterministic derivative of it, making the storage path the lookup key.

A database adds:
- Schema design and migrations
- Connection management
- An ORM or query builder dependency
- A separate service to provision and operate (or a managed service to configure)
- Backup strategy distinct from the blob store

None of this is justified when the access pattern is: write a bundle once, read
it by ID, never update it. This is exactly what blob storage (S3, R2, or even
local filesystem) does natively.

**Simpler alternative:** Each capture is a directory/prefix in blob storage:

```
captures/
  {capture-id}/
    metadata.json    # URL, timestamp, hashes, signature
    screenshot.png
    page.html
    headers.json
    manifest.json
```

Lookup is a direct path resolution: `GET /captures/{id}` maps to
`captures/{id}/metadata.json`. No index needed. No database needed.

**When to add a database:** when you need to query captures by attributes other
than ID (e.g., "all captures of example.com," "all captures in date range"), or
when you have multiple tenants. Neither applies to MVP.

**Risk to flag:** without a database, there is no listing/search capability. The
MVP user must know the capture ID to retrieve or verify. This is acceptable for
a developer-operated tool but would need addressing before the product is
user-facing. The capture ID should be returned in the API response upon
successful capture -- the caller is responsible for storing it.

---

## (g) OpenAPI spec

**OUT for MVP. Spec after the API surface stabilizes.**

The PRODUCT.md states "OpenAPI spec as the single source of truth." This is a
good eventual goal. For MVP, it is premature:

- The API surface is 3 endpoints (capture, retrieve, verify). It will be
  documented in the MVP doc and the evolution log. That is sufficient.
- OpenAPI specs ossify quickly. Writing a formal spec before the API has seen
  real usage creates maintenance drag -- every iteration requires updating the
  spec, the implementation, and any generated clients in lockstep.
- The cost of a formal spec is low for 3 endpoints but the value is also low
  when there are no external consumers yet.
- The Helix Manifesto principle "more code, less blah blah" applies here. Ship
  the API. Spec it when the surface is stable and there are consumers who need
  the spec.

**Simpler alternative:** Document the 3 endpoints (method, path, request/response
shapes, error codes) in MVP.md or a lightweight API.md. Upgrade to formal
OpenAPI when external consumers or code generation is needed.

---

## Summary Table

| Feature | Verdict | Rationale |
|---|---|---|
| Multi-tenancy / auth / users | OUT | Zero users. Static API key suffices. |
| Web UI (capture) | OUT | curl / HTTP client is sufficient. |
| Web UI (verification display) | GRAY | JSON response works; static HTML page helps non-technical verifiers. Clarify audience. |
| Scheduled captures / watch lists | OUT | On-demand is table stakes; scheduling is an entire subsystem. |
| Change detection | OUT | Depends on scheduled captures (also OUT). No relation to core value prop. |
| Notifications | OUT | API response is the notification for on-demand captures. |
| Database | OUT | Write-once, read-by-ID access pattern. Blob storage is sufficient. |
| OpenAPI spec | OUT | 3 endpoints. Document in markdown. Spec when stable. |

---

## What IS in scope (the essential complexity)

Stripping away everything above, the MVP is:

1. **Capture endpoint**: accept a URL, render it in a headless browser, bundle
   the artifacts (screenshot, HTML, headers), hash the content, sign it with a
   timestamp, store the bundle in blob storage, return the capture ID.

2. **Retrieve endpoint**: given a capture ID, return the capture bundle
   (metadata + artifacts).

3. **Verify endpoint**: given a capture ID, independently recompute the content
   hash from the stored artifacts and compare against the signed hash. Return
   pass/fail with the proof chain. This endpoint is public, no auth.

4. **Signing/hashing**: the cryptographic integrity mechanism. This IS essential
   complexity -- it is the core value prop. The signing approach should be
   simple (content hash + timestamp + server-side key) but upgradeable to
   RFC 3161 TSA or similar later. Defer to gru and security-minion for the
   specific mechanism.

5. **Blob storage**: write-once storage for capture bundles. Immutability is
   the product requirement, not a nice-to-have.

That is the entire MVP. Five concerns, three endpoints, no database, no users,
no scheduler, no UI beyond possibly a static verification page.

---

## Hidden Complexity and Scope Creep Risks

1. **Headless browser is the complexity iceberg.** Playwright/Puppeteer is the
   single largest dependency and operational burden. It requires a full
   Chromium binary, significant memory, cold-start time, and creates a major
   attack surface (SSRF, sandbox escape). This is essential complexity -- you
   cannot capture rendered pages without it -- but it dominates the
   infrastructure story. Do not let the simplicity of "3 endpoints" obscure
   the operational weight of running headless Chrome.

2. **"Bundle format" can become a rabbit hole.** WARC is a proper archival
   standard but complex to implement and verify. For MVP, a directory of files
   with a metadata.json is a bundle. Do not over-invest in format before
   understanding real usage patterns. The format should be simple enough to
   verify with standard tools (sha256sum, jq).

3. **Signing approach creep.** The temptation will be to implement "proper"
   cryptographic timestamping (RFC 3161, blockchain anchoring) in MVP because
   "that's the value prop." It is not. The value prop is *verifiable integrity*
   -- proof that content has not been tampered with since capture. A content
   hash signed with a server key, stored alongside the artifacts, achieves this
   for MVP. Legal admissibility (which requires trusted third-party
   timestamping) is a future enhancement, not an MVP requirement.

4. **Async capture processing.** Page rendering takes 5-30 seconds. The capture
   endpoint should probably be async (return an ID immediately, poll for
   completion). This is legitimate essential complexity, but resist the urge to
   build a proper job queue. For MVP with a single operator: in-memory state or
   a simple status file in blob storage is sufficient. No Redis, no SQS, no
   Bull/BullMQ.

5. **"While we're at it" testing infrastructure.** Testing is important, but
   for MVP, resist building elaborate test harnesses, fixture generation
   systems, or CI pipelines. A few integration tests that capture a known URL
   and verify the result. Keep the test infrastructure proportional to the
   application complexity.

---

## Complexity Budget Tally (MVP as described)

Using managed/serverless column (appropriate per CLAUDE.local.md preferences for
Cloudflare/Fastly):

| Item | Cost | Justification |
|---|---|---|
| Headless browser runtime (container or managed service) | 5 | Essential. Cannot capture pages without it. Container likely required (headless Chrome exceeds serverless limits). |
| Blob storage (R2/S3) | 2 | Essential. Managed service, minimal config. |
| Signing mechanism | 3 | Essential complexity -- core value prop. Abstraction layer for future TSA upgrade. |
| HTTP API service | 2 | Essential. The product surface. |
| **Total** | **12** | Proportional to the problem. |

For comparison, including the OUT items would add roughly:
- Database: +5
- Auth/multi-tenancy: +10
- Scheduler: +5
- Notifications: +3
- Web UI: +5
- Change detection: +5
- OpenAPI spec tooling: +2

Total with everything: ~47 points. The stripped MVP is 12. That is a 4x
complexity reduction for the same core value prop. This is why YAGNI matters.
