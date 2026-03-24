## Task: Wire Notification Triggers into Capture and Billing Paths

You are adding dispatchNotification() calls at the six trigger points in the existing codebase. The dispatch function and templates already exist (from prior tasks). Your job is purely integration -- adding calls at the right places.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell

Study the existing dispatchWebhooks() calls in src/index.js and src/billing.js to understand the pattern. Every notification dispatch must be wrapped in ctx.waitUntil() and must NOT use a silent .catch(() => {}). Instead use .catch(err => { ... log ... }).

IMPORTANT: Read src/quotas.js to find the actual FREE_CAPTURE_LIMIT value. The issue spec says 80/100 and 100/100, but the codebase uses a different limit (200). Use the codebase value via the constant, NOT hardcoded numbers.

### 3a. Capture Failure Notifications

Trigger point: src/index.js -- the capture failure and DLQ paths. Find where dispatchWebhooks(env, tenantId, 'capture.failed', ...) is called. Add alongside:

```js
ctx.waitUntil(dispatchNotification(env, tenantId, 'capture_failure', {
  url: captureRecord.url,
  errorCategory: captureRecord.error,
  failedAt: new Date().toISOString(),
  captureDetailUrl: `${baseUrl}/v1/captures/${captureRecord.id}`,
}).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId })));
```

The capture failure dedup is handled inside dispatchNotification -- you do not need to implement it here.

### 3b. Approaching Free Limit (80%)

Trigger point: src/index.js after incrementUsage() returns the new capture count, when the capture has succeeded.

After a successful capture increment, check if the tenant is on free tier (no Stripe customer) and the count is at 80% of the limit. Import FREE_CAPTURE_LIMIT from quotas.js (or read the constant from whatever module defines it).

```js
const threshold = Math.floor(FREE_CAPTURE_LIMIT * 0.8);
if (captureCount >= threshold && captureCount < FREE_CAPTURE_LIMIT) {
  ctx.waitUntil(dispatchNotification(env, tenantId, 'approaching_limit', {
    used: captureCount,
    limit: FREE_CAPTURE_LIMIT,
    period: computePeriod(),
    addPaymentUrl: `${baseUrl}/ui#billing`,
  }).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId })));
}
```

The notification_sent dedup inside dispatchNotification ensures this fires at most once per period.

### 3c. Free Limit Reached (100%)

Trigger point: src/index.js when checkQuota() returns { allowed: false, reason: 'payment_required' }, before returning the 402 response.

### 3d. Invoice Generated

Trigger point: src/billing.js -- add handling for the invoice.finalized Stripe event.

Study the existing Stripe webhook handler pattern. Add a new case for invoice.finalized:
- Look up tenant by Stripe customer ID
- Extract amount and currency from the invoice
- Dispatch notification

Check if getTenantByStripeCustomerId exists in db.js. If not, add it.

### 3e. Payment Failure

Trigger point: src/billing.js in the invoice.payment_failed handler (look for handleInvoicePaymentFailed or the existing handler).

Add after the billing status update:
```js
ctx.waitUntil(dispatchNotification(env, tenantId, 'payment_failure', {
  gracePeriodEnd: gracePeriodEnd.toISOString(),
  portalUrl: `${baseUrl}/ui#billing`,
}).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId })));
```

### 3f. Weekly Schedule Digest

Trigger point: src/index.js in the scheduled() handler.

Add a weekly cron trigger for the digest. Check if there's an existing cron routing pattern and add a weekly check (Monday 9:00 UTC). Also add the cron entry to wrangler.toml if needed.

Create handleWeeklyDigest(env, ctx) in src/notifications.js (extend the existing file):
1. Query all tenants with active schedules AND notify_weekly_digest = 1 AND email_verified = 1
2. LIMIT to 50 tenants per invocation (add warning log if limit hit)
3. For each tenant: query schedule execution results for the past 7 days
4. Build digest data: { periodStart, periodEnd, schedules: [{ url, total, succeeded, failed }] }
5. Call dispatchNotification for each tenant
6. Use notification_sent dedup with ISO week period (e.g., '2026-W13' -- NOTE: notification_sent period column has a check for YYYY-MM format, so use the month format instead)

### 3g. OAuth Scope Change for Email Auto-Population

In src/oauth.js: Change the OAuth scope to include user:email.

In the OAuth callback handler, after fetching /user, also fetch https://api.github.com/user/emails with the access token to get the primary verified email.

On new user creation: if primaryEmail exists, insert a notification_preferences row with email = primaryEmail.email, email_source = 'github', email_verified = 1.

On returning user login: if the notification_preferences row has email_source = 'github' and primaryEmail differs, update the email (keep email_verified = 1 since GitHub verified it). Do NOT overwrite if email_source = 'manual'.

If GitHub returns no primary verified email, set email to null.

### Tests

Create test/notification-triggers.test.js:
- Capture failure dispatches notification (mock dispatchNotification, verify it was called with correct args)
- Approaching limit dispatches at 80% threshold
- Approaching limit does NOT dispatch below threshold
- Approaching limit does NOT dispatch for paid tenants (those with Stripe customer)
- Limit reached dispatches on 402
- Invoice generated dispatches on invoice.finalized Stripe event
- Payment failure dispatches on invoice.payment_failed
- Weekly digest queries correct tenants and dispatches
- Weekly digest skips tenants with no captures in the period (empty digest)
- OAuth email auto-population on new user
- OAuth email update on returning user with github source
- OAuth does NOT overwrite manual email source

### Constraints
- Do NOT modify the email templates or dispatch logic -- only add trigger calls
- Do NOT modify the unsubscribe endpoint
- All dispatchNotification calls MUST be wrapped in ctx.waitUntil() and MUST have .catch(err => log(...)) -- no silent catches
- Follow existing code style exactly
- NEVER log email addresses

When you finish your task, report:
- File paths with change scope and line counts
- 1-2 sentence summary
- Approach chosen and alternatives rejected
