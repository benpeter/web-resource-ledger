# Decisions: R27 Webhooks / Outbound Callbacks

## Secret Storage: Plaintext vs AES-GCM Encryption

**Chosen**: Plaintext `wrlsec_` secrets in D1
**Over**: AES-GCM encryption at rest (api-design-minion recommended)
**Why**: D1 is only accessible from the bound Worker -- no external SQL
access, no shared database credentials. Encryption would require key
management (where to store the encryption key?) without meaningfully
reducing the threat surface. security-minion called it "encryption theater"
for this access model. Schema is encryption-agnostic if needed later.

## Signing Scheme: Timestamp-Prefixed vs Raw Body

**Chosen**: `signed_payload = "${unix_timestamp}.${raw_body}"` (Stripe model)
**Over**: HMAC over raw body only
**Why**: Timestamp prefix prevents replay attacks. Without it, a captured
webhook payload could be re-delivered indefinitely. The `t=` component in the
signature header lets receivers enforce staleness checks (e.g., reject
signatures older than 5 minutes).

## Queue Architecture: Dedicated vs Shared

**Chosen**: Dedicated `wrl-webhooks` queue with its own DLQ
**Over**: Reusing the existing capture queue
**Why**: Different retry schedules (webhook: 1m/5m/15m vs capture: queue
default), different failure modes (network vs browser), and failure isolation
(webhook delivery failures must never block capture processing).

## Auth Scope: capture vs New webhook Scope

**Chosen**: Reuse `capture` scope for webhook CRUD
**Over**: New `webhook` scope requiring key reissuance
**Why**: Webhooks are tightly coupled to capture lifecycle events. Requiring a
separate scope would force all existing tenants to rotate keys. The `capture`
scope already implies "I manage my capture workflow." A dedicated scope can be
added later as a non-breaking refinement.

## SSRF Protection: Reuse validateUrl vs Custom

**Chosen**: Thin wrapper (`validateWebhookUrl`) adding HTTPS-only on top of
existing `validateUrl()`
**Over**: Duplicate SSRF validation logic, port restriction (443/8443 only)
**Why**: validateUrl already handles DNS resolution, private IP blocklisting,
double-encoding, and credential rejection. Port restriction was dropped per
margo+lucy YAGNI advisory -- non-standard HTTPS ports are legitimate (dev
servers, load balancers).

## Webhook Index: Single Composite vs Dual

**Chosen**: Single `idx_webhooks_tenant(tenant_id, active, created_at)`
**Over**: Additional `idx_webhooks_tenant_active(tenant_id, active)`
**Why**: With max 5 webhooks per tenant, the second index would be a
redundant prefix of the composite index. margo flagged this during Phase 3.5
review and the synthesis dropped it.

## Event ID Sharing Across Webhooks

**Chosen**: Same `eventId` for all webhooks receiving the same capture event
**Over**: Unique eventId per (webhook, event) delivery
**Why**: Follows Stripe model -- the event ID represents "this thing happened,"
not "this delivery attempt." Receivers can deduplicate by eventId. The eventId
is extracted once at enqueue time and stored as a top-level queue message field
(avoids JSON re-parse in the delivery hot path).

## Delivery Telemetry: Coralogix vs D1

**Chosen**: All delivery attempt logs go to Coralogix only
**Over**: `webhook_deliveries` table in D1
**Why**: Delivery history is high-volume append-only telemetry, not queryable
metadata. D1 row counts would grow unboundedly. Coralogix handles retention,
search, and alerting natively. Queryable by webhookId for delivery history
reconstruction.
