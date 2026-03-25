# Domain Plan Contribution: data-minion

## Storage Inventory (verified from source)

Before recommending retention and deletion procedures, here is the complete data map derived from wrangler.toml, migrations, db.js, kv.js, capture.js, and oauth.js:

### D1 (wrl-metadata) -- 10 tables

| Table | Tenant-scoped | Contains PII | Notes |
|-------|--------------|-------------|-------|
| `tenants` | IS tenant | No | Config JSON, Stripe customer ID, billing status, tier |
| `captures` | Yes (tenant_id FK) | Pseudonymized IP only | URL, timestamps, JSON artifacts/wacz metadata, quarantine state, change_summary |
| `api_keys` | Yes (tenant_id FK) | No | SHA-256 hashed keys, scopes, revocation state |
| `signing_keys` | No (global) | No | Ed25519 public keys, tiny table |
| `usage_counters` | Yes (tenant_id PK) | No | Monthly capture/storage/API counts, Stripe reporting state |
| `webhooks` | Yes (tenant_id FK) | Webhook URL may be sensitive | URL, secret hash, event filter |
| `github_users` | Yes (tenant_id FK) | GitHub ID + login | OAuth identity mapping, ToS acceptance |
| `sessions` | Yes (tenant_id FK) | Session hash | SHA-256 hashed cookie, expires_at (7-day TTL) |
| `schedules` | Yes (tenant_id FK) | No | Cron expression, URL, pause state, last run tracking |
| `notification_preferences` | Yes (tenant_id PK) | Email address | Notification toggles, email verification state |
| `notification_sent` | Yes (tenant_id PK) | No | Deduplication log for sent notifications |

### R2 (wrl-captures) -- object key patterns

| Key Pattern | Tenant-scoped | Content |
|-------------|--------------|---------|
| `captures/{captureId}/screenshot.png` | Via capture -> tenant_id | Screenshot image |
| `captures/{captureId}/screenshot-before.png` | Via capture -> tenant_id | Pre-consent screenshot (optional) |
| `captures/{captureId}/rendered.html` | Via capture -> tenant_id | Rendered HTML |
| `captures/{captureId}/headers.json` | Via capture -> tenant_id | HTTP response headers |
| `captures/{waczHash}.wacz` | Via capture -> tenant_id | Signed WACZ bundle (content-addressed) |

R2 objects are not directly tenant-keyed. Tenant scoping requires joining through D1 captures table to resolve which R2 keys belong to a tenant.

### KV (wrl namespace) -- key patterns

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `rl:{tenantId}:{group}:{windowId}` | period * 2 (120s or 20s) | Rate limit sliding window counters |
| `oauth_state:{state}` | 600s | OAuth CSRF state (ephemeral) |
| `first_key:{tenantId}` | 3600s | First API key display (ephemeral, one-time read) |
| `stripe_evt:{eventId}` | 604800s (7 days) | Stripe webhook idempotency dedup |

All KV keys are ephemeral with TTLs. No long-lived tenant data in KV.

### External stores

