# Domain Plan Contribution: observability-minion

## Recommendations

### 1. Log Events to Emit

The email notification system introduces a new subsystem (`"email"`) in the existing `log()` structured logging pattern. Every email lifecycle event gets its own named event following the established `{subsystem}.{action}` convention used throughout the codebase (`webhook.deliver`, `billing.checkout_created`, `capture.fail`, etc.).

**Required log events (seven total):**

| Event Name | Severity | When | Key Fields |
|---|---|---|---|
| `email.send` | 3 (info) | Resend API returns 2xx | `tenantId`, `notificationType`, `emailId` (Resend message ID), `durationMs` |
| `email.send_fail` | 5 (error) | Resend API returns non-2xx or network error | `tenantId`, `notificationType`, `httpStatus`, `errorCategory`, `durationMs`, `retryDelaySeconds` |
| `email.send_dlq` | 5 (error) | Email message exhausts all queue retries | `tenantId`, `notificationType`, `totalAttempts` |
| `email.bounce` | 4 (warn) | Resend webhook reports hard/soft bounce | `tenantId`, `notificationType`, `bounceType` (`hard`/`soft`), `emailId` |
| `email.unsubscribe` | 3 (info) | Tenant uses unsubscribe link | `tenantId`, `notificationType` (which type was unsubscribed, or `all`) |
| `email.dispatch` | 3 (info) | Notification trigger enqueues an email | `tenantId`, `notificationType`, `triggerEvent` (the originating event, e.g., `capture.fail`, `billing.grace_period_started`) |
| `email.dispatch_suppressed` | 3 (info) | Notification was suppressed by dedup/cooldown | `tenantId`, `notificationType`, `suppressionReason` (`cooldown`, `opted_out`, `no_email`) |

**Design rationale:**

- **Mirrors webhook-dispatch.js pattern exactly.** The webhook system already establishes `dispatch`, `deliver` (here `send`), `deliver_fail` (here `send_fail`), and `deliver_dlq` (here `send_dlq`). Following the same lifecycle makes Coralogix queries consistent and allows operators to reuse query patterns across delivery channels.

- **Separate `dispatch` and `send` events.** `email.dispatch` fires when the trigger logic decides to send a notification and enqueues it. `email.send` fires when the queue consumer actually delivers it. This separation is critical for diagnosing "why didn't the tenant get an email?" -- the answer is either "it was never dispatched" (trigger issue) or "it was dispatched but delivery failed" (Resend issue). Without both events, you lose this diagnostic fork.

- **`email.dispatch_suppressed` is not optional.** Suppression events are the most important diagnostic log. When a tenant asks "why didn't I get notified?", the answer is almost always in the suppression log: opted out, no email configured, cooldown window, or dedup. Without this event, debugging notification gaps requires proving a negative (searching for the absence of `email.dispatch`), which is unreliable across time ranges.

- **No email address in logs.** Email addresses are PII. The `tenantId` is sufficient for correlation -- the operator can look up the email in D1 when needed. This aligns with the existing `log.js` invariant: "NEVER LOG: raw API keys, raw IP addresses..."

- **No raw error messages from Resend.** Follow the `classifyDeliveryError` pattern from `webhook-dispatch.js`: categorize errors into safe buckets (`http_4xx`, `http_5xx`, `timeout`, `dns`, etc.) rather than logging raw Resend error strings that could contain PII or leak internal state.

**Fields to include in every email log event:**

```js
{
  event: 'email.{action}',
  tenantId,
  notificationType,  // 'capture_failure' | 'approaching_limit' | 'limit_reached' | 'invoice_generated' | 'payment_failure' | 'schedule_digest'
  // action-specific fields below
}
```

The `notificationType` field is the primary grouping dimension. It enables Coralogix queries like "show me all failed payment_failure notifications" without parsing log text.

### 2. Integration with Existing Coralogix Logging Pattern (src/log.js)

**No changes to `log.js` needed.** The existing `log()` function supports an arbitrary `subsystem` string. Email events use `"email"` as the subsystem, which creates a new Coralogix subsystem filter automatically:

```js
// In email queue consumer (parallels webhook-dispatch.js:325)
ctx.waitUntil(log(env, 3, 'email', {
  event: 'email.send',
  tenantId,
  notificationType,
  emailId: resendResponse.id,
  durationMs,
}) ?? Promise.resolve());
```

