# Sites & Self-Archiving Design

## Context

WRL captures web pages with cryptographic timestamps for evidentiary purposes.
Today, captures are flat — keyed by tenant and capture ID, with no grouping
above individual URLs. This design introduces a "site" concept that enables
brand owners to archive their own websites' state, replacing CMS version
history (e.g., AEM 10-year retention) with externally timestamped, legally
admissible evidence.

### Why This Matters

CMS version history is a poor compliance solution:
- Internal records, editable by admins, no independent timestamp authority
- Captures author state, not visitor state (CDN, personalization, A/B tests
  mean the published page can differ from the stored version)
- Bloats the repository (segment store growth, slow compaction, expensive backups)
- Doesn't survive platform migrations

WRL flips this: external capture of what the visitor actually saw, eIDAS
qualified timestamp, zero CMS bloat, platform-agnostic.

Target audiences: pharma (regulatory claims), finance (disclosures, pricing),
legal/IP (prior art, publication dates), e-commerce (promotional terms).

## Design

### 1. The Site Concept

Sites are **virtual** — a grouping lens over captures sharing a domain, not a
stored entity that captures point to. There is no `site_id` foreign key on
captures. Site membership is derived from the capture's URL at query time.

- Sites always exist as an implicit grouping of captures by domain
- Tenants can optionally create a **site config** for a domain
- No config = tenant-level defaults apply (which fall back to system defaults)
- Config is forward-looking — applies to future captures, not retroactively
- No site entity is created implicitly on first capture

### 2. Data Model Changes

#### `captures` table — new column

Add `domain TEXT NOT NULL` — extracted from `url` via `new URL(url).hostname`
at capture creation time.

- Backfill existing rows in the D1 migration itself:
  `UPDATE captures SET domain = substr(url, instr(url, '://') + 3, instr(substr(url, instr(url, '://') + 3), '/') - 1)`
  (or a more robust extraction — the migration must handle all existing URL formats)
- New index: `idx_captures_domain (tenant_id, domain, created_at DESC)`
- The capture write path extracts hostname and stores it; no other changes

#### New table — `site_configs`

```sql
CREATE TABLE site_configs (
  tenant_id  TEXT NOT NULL REFERENCES tenants(id),
  domain     TEXT NOT NULL,
  config     TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, domain)
);
```

`config` JSON holds:

```json
{
  "retention_years": 10,
  "label": "Brand.com Production"
}
```

Minimal to start. More fields as future features land.

#### What does NOT change

- No `site_id` foreign key on captures
- Schedules are unaffected — their captures get the `domain` column naturally
- No new storage bindings (KV, R2)

### 3. Config Resolution

Configuration cascades at read time:

```
system defaults → tenant config → site config
```

**System defaults** (hardcoded):

```json
{
  "retention_years": null
}
```

`null` means "keep forever" — current behavior.

**Resolution logic:**
1. Read `tenants.config` JSON for the tenant
2. If a `site_configs` row exists for `(tenant_id, domain)`, shallow-merge
   it on top (site keys override tenant keys, unset keys fall through)

This is a read-time concern only. The capture write path does not resolve
config — it just stores the capture. Config resolution happens when:
- Displaying capture details (to show retention guarantee)
- Listing sites (to show configured vs unconfigured)
- Future: purge jobs check retention before deleting

**No config caching.** The `site_configs` table is small (tenants × domains)
and read infrequently. Direct query per request is fine. Easy to add caching
later if needed.

### 4. API Endpoints

All endpoints are tenant-scoped (same API key / session auth as existing
endpoints).

#### Site browsing (read-only)

- `GET /v1/sites` — list all domains with captures for this tenant. Returns
  domain, capture count, last capture date, and whether explicit config exists.
  Derived from `GROUP BY domain` on the indexed `captures` table, joined with
  `site_configs`.

- `GET /v1/sites/{domain}` — URL path tree for a domain. `{domain}` is the
  full hostname (e.g., `brand.com`) — dots are valid in this path segment
  since `/v1/sites/` is a fixed prefix. Queries all distinct URLs for
  `(tenant_id, domain)`, returns a flat list with per-URL metadata (last
  capture date, capture count). Tree structure is built client-side.

- `GET /v1/sites/{domain}/urls/{path}` — capture history for a specific URL.
  Equivalent to a filtered captures list but with a clean entry point from
  the tree.

