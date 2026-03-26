---
layout: layouts/doc.njk
title: Data Retention and Deletion
description: WRL data retention periods — how long capture data, ephemeral data, and account data are retained, and how to request deletion under GDPR.
---

# Data Retention and Deletion

> **Summary:** WRL retains capture data indefinitely while your account is active -- that is the product's purpose. Ephemeral data (sessions, rate limit counters) expires automatically within minutes to days. When you close your account, a 30-day grace period lets you export your data before everything is permanently deleted. **Deletion is currently operator-initiated via a support request. Automated self-service deletion is planned.** See the [Privacy Policy](https://webresourceledger.com/privacy) for the full data retention table and your GDPR rights.

---

## What data WRL stores and for how long

| Data category | Where it lives | Retention |
|---|---|---|
| Tenant account record | D1 database | Until deletion request, plus 30-day grace period |
| Capture metadata (URLs, timestamps, status) | D1 database | Indefinite while active; purged 30 days after account deletion |
| Capture artifacts (screenshot, HTML, headers, WACZ) | R2 object storage (wrl-captures) | Same as capture metadata |
| API key hashes | D1 database | Until individually revoked or account deletion |
| Usage counters | D1 database | Current billing period plus 12 prior periods |
| Sessions | D1 database | 7 days (auto-expired via `expires_at`) |
| GitHub identity | D1 database | Until account deletion |
| Capture schedules | D1 database | Until deleted by tenant or account deletion |
| Webhooks | D1 database | Until deleted by tenant or account deletion |
| Notification preferences and email address | D1 database | Until account deletion |
| Quarantined captures | R2 + D1 database | 90 days from quarantine date, then purged automatically |
| Rate limit counters | KV store | 60 -- 120 seconds (auto-expire) |
| OAuth state tokens | KV store | 600 seconds (auto-expire) |
| Operational logs | Coralogix (EU2 region) | 90 days; pseudonymized -- no raw IP addresses or personal identifiers |

### Notes on specific categories

**Capture data is kept indefinitely by design.** WRL exists to create tamper-evident archival records. Deleting captures on a schedule would undermine that purpose. If you need to remove specific captures before account closure, contact support.

**Quarantined captures are different.** When a capture is flagged by threat detection, its artifacts are quarantined rather than served normally. Quarantined content is automatically purged after 90 days regardless of account status.

**Usage counters go back 12 billing periods** (approximately one year) so that billing disputes can be resolved with accurate historical data.

**Logs contain no raw personal data.** IP addresses are pseudonymized using HMAC-SHA-256 with a daily rotating key before they reach Coralogix. The pseudonym cannot be reversed and changes every 24 hours. After your account is deleted, log entries cannot be attributed to you.

---

## How account deletion works

Deletion is a two-phase process with a 30-day window for you to export your data.

### Phase 1: Immediate actions (day 0)

When you request deletion:

1. Your account is immediately blocked. No new captures can be submitted and all scheduled captures are paused.
2. Existing capture data remains readable. You can still access your capture history and download artifacts during the grace period.
3. You receive a confirmation with the exact date your data will be permanently deleted.

### Phase 2: Permanent deletion (day 30)

After the 30-day grace period ends:

1. All capture artifacts are deleted from R2 object storage.
2. All capture metadata records are removed from the database.
3. All sessions and API keys are invalidated.
4. Your tenant record, GitHub identity, usage counters, schedules, webhooks, and notification preferences are permanently removed.
5. Your Stripe subscription is cancelled. Any unused prepaid captures are non-refundable after the grace period ends -- see the [Refund Policy](https://webresourceledger.com/refund-policy).
6. Coralogix operational logs expire naturally within 90 days. Because they are pseudonymized, they cannot be attributed to your account after deletion.

**Deletion is irreversible once the grace period ends.** There is no recovery path after day 30.

### How to request deletion

Email [bp@ben-peter.com](mailto:bp@ben-peter.com) with the subject line "Account Deletion Request". Include your GitHub username so we can locate your account. You will receive confirmation within 2 business days.

> **Note:** Automated self-service deletion from the dashboard is planned. Until it is available, deletion requires a support request as described above.

---

## Cancelling a deletion request

You can cancel a deletion request at any time during the 30-day grace period by emailing [bp@ben-peter.com](mailto:bp@ben-peter.com). After the grace period ends, cancellation is not possible.

---

## Exporting your data before deletion

During the grace period you retain full read access to your account. Use the API or the web UI to download capture artifacts before the deletion date.

To export all captures programmatically:

```bash
# List all your captures
curl https://api.webresourceledger.com/v1/captures \
  -H "Authorization: Bearer YOUR_API_KEY"

# Download a specific artifact (no auth required for public captures)
curl https://api.webresourceledger.com/v1/captures/{id}/artifacts/screenshot.png \
  -o screenshot.png
```

Capture records and artifact URLs are in the response from `GET /v1/captures`. See the [API Reference](https://docs.webresourceledger.com/api-reference/) for full details.

---

<details>
<summary>Implementation details for infosec reviewers</summary>

**Deletion ordering.** The D1 schema uses foreign key constraints. Deletion proceeds in dependency order to avoid FK violations: `captures` and `api_keys` reference `tenants`, so child records are removed before the tenant row. Sessions reference `github_users`; `github_users` are deleted after sessions.

**R2 artifact resolution.** Artifact objects in R2 are keyed by capture ID (e.g., `{tenantId}/{captureId}/screenshot.png`). The deletion routine resolves R2 keys via a D1 lookup before issuing delete calls -- there is no separate key manifest. This means the capture metadata row must still exist at the time the R2 objects are deleted.

**Edge cache purge.** WRL serves capture artifacts through Cloudflare's edge cache. Deletion includes a cache purge call against the Cloudflare Cache Purge API for affected URLs so that deleted artifacts are not served from cache after deletion completes.

**Quarantine purge.** Quarantined captures are purged by a weekly scheduled cron job (`0 9 * * 1` in `wrangler.toml`). The job deletes R2 objects and D1 rows for quarantined captures older than 90 days. This runs independently of the tenant deletion flow.

**Session TTL.** Sessions have an `expires_at` column set to 7 days from creation. Expired sessions are not automatically deleted from D1 (no cron for this); they are treated as expired at read time and cleaned up opportunistically. For deletion purposes, all sessions for a tenant are removed explicitly regardless of expiry state.

**Notification preferences.** The `notification_preferences` and `notification_sent` tables are deleted together in a batched D1 call. The email address stored in `notification_preferences` is the only directly personal field (distinct from hashed or pseudonymized data) that lives outside the `github_users` table.

</details>

---

## Related pages

- [Privacy Policy](https://webresourceledger.com/privacy) -- full data inventory, legal bases, and your GDPR rights
- [Authentication](../authentication/) -- API key lifecycle and revocation
- [Security](../security/) -- how WRL protects data in transit and at rest