**Subsystem naming convention:** The codebase already uses: `capture`, `security`, `webhook`, `billing`, `admin`, `oauth`, `schedule`, `meter`. Adding `email` follows the pattern. Do not nest it under `billing` or `webhook` -- email is a distinct delivery channel with its own failure modes.

**Fire-and-forget pattern:** Follow the `ctx.waitUntil(log(...) ?? Promise.resolve())` pattern used in `webhook-dispatch.js` for queue consumers. This ensures log delivery does not block email delivery acknowledgment.

**Queue consumer context:** Email queue consumers must pass `ctx` (ExecutionContext) just like `handleWebhookMessage` does. The `waitUntil` ensures log delivery completes even after the queue message is acked.

### 3. Alerting Thresholds for Email Delivery Failures

**Two new Coralogix alert rules:**

#### Alert 1: [WRL] Email Delivery Failures

| Property | Value |
|---|---|
| **Query** | `event:"email.send_fail"` (app: wrl, subsystem: email) |
| **Threshold** | > 5 events in 30 minutes |
| **Priority** | P2 (Medium) |
| **Retriggering** | 60-minute suppression (matches existing alerts) |

**Threshold rationale:** Email delivery is less time-sensitive than webhooks (webhook consumers expect near-real-time delivery; email recipients tolerate minutes of delay). The queue retry system handles transient Resend API errors. Five failures in 30 minutes exceeding the retry budget suggests the Resend API is down or the API key is invalid/revoked -- both require operator intervention. P2 (not P1) because email delivery failure does not block captures or billing -- it degrades a notification channel.

Not P3 because unlike TSA failures (where the operator response is "wait"), Resend API key revocation requires active remediation.

#### Alert 2: [WRL] Email Bounces

| Property | Value |
|---|---|
| **Query** | `event:"email.bounce" AND bounceType:"hard"` (app: wrl, subsystem: email) |
| **Threshold** | > 3 events in 24 hours |
| **Priority** | P3 (Low) |
| **Retriggering** | 24-hour suppression |

**Threshold rationale:** Hard bounces indicate the tenant's email address is invalid. Three hard bounces in a day likely means a single tenant's email is misconfigured (most tenants will have zero bounces). P3 because this is a tenant configuration issue, not a system outage. The operator response is to contact the tenant or auto-disable notifications for the affected address (future enhancement).

**Why not alert on DLQ (`email.send_dlq`)?** The `email.send_fail` alert already catches the underlying issue. DLQ events are the consequence, not the cause. Adding a DLQ alert would create duplicate notifications for the same incident. The DLQ event exists in logs for forensic review but does not need its own alert.

**Why not alert on suppression or unsubscribe?** These are normal operational events. An unsubscribe is a user exercising their rights, not a system failure. Suppression is the dedup logic working correctly.

**Provisioning:** Add both alerts to the existing `scripts/provision-alerts.sh` script. The script already uses a list-then-upsert pattern that handles new alerts cleanly.

### 4. Delivery Status Storage: D1 vs Logs-Only

**Recommendation: Logs-only for email delivery status. Do NOT store delivery status in D1.**

**Rationale:**

- **D1 is not a delivery tracking database.** The existing codebase stores only authoritative state in D1 (captures, tenants, API keys, billing status, schedules). Delivery status is ephemeral operational data -- it changes over time (sent, delivered, bounced) and has no bearing on application logic.

- **Coralogix is already the delivery audit trail.** The webhook system proves this model works: `webhook.deliver`, `webhook.deliver_fail`, and `webhook.deliver_dlq` events in Coralogix are the only delivery record. No D1 table stores webhook delivery status. Email delivery should follow the same pattern.

- **D1 write volume concern.** At scale, every email send would require a D1 write for the initial dispatch and another for every status update (sent, delivered, bounced). The capture pipeline already has enough D1 writes per operation. Adding email delivery tracking doubles the write load for a feature that no tenant-facing API reads.

- **When to reconsider:** If a future "notification history" API endpoint is built (listed as out-of-scope in the prompt), delivery status storage in D1 becomes necessary. At that point, a `notification_log` table with columns `(id, tenantId, notificationType, status, createdAt, updatedAt)` would be the right approach. But building the storage before the read path exists violates YAGNI.

**Exception: Store notification preferences and dedup state in D1.** This is different from delivery status -- it is application state that drives notification logic:

