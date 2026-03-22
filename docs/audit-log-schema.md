# Audit Log Schema

Operator reference for querying WRL structured logs in Coralogix.

All authenticated API requests and key lifecycle events produce structured
log entries with consistent tenant context. Use `applicationName:wrl`
(production) or `applicationName:wrl-staging` to scope queries.

## Operator jobs

- **Abuse investigation**: "Show me all actions by tenant X" -- filter by
  `tenantId`, scan event names, drill into payloads
- **Compliance reporting**: "What happened with key Y?" -- filter by
  `keyHashPrefix`, correlate across events
- **Key lifecycle auditing**: "Who provisioned/revoked keys?" -- filter
  `event:admin.key_*`

## Event taxonomy

| Event | Subsystem | Severity | Description |
|-------|-----------|----------|-------------|
| `capture.queued` | capture | 3 (info) | Capture request accepted and queued |
| `capture.start` | capture | 3 (info) | Browser render initiated |
| `capture.success` | capture | 3 (info) | Capture completed with all artifacts |
| `capture.partial` | capture | 3 (info) | Capture completed with degraded artifacts |
| `capture.fail` | capture | 5 (error) | Capture failed |
| `capture.stage.fail` | capture | 5 (error) | Individual capture stage failed |
| `capture.list` | capture | 6 (verbose) | List captures request completed |
| `capture.list_fail` | capture | 5 (error) | List captures KV error |
| `capture.kv_create_fail` | capture | 5 (error) | Failed to create capture record |
| `capture.kv_fail` | capture | 5 (error) | KV error during capture finalization |
| `capture.header_fail` | capture | 4 (warn) | Header collection failed (degraded) |
| `capture.wacz_fail` | capture | 4 (warn) | WACZ bundling failed (degraded) |
| `capture.key_archive_fail` | capture | 4 (warn) | Signing key archive failed |
| `capture.consent_error` | capture | 4 (warn) | Cookie consent dismissal error |
| `capture.tsa_fail` | capture | 4 (warn) | RFC 3161 timestamp request failed |
| `admin.key_create` | admin | 3 (info) | API key provisioned |
| `admin.key_create_fail` | admin | 5 (error) | Key creation failed (hash collision) |
| `admin.key_list` | admin | 3 (info) | Admin listed API keys |
| `admin.key_revoke` | admin | 3 (info) | API key revoked |
| `admin.key_revoke_fail` | admin | 4 (warn) | Revocation target not found |
| `admin.key_revoke_blocked` | admin | 3 (info) | Revocation blocked (last admin key) |
| `security.auth_fail` | security | 5 (error) | Authentication failed |
| `security.rate_limit` | security | 4 (warn) | Rate limit exceeded |
| `security.capacity_limit` | security | 4 (warn) | Global capacity limit hit |
| `security.ssrf_block` | security | 5 (error) | URL blocked by SSRF prevention |
| `security.legacy_auth_used` | security | 4 (warn) | Legacy single-key auth used |
| `signing.key_unavailable` | security | 5 (error) | Signing key missing or invalid |
| `webhook.create` | webhooks | 3 (info) | Webhook registered |
| `webhook.list` | webhooks | 6 (verbose) | Webhooks list request |
| `webhook.delete` | webhooks | 3 (info) | Webhook deleted |
| `webhook.ping` | webhooks | 3 (info) | Ping dispatched to endpoint |
| `webhook.deliver` | webhooks | 3 (info) | Event successfully delivered to endpoint |
| `webhook.deliver_fail` | webhooks | 4 (warn) | Delivery attempt failed; retry scheduled |
| `webhook.deliver_dlq` | webhooks | 5 (error) | All retries exhausted; event moved to dead-letter queue |
| `webhook.deliver_ssrf_block` | webhooks | 5 (error) | Delivery blocked by SSRF prevention |
| `webhook.dispatch_error` | webhooks | 5 (error) | Internal error dispatching event |

## Audit fields

These fields appear on authenticated request events. Not all fields appear
on every event -- pre-auth failures and unauthenticated endpoints have
fewer fields.

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Event name from taxonomy above |
| `tenantId` | string\|null | Tenant identifier; null on pre-auth failures |
| `keyName` | string\|null | Human-readable key name; null for legacy/admin auth |
| `keyHashPrefix` | string\|null | First 8 chars of SHA-256 key hash; null for admin auth |
| `authMethod` | string | `'kv'`, `'legacy'`, or `'admin_key'` |
| `cip` | string | HMAC-derived IP correlation token (not a raw IP address) |
| `responseStatus` | number | HTTP status code returned |
| `captureId` | string | Capture identifier (`cap_` prefix) |
| `url` | string | Validated, normalized target URL |
| `scopes` | string[] | Permission scopes on the key |
| `reason` | string | Machine-readable failure reason |
| `durationMs` | number | Request duration in milliseconds |
| `errorMessage` | string | Truncated error message (max 256 chars) |
| `count` | number | Result count (key listings) |
| `idempotent` | boolean | Whether revocation was a no-op |
| `webhookId` | string | Webhook identifier (`whk_` prefix) |
| `webhookUrl` | string | Registered endpoint URL (delivery events) |
| `eventId` | string | Event identifier (`evt_` prefix) |
| `eventType` | string | Event type (e.g., `capture.complete`) |
| `attemptNumber` | number | Delivery attempt count (1-indexed) |
| `deliveryStatus` | number | HTTP status code from endpoint (delivery events) |
| `deliveryLatencyMs` | number | Round-trip latency in ms (delivery events) |

## Severity mapping

| Severity | Level | WRL usage |
|----------|-------|-----------|
| 3 | Info | Successful operations, audit trail events |
| 4 | Warning | Rate limits, degraded paths, non-critical failures |
| 5 | Error | Auth failures, SSRF blocks, KV errors |
| 6 | Verbose | Operational telemetry (not part of audit trail) |

## Example Coralogix queries

**All actions by tenant X in last 24h:**
```
applicationName:wrl AND tenantId:"acme-corp"
```

**Key provisioning and revocation for tenant Y:**
```
applicationName:wrl AND event:admin.key_* AND tenantId:"tenant-y"
```

**All failed auth attempts (abuse investigation):**
```
applicationName:wrl AND event:security.auth_fail
```

**All captures by a specific key:**
```
applicationName:wrl AND keyHashPrefix:"a1b2c3d4"
```

**All 4xx/5xx responses for a tenant:**
```
applicationName:wrl AND tenantId:"acme-corp" AND responseStatus:>=400
```

**All admin operations in last 7 days:**
```
applicationName:wrl AND event:admin.*
```

**All webhook deliveries for a tenant:**
```
applicationName:wrl AND event:webhook.deliver* AND tenantId:"acme-corp"
```

**Failed deliveries (retries + DLQ):**
```
applicationName:wrl AND (event:webhook.deliver_fail OR event:webhook.deliver_dlq)
```

**All activity for a specific webhook:**
```
applicationName:wrl AND webhookId:"whk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
```

**SSRF blocks on webhook delivery:**
```
applicationName:wrl AND event:webhook.deliver_ssrf_block
```