#### Site config (CRUD)

- `GET /v1/sites/{domain}/config` — resolved config (system → tenant → site
  merged), plus flag indicating whether explicit site config exists.

- `PUT /v1/sites/{domain}/config` — create or update site config. Upserts
  into `site_configs`.

- `DELETE /v1/sites/{domain}/config` — remove explicit site config. Domain
  falls back to tenant defaults.

### 5. Site Tree UI

New view module: `ui-sites.js` in the existing vanilla JS dashboard.

**Navigation flow:**
1. **Sites list** — table of domains: domain name, capture count, last capture
   date, config status. Click a domain to enter the tree.
2. **Site tree** — expandable tree for a single domain. Each node shows path
   segment name, last capture date, capture count. Clickable to enter capture
   history.
3. **Capture history** — filtered capture list for that URL, ordered by date
   descending. Reuses existing capture list/detail components.

**Tree construction:** Client-side JS from the flat list returned by
`GET /v1/sites/{domain}`. The API returns flat URL data; the UI builds the
tree. No tree serialization on the backend.

**Function naming:** All functions and module-level variables prefixed with
`sites_` to avoid flat-scope collisions (per CLAUDE.md dashboard rules).

**No new dependencies.** Tree is nested `<ul>` elements with expand/collapse
via CSS + vanilla JS.

### 6. Privacy Model

**No public listing or enumeration.** There is no endpoint that lists captures
or sites without tenant authentication. The capture ID (128 bits of entropy)
functions as a capability token — verification via `GET /v1/verify/{cap_id}`
works without auth, but discovery requires knowing the ID.

This is sufficient for the self-archiving use case. Brand owners don't need
artifact-level access control; they need assurance that their captures aren't
browsable by the public. The current model already provides this.

### 7. Performance Considerations

The site tree query groups captures by URL within a `(tenant_id, domain)` range:

```sql
SELECT url, COUNT(*) as count, MAX(created_at) as last_capture
FROM captures
WHERE tenant_id = ? AND domain = ?
GROUP BY url
```

With the `idx_captures_domain` index, this is an index range scan. For the
self-archiving use case, a large brand site might have a few thousand pages
captured weekly — perhaps 50-200k rows per domain per tenant after a year.
SQLite handles this GROUP BY efficiently within the indexed range.

Intermediate tree node counts ("/products/ has 5,000 captures total") are
computed client-side from the flat grouped result. The API returns ~thousands
of rows (one per distinct URL); JS sums up the tree. Trivial.

If a tenant reaches millions of captures per domain, adding a `path` column
or materialized counts is a straightforward optimization. Not needed now.

## Deferred / Future Work

### Path-level config overrides

Site config applies at the domain level. A future increment could nest
path-prefix configs under a site config (e.g., `brand.com/legal/*` gets
20-year retention). Resolution: most-specific-path wins. Deferred because
domain-level is sufficient for the initial use case.

### Artifact-level access control

We considered requiring auth for artifact access (screenshots, HTML, WACZ)
while keeping verification public. Rejected because: (1) capture ID entropy
prevents discovery, (2) splitting "verify but not view" undermines proof
value, (3) shareable keys add access management complexity that fights the
simplicity of "here's a URL, see the proof." Revisit if a customer asks.

### Purge / deletion mechanism

Captures are currently immutable and kept forever. A future purge feature
must respect site-level `retention_years` — a capture cannot be deleted
before its retention guarantee expires. This design lays the groundwork by
making retention a site config property. Purge would add a cron job scanning
for captures past their guarantee period where the tenant has opted in.

### Capture reference field

A `reference` field on captures — opaque string set by the caller at capture
time, stored but not interpreted by WRL. Useful for correlating captures back
to source systems (CMS page ID, deployment SHA, ticket number, audit ID).

Implementation: nullable TEXT column on `captures`, accepted in
`POST /v1/captures` and `POST /v1/captures/batch`, returned in all
tenant-authenticated responses. **Must be omitted from the public
`GET /v1/verify/{cap_id}` endpoint** to avoid unnecessary disclosure of
internal identifiers.

Orthogonal to the sites design — does not depend on it, should not be gated
by it.

### Retention as pricing dimension

Longer retention guarantees could map to paid tiers. The `retention_years`
field in site config is the hook — Stripe plan determines allowed values.
Contractual/pricing concern, not technical.