- **Notification preferences** (email address, opted-in event types) -- stored in D1, queried on every notification trigger.
- **Dedup watermarks** (e.g., "last approaching_limit notification sent at" per tenant per billing period) -- stored in D1 to prevent duplicate sends across Worker invocations. KV is an alternative but D1 is more reliable for this since the rest of the notification preference data is already there. A `last_notified_at` column per notification type in the preferences table, or a small `notification_dedup` table with `(tenantId, notificationType, period, sentAt)`, handles this.

### 5. Correlating Email Events with Originating Capture/Billing Events

**Correlation strategy: include the trigger event context in every email log entry.**

The key principle: every email notification is caused by some upstream event. That upstream event already has a natural identifier in the codebase. Carry that identifier through the email dispatch pipeline so Coralogix queries can join them.

**Per notification type:**

| Notification Type | Correlation Field | Source |
|---|---|---|
| `capture_failure` | `captureId` | From the capture record at the fail path in `index.js` |
| `approaching_limit` | `period`, `captureCount` | From `checkQuota()` return value |
| `limit_reached` | `period`, `captureCount` | From `checkQuota()` return value |
| `invoice_generated` | `stripeEventId`, `stripeCustomerId` | From the Stripe webhook event in `billing.js` |
| `payment_failure` | `stripeEventId`, `stripeCustomerId` | From the Stripe webhook event in `billing.js` |
| `schedule_digest` | `period` (week start/end) | From the digest cron trigger |

**Implementation pattern:**

```js
// At the trigger point (e.g., capture failure in index.js):
await dispatchEmailNotification(env, {
  tenantId,
  notificationType: 'capture_failure',
  // Correlation context -- carried into the queue message and into every log event
  context: { captureId, url: captureRecord.url, error: captureRecord.error },
});

// In the log event:
log(env, 3, 'email', {
  event: 'email.dispatch',
  tenantId,
  notificationType: 'capture_failure',
  triggerEvent: 'capture.fail',   // name of the upstream log event
  captureId,                       // correlation field
});
```

The `triggerEvent` field is the name of the upstream log event that caused the notification. This allows a Coralogix query like:

```
event:"email.dispatch" AND captureId:"cap_abc123"
```

...to find the notification dispatch, and:

```
event:"capture.fail" AND captureId:"cap_abc123"
```

...to find the upstream failure. The `captureId` is the join key.

**For billing events, the join key is `stripeEventId`:**

```
event:"email.send" AND stripeEventId:"evt_abc123"
```
```
event:"billing.grace_period_started" AND stripeEventId:"evt_abc123"
```

This correlation pattern does not require a shared trace ID or distributed tracing infrastructure. It uses the natural identifiers that already exist in the codebase.

---

## Proposed Tasks

### Task O1: Define email log event schema and add to audit log docs

**Deliverable:** Update or create `docs/operations/audit-log-schema.md` (or the equivalent documentation file) with the seven email log events, their severity levels, fields, and example Coralogix queries for each.

**Dependencies:** None (can start immediately).

**Effort:** Small.

### Task O2: Implement structured logging in email queue consumer

**Deliverable:** The email queue consumer (`handleEmailMessage` or equivalent) emits `email.send`, `email.send_fail`, and `email.send_dlq` log events using the established `ctx.waitUntil(log(...))` pattern. Includes `classifyDeliveryError`-style error categorization for Resend API responses.

