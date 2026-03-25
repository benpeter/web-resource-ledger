# IAC Minion Contribution: Operator Notification on Admin Key Creation (#200)

## Recommendation: Coralogix Alert on Existing Log Event (Option A)

### Analysis

The existing `admin.key_create` log event at line 132-141 of `src/admin.js` already emits **every field the operator needs**: `tenantId`, `scopes`, `name`, `keyHashPrefix`, and the Coralogix timestamp. This event fires via `ctx.waitUntil()` -- fire-and-forget, non-blocking. The data is already flowing to Coralogix.

The email pipeline (`email-dispatch.js`) is **wrong for this use case**. It is designed for per-tenant notifications with tenant-specific preferences (verified email, opt-in, unsubscribe, deduplication). Using it for operator-directed system notifications would require either:
- Creating a synthetic "operator" tenant with notification preferences in D1, or
- Adding a parallel code path that bypasses all the tenant suppression logic

Both add code, state, and testing surface for zero benefit.

### Why Coralogix Alert Wins

| Dimension | Coralogix Alert | Email via Resend |
|-----------|----------------|------------------|
| New code | **Zero** | ~30-50 lines (new template, new dispatch call, operator address env var) |
| New secrets | None | None (RESEND_API_KEY already exists, but need OPERATOR_EMAIL env var) |
| New bindings/infra | None | None (EMAIL_QUEUE exists) |
| New templates | None | 1 new email template file |
| New tests | None | Template tests, dispatch integration test |
| Delivery reliability | Coralogix handles retry/buffering | Queue retry + DLQ (already built, but adds another failure path to monitor) |
| Maintenance | Alert rule lives in Coralogix dashboard, no code deploys to change recipient | Code change + deploy to change recipient or format |
| Flexibility | Can route to Slack, PagerDuty, email, webhook via Coralogix integrations | Email only |

### Implementation Plan

**Zero code changes required.** This is purely a Coralogix configuration task:

1. **Create a Coralogix alert rule** in the dashboard (Alerts > New Alert):
   - **Name**: `WRL: New API Key Created`
   - **Type**: Standard alert (log-based)
   - **Query**: `event:"admin.key_create" AND responseStatus:201`
   - **Application**: `wrl` (production) -- exclude `wrl-staging` unless operator wants staging notifications too
   - **Subsystem**: `admin`
   - **Condition**: More than 0 occurrences in 1 minute (immediate)
   - **Notification group**: Include `tenantId`, `name`, `scopes`, `keyHashPrefix` in the alert payload
   - **Destination**: Email to operator address (or Slack webhook, or both)

2. **Coralogix alert destinations** are configured in Coralogix Settings > Integrations. If no email integration exists yet, create one. This is a one-time dashboard configuration, not infrastructure code.

3. **No wrangler.toml changes**, no new environment variables, no new queue bindings.

### What About Doing Both?

Not recommended for MVP. The Coralogix alert covers the requirement with zero code. If the operator later wants richer formatting or needs email delivery independent of Coralogix availability, the email path can be added. But adding it now violates YAGNI -- the log event already exists and carries all required data.

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Coralogix ingestion delay (typically <30s) | Low | Acceptable for operator awareness -- this is not a security-critical real-time alert |
| Alert rule misconfiguration in dashboard | Low | Test by creating a key in staging after setting up the alert |
| Coralogix unavailable | Low | Log delivery already has a `.catch()` fallback to `console.warn`. If Coralogix is down, no notification -- but this is fire-and-forget by design. The key creation itself is not affected. |

### Tasks for Implementation

1. **Configure Coralogix alert rule** (dashboard, no code): query on `event:"admin.key_create"`, immediate trigger, email/Slack destination
2. **Test**: Create a key on staging, verify alert fires within 1-2 minutes
3. **Document**: Add alert rule name to ops runbook so future operators know it exists

### What NOT to Do

- Do not add a new `dispatchNotification()` call in `handleAdminCreateKey()`. The email pipeline is tenant-facing infrastructure.
- Do not add an `OPERATOR_EMAIL` env var and direct Resend call. This creates a second email delivery path with its own failure modes.
- Do not create a new queue or binding for operator notifications.

### If Email Is Explicitly Required Later

If the product evolves to need direct email (e.g., Coralogix is dropped, or operator needs email with specific formatting):

1. Add an `operator-alert` notification type to `email-dispatch.js` that bypasses tenant preference checks
2. Add an `OPERATOR_EMAIL` env var to `wrangler.toml` `[vars]` (not a secret -- it's an operational config)
3. Create a minimal `operator-key-created.js` template
4. Call from `handleAdminCreateKey()` via `ctx.waitUntil()`

This would be ~40 lines of new code + template. But it is not needed now.