| System | Data | Retention |
|--------|------|-----------|
| Coralogix (EU2) | Pseudonymized IP hashes, tenant IDs, event metadata | 90 days (existing) |
| Stripe | Customer ID, payment methods, invoices, meter events | Stripe's retention policy |
| Browser Rendering | In-memory browser sessions | Ephemeral (session duration, seconds to minutes) |
| Queues (wrl-captures, wrl-webhooks, wrl-emails + DLQs) | Job messages | Transient (consumed or DLQ'd) |

---

## Recommendations

### 1. Retention Periods per Storage Layer

#### D1 Metadata

| Data Category | Recommended Retention | Rationale |
|---------------|----------------------|-----------|
| **Tenant record** | Until deletion request or account inactivity (12 months no captures, no login) | Core identity; needed for billing reconciliation |
| **Captures (metadata)** | Indefinite while tenant active; 30 days post-deletion request (grace period) | Archival is the product's purpose; immediate deletion defeats it. 30-day grace prevents accidental loss |
| **API keys** | Until revoked by tenant or tenant deletion | SHA-256 hashes only; low risk, needed for auth |
| **Usage counters** | Current + 12 prior billing periods | Billing dispute resolution; Stripe reconciliation |
| **Sessions** | 7 days (existing TTL via expires_at) | Already implemented; deleteExpiredSessions() exists |
| **GitHub users** | Until tenant deletion | OAuth identity mapping |
| **Schedules** | Until deleted by tenant or tenant offboarding | Active operational data |
| **Webhooks** | Until deleted by tenant or tenant offboarding | Active operational data |
| **Notification preferences** | Until tenant deletion | deleteNotificationPreferences() already exists |
| **Notification sent (dedup)** | Rolling 3 months | Dedup only needs current + previous period |

#### R2 Artifacts

| Data Category | Recommended Retention | Rationale |
|---------------|----------------------|-----------|
| **WACZ bundles** | Same as capture metadata -- indefinite while active, 30 days post-deletion request | Core product deliverable; content-addressed so dedup is free |
| **Screenshots** | Same as capture metadata | Evidence artifacts; part of the capture record |
| **Rendered HTML** | Same as capture metadata | Evidence artifacts |
| **Headers JSON** | Same as capture metadata | Evidence artifacts |
| **Quarantined captures** | 90 days, then auto-purge | Threat-flagged content should not persist indefinitely; 90 days allows investigation |

#### KV Ephemeral Data

| Data Category | Recommended Retention | Rationale |
|---------------|----------------------|-----------|
| **Rate limit counters** | Existing TTL (period * 2) | Already correct; self-expiring |
| **OAuth state** | Existing TTL (600s) | Already correct |
| **First key display** | Existing TTL (3600s) | Already correct |
| **Stripe event dedup** | Existing TTL (7 days) | Already correct |

No changes needed for KV. All keys are ephemeral with appropriate TTLs.

#### Coralogix Logs

90-day retention is appropriate for operational logs with pseudonymized IPs. This aligns with the existing privacy policy. No change recommended.

### 2. Complete Tenant Deletion Procedure

The deletion procedure must be ordered to respect foreign key constraints and cross-store references. Here is the sequence:

```
Phase 0: Pre-deletion (immediate on request)
  - Validate deletion request (authenticated tenant, confirmed via UI/email)
  - Set tenant billing_status = 'blocked' to prevent new captures
  - Pause all schedules (UPDATE schedules SET paused = 1 WHERE tenant_id = ?)
  - Record deletion_requested_at timestamp on tenant record (new column needed)
  - Begin 30-day grace period

Phase 1: Grace period (30 days)
  - Tenant can cancel deletion request during this window
  - No new captures accepted (billing_status = 'blocked')
  - Existing captures remain accessible for data export
  - Scheduled captures do not fire (paused)

Phase 2: R2 artifact deletion
  - Query all capture IDs for tenant: SELECT id, artifacts, wacz FROM captures WHERE tenant_id = ?
  - For each capture, delete all R2 objects:
    - captures/{captureId}/screenshot.png
    - captures/{captureId}/screenshot-before.png (if exists)
    - captures/{captureId}/rendered.html
    - captures/{captureId}/headers.json
    - captures/{wacz.key} (content-addressed WACZ)
  - R2 must go first because D1 captures rows contain the R2 key references
  - Process in batches (R2 delete is per-object; hundreds of captures need pagination)

Phase 3: D1 deletion (ordered for FK constraints)
  - DELETE FROM notification_sent WHERE tenant_id = ?
  - DELETE FROM notification_preferences WHERE tenant_id = ?
  - DELETE FROM sessions WHERE tenant_id = ?
  - DELETE FROM webhooks WHERE tenant_id = ?
  - DELETE FROM captures WHERE tenant_id = ?
    (schedule_id FK is nullable; captures can be deleted before schedules)
  - DELETE FROM schedules WHERE tenant_id = ?
  - DELETE FROM api_keys WHERE tenant_id = ?
  - DELETE FROM usage_counters WHERE tenant_id = ?
  - DELETE FROM github_users WHERE tenant_id = ?
  - DELETE FROM tenants WHERE id = ?
  - Use db.batch() for atomicity within D1's batch limits

Phase 4: KV cleanup
  - KV rate limit keys (rl:{tenantId}:*) self-expire within 120s
  - No explicit deletion needed, but can list-and-delete for immediate cleanup
  - oauth_state and first_key keys expire naturally
  - stripe_evt keys are not tenant-scoped (keyed by Stripe event ID); no action

Phase 5: External systems
  - Stripe: cancel subscription, delete customer (via Stripe API)
  - Coralogix: pseudonymized logs cannot be attributed post-deletion;
    document that they expire naturally within 90 days (already in privacy policy)

Phase 6: Audit
  - Log the deletion event to Coralogix with tenant ID (for compliance audit trail)
  - The log entry itself contains no PII post-deletion (tenant ID is an opaque string)
```

### 3. In-Flight Capture and Active Schedule Handling

**In-flight captures at offboarding time:**

1. When `billing_status` is set to `blocked`, the capture API rejects new requests immediately.
2. Captures already in the queue (`wrl-captures`) will continue processing. This is acceptable because:
   - Queue max_retries = 3, max_batch_timeout = 5 -- in-flight jobs resolve within minutes
   - The capture pipeline writes to R2 and D1 under the tenant ID, so Phase 2/3 deletion will catch them
3. The deletion procedure (Phase 2) should wait for the queue to drain for this tenant before starting R2 deletion. Implementation: query `SELECT COUNT(*) FROM captures WHERE tenant_id = ? AND status = 'pending'` and wait until 0, with a 15-minute timeout (covers worst-case queue backlog + browser render time).

**Active schedules:**

1. Phase 0 pauses all schedules immediately (`UPDATE schedules SET paused = 1`).
2. The cron handler (`scheduled()`) checks `paused = 0` in its query, so paused schedules are never evaluated.
3. Race condition: a schedule could fire between the deletion request and the pause. The resulting capture will be caught by the normal deletion sweep.

**DLQ messages:**

- DLQ messages for the tenant may exist in `wrl-captures-dlq` or `wrl-webhooks-dlq`.
- DLQ consumers have `max_retries = 0`, so messages are consumed once (logged) and discarded.
- No explicit DLQ purge needed; messages expire naturally.

---

## Proposed Tasks

### Task 1: Schema migration for deletion support
**Deliverable:** Migration `0017_deletion_support.sql`
- Add `deletion_requested_at TEXT` column to `tenants` table
- Add `deletion_scheduled_at TEXT` column (30 days after request)
- Add index on `deletion_scheduled_at` for the nightly cleanup cron

### Task 2: Tenant deletion admin endpoint
**Deliverable:** `DELETE /v1/admin/tenants/:tenantId` endpoint
- Admin-authenticated (ADMIN_KEY)
- Implements Phase 0 (block + pause) immediately
- Returns confirmation with grace period end date
- Separate `POST /v1/admin/tenants/:tenantId/delete-now` for immediate deletion (skips grace)

### Task 3: Tenant self-service deletion request
**Deliverable:** `POST /v1/account/delete` endpoint (session-authenticated)
- Sets `deletion_requested_at`, blocks tenant, pauses schedules
- Sends confirmation email (via EMAIL_QUEUE)
- `POST /v1/account/cancel-deletion` to reverse during grace period

### Task 4: Nightly deletion executor
**Deliverable:** Cron handler addition to the existing `scheduled()` (or new cron entry)
- Queries `SELECT id FROM tenants WHERE deletion_scheduled_at <= datetime('now')`
- Executes Phase 2-6 for each tenant
- Batch R2 deletions with pagination (list captures in pages of 100)
- Logs completion to Coralogix

### Task 5: Data retention policy document
**Deliverable:** `docs/data-retention-policy.md` + landing page at `/data-retention`
- Formal retention periods per data category (from recommendations above)
- Deletion procedure summary (non-technical, customer-facing)
- References to privacy policy for legal basis

### Task 6: Quarantined capture auto-purge
**Deliverable:** Addition to nightly cron
- Delete quarantined captures older than 90 days (R2 artifacts + D1 rows)
- Log purge counts to Coralogix

### Task 7: Usage counter pruning
**Deliverable:** Addition to nightly cron or weekly cron
- Delete `usage_counters` rows where `period < strftime('%Y-%m', 'now', '-12 months')`
- Keeps current + 12 months for billing disputes

### Task 8: Notification dedup pruning
**Deliverable:** Addition to weekly cron
- Delete `notification_sent` rows where `period < strftime('%Y-%m', 'now', '-3 months')`

---

## Risks and Concerns

### R2 deletion is not atomic with D1
R2 objects are deleted individually. If the process crashes mid-deletion, some R2 objects may be orphaned (D1 rows deleted but R2 objects remain) or D1 rows may reference deleted R2 objects. **Mitigation:** Delete R2 first, then D1. Orphaned R2 objects waste storage but do not leak data (no index to find them). Add a periodic R2 orphan scan that lists all R2 keys and checks for matching D1 captures.

### R2 has no tenant prefix in key structure
R2 keys use `captures/{captureId}/...` -- not `captures/{tenantId}/{captureId}/...`. To delete all R2 objects for a tenant, you must first query D1 for all capture IDs belonging to that tenant, then derive R2 keys from the artifacts/wacz JSON columns. This is correct but means deletion cannot use R2 prefix listing. **Concern for future:** if a tenant has thousands of captures, the D1 query + R2 delete loop could be slow. Batching and pagination are essential.

### WACZ bundles are content-addressed
WACZ objects are stored at `captures/{sha256hash}.wacz`. If two captures (even from different tenants) produce identical content, they share the same R2 key. Deleting a WACZ for one tenant's capture could orphan another tenant's reference. **Mitigation:** Before deleting a WACZ key, check if any other capture row references the same `wacz.key`. If yes, skip deletion of that R2 object. In practice, content-addressed collision across tenants is extremely unlikely for timestamped captures, but the check is cheap.

### Stripe customer data persists outside WRL
Stripe retains customer records, invoices, and payment history per Stripe's own retention policy. WRL can delete the Stripe customer via API, but Stripe may retain data for legal/financial compliance. The data retention policy should note this as a third-party processor limitation (already partially covered in privacy policy).

### Queue drain race condition
Between blocking a tenant and starting R2 deletion, in-flight queue messages may still create new captures. The 15-minute drain wait handles this, but the deletion executor must re-query captures after the drain to catch any late arrivals.

### No soft-delete mechanism exists
Current deletion is hard-delete (rows removed from D1, objects removed from R2). If a customer disputes or reverses a deletion request after the grace period, data is unrecoverable. **Mitigation:** The 30-day grace period is the safety net. Document clearly that deletion is irreversible after grace period. Consider R2 object lifecycle rules as a secondary safety net (if Cloudflare R2 supports it).

### D1 batch size limits
D1 `db.batch()` has a limit on the number of statements per batch. A tenant with thousands of captures will need paginated deletion (batches of ~50-100 DELETE statements). The deletion executor must handle this.

---

## Additional Agents Needed

- **security-minion** -- Review the deletion procedure for data leakage risks (e.g., cached responses, edge cache purge requirements, Stripe data handling). The edge cache (`ENABLE_EDGE_CACHE = "true"`) may serve cached capture responses after D1/R2 deletion; cache purge must be part of the deletion sequence.
- **api-design-minion** -- Design the self-service deletion endpoints (`/v1/account/delete`, `/v1/account/cancel-deletion`) and admin deletion endpoint to ensure they fit WRL's existing API conventions and error handling patterns.