**Dependencies:** Depends on the email queue consumer existing (iac-minion's queue architecture). Depends on the Resend API client being implemented.

**Effort:** Medium.

### Task O3: Implement dispatch and suppression logging at trigger points

**Deliverable:** Each of the six notification trigger points emits `email.dispatch` or `email.dispatch_suppressed` log events with correlation fields. This is the integration logging at the points where notification decisions are made (capture failure path, quota check, billing webhook handler, schedule digest cron).

**Dependencies:** Depends on the notification dispatch function existing (api-design-minion's integration design). Depends on the dedup/suppression logic being defined.

**Effort:** Medium.

### Task O4: Add email delivery failure and bounce alerts to provision-alerts.sh

**Deliverable:** Two new alert definitions added to `scripts/provision-alerts.sh`: `[WRL] Email Delivery Failures` (P2, >5 in 30 min) and `[WRL] Email Bounces` (P3, >3 hard bounces in 24h). Update `docs/operations/alerts.md` with the new alert documentation following the existing format.

**Dependencies:** Depends on O1 (event names must be finalized before alert queries are written). Can be provisioned before any email is actually sent.

**Effort:** Small.

### Task O5: Write runbooks for email delivery alerts

**Deliverable:** Two runbook files in `docs/operations/runbooks/`: `email-delivery-failures.md` and `email-bounces.md`. Each follows the existing runbook pattern (validate, determine severity, respond).

**Dependencies:** Depends on O4 (alerts must be defined). Depends on understanding Resend's error modes (verify during implementation).

**Effort:** Small.

---

## Risks and Concerns

### Risk 1: Resend webhook reliability for bounce detection

The `email.bounce` event depends on Resend sending inbound webhooks to WRL when an email bounces. This introduces a new inbound webhook surface (Resend calling WRL) alongside the existing Stripe webhook. Concerns:

- **Signature verification:** Resend webhooks must be signature-verified, same as Stripe. Without verification, anyone can fake a bounce event and disable a tenant's notifications.
- **Event dedup:** Resend may retry webhook delivery, causing duplicate bounce processing. The existing Stripe dedup pattern (`isEventProcessed` / `markEventProcessed` in KV) should be reused.
- **Failure mode:** If WRL fails to receive Resend bounce webhooks, hard-bounced email addresses will continue receiving send attempts, burning through Resend quota and potentially hurting sender reputation. Consider a fallback: if `email.send_fail` with `httpStatus: 400` (Resend's response for bad addresses) occurs, treat it as a hard bounce at send time rather than waiting for the async webhook.

### Risk 2: Notification dedup across Worker invocations

The 80% and 100% free-limit notifications must fire exactly once per billing period per tenant. In a Workers environment with no shared memory, dedup state must be persisted. The risk is sending duplicate notifications if two concurrent capture requests both cross the 80% threshold in the same Worker invocation cycle.

**Mitigation:** Use a D1 `notification_dedup` table (or column on the preferences table) with a `(tenantId, notificationType, period)` unique constraint. The notification trigger does a conditional INSERT (`INSERT ... ON CONFLICT DO NOTHING`) and only dispatches if the insert succeeds. This is the same pattern used by `usage_counters` UPSERT.

### Risk 3: Resend free tier limits (100 emails/day)

At the current scale (single-digit tenants), 100 emails/day is sufficient. But the weekly schedule digest fires for every tenant with active schedules, and capture failure notifications could spike during a systemic outage. A 10-minute outage affecting 50 scheduled captures across 5 tenants could generate 50 capture failure emails in rapid succession.

**Mitigation:** Implement a per-tenant, per-notification-type cooldown window. For `capture_failure`, one notification per 30 minutes per tenant (batching failures into a count). The `email.dispatch_suppressed` log event records when cooldown is applied, ensuring the suppression is visible in logs.

### Risk 4: No email address on tenant identity today

The metaplan notes that no email field exists on `github_users`. GitHub's OAuth API can return email if the `user:email` scope is requested, but it may return `null` (user has email set to private). Tenants without a configured email address cannot receive notifications.

**Observability impact:** The `email.dispatch_suppressed` event with `suppressionReason: 'no_email'` must be logged when a notification is triggered but cannot be sent because the tenant has no email. This makes the gap visible in Coralogix without requiring any tenant-facing error.

### Risk 5: Log volume from capture_failure notifications at scale

If a systemic issue causes thousands of captures to fail, and each failure triggers a notification dispatch check, the `email.dispatch_suppressed` (cooldown) logs could become a significant volume. This is a bounded risk since the suppression log is small, but worth monitoring.

**Mitigation:** The cooldown check should short-circuit before logging if the notification type is opted out. Only log suppression for notifications that would have been sent but were actively suppressed.

---

## Additional Agents Needed

- **security-minion** (already planned): Must review the Resend webhook signature verification approach, the unsubscribe token signing mechanism, and PII handling for email addresses in D1. The bounce webhook endpoint is a new unauthenticated surface that needs security review.
- **test-minion** (already flagged in metaplan): Notification dedup and cooldown logic need targeted unit tests. The email queue consumer needs tests following the `webhook-dispatch.test.js` pattern. Mock Resend API responses for the test suite.

No additional agents beyond those already identified in the metaplan.
