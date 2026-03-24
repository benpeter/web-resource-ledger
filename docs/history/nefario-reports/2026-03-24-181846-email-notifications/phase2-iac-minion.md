## Domain Plan Contribution: iac-minion

### Recommendations

#### 1. Resend is the clear choice over Cloudflare Email Workers

**Cloudflare Email Service (new, send to arbitrary addresses)**: Still in private beta as of March 2026. Pricing not finalized. Not generally available. Cannot depend on it for a production feature.

**Cloudflare Email Routing send_email binding (existing)**: Can only send to *verified Email Routing destination addresses* on the account. This is designed for internal notifications (e.g., alerting yourself), not customer-facing transactional email. Cannot send to arbitrary tenant email addresses. Disqualified.

**Resend**: Generally available, well-documented, Cloudflare has an official tutorial for Workers+Queues integration, simple REST API (single `POST /emails`), free tier covers 3,000 emails/month (100/day), Pro at $20/month covers 50,000/month with no daily cap. API key auth via single secret. Excellent fit.

**Recommendation: Resend.** It is the only viable option that can send to arbitrary tenant email addresses from a Cloudflare Worker today.

#### 2. Dedicated email queue, not the existing webhook queue

The existing architecture uses purpose-specific queues with tailored configurations:
- `wrl-captures` / `wrl-captures-dlq`: capture processing, `max_concurrency=10`, `max_retries=3`
- `wrl-webhooks` / `wrl-webhooks-dlq`: webhook delivery, `max_concurrency=20`, `max_retries=3`

Email delivery has different characteristics than both:
- **Rate limit**: Resend's API limit is 5 requests/second (per team, verified from their docs). The existing webhook queue has `max_concurrency=20`, which would blow past this limit immediately.
- **Batch size**: The Cloudflare Queues+Resend tutorial recommends `max_batch_size=2` to stay within rate limits, but WRL processes one message at a time (`max_batch_size=1`) which is cleaner. With `max_concurrency` capped at 5, single-message processing at 5 concurrent invocations stays within the rate limit.
- **Retry semantics**: Email retries should be more aggressive on transient failures (Resend 429/5xx) but should NOT retry on permanent failures (invalid address, domain verification failure). Same pattern as webhooks but different classification.
- **DLQ handling**: Failed emails that exhaust retries should log to Coralogix and potentially trigger an operational alert (unlike webhooks, where the tenant is responsible for monitoring).

**Recommendation: New dedicated queue pair `wrl-emails` / `wrl-emails-dlq`** with:
```toml
[[queues.producers]]
binding = "EMAIL_QUEUE"
queue = "wrl-emails"

[[queues.consumers]]
queue = "wrl-emails"
max_batch_size = 1
max_batch_timeout = 5
max_retries = 3
dead_letter_queue = "wrl-emails-dlq"
max_concurrency = 5

[[queues.producers]]
binding = "EMAIL_DLQ"
queue = "wrl-emails-dlq"

[[queues.consumers]]
queue = "wrl-emails-dlq"
max_batch_size = 1
max_batch_timeout = 30
max_retries = 0
```

This mirrors the existing webhook queue pattern exactly (same consumer shape in `index.js`), just with `max_concurrency=5` to respect Resend's rate limit.

Staging equivalents: `wrl-emails-staging` / `wrl-emails-staging-dlq` with `max_concurrency=2` (conservative for the 100/day free tier limit).

#### 3. Queue consumer routing in index.js

The existing `queue()` handler in `index.js` routes by queue name substring:

```js
async queue(batch, env, ctx) {
  for (const msg of batch.messages) {
    const q = batch.queue;
    if (q.includes('webhooks')) {
      // webhook handlers
    } else {
      // capture handlers
    }
  }
}
```

Add a third branch for emails:

```js
if (q.includes('emails')) {
  if (q.endsWith('-dlq')) {
    await handleEmailDlqMessage(msg, env, ctx);
  } else {
    await handleEmailMessage(msg, env, ctx);
  }
} else if (q.includes('webhooks')) {
  // ...existing...
}
```

This preserves the existing pattern. The `email-dispatch.js` module should follow the same structure as `webhook-dispatch.js`: export `handleEmailMessage()`, `handleEmailDlqMessage()`, and a `dispatchEmail()` entry point.

#### 4. Resend API key provisioning

Follow the established secrets pattern:

**Step 1: Store in 1Password**
```bash
op item edit "Production" --vault WRL "RESEND_API_KEY=re_..."
op item edit "Staging" --vault WRL "RESEND_API_KEY=re_..."
```

Use separate Resend API keys for production and staging (Resend supports multiple API keys per team). The staging key can use the same Resend account but a separate API key for audit trail.

**Step 2: Push via wrangler**
```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler secret put RESEND_API_KEY
unset CLOUDFLARE_API_TOKEN && npx wrangler secret put RESEND_API_KEY --env staging
```

**Step 3: Document in wrangler.toml comments**
Add to the existing secrets comment block:
```toml
# Email sending (set via wrangler secret put):
#   RESEND_API_KEY -- Resend API key for transactional email delivery
```

**Step 4: Update CLAUDE.local.md field mapping table**
Add `RESEND_API_KEY` | `RESEND_API_KEY` to the 1Password field mapping.

#### 5. Email dispatch module design (`src/email-dispatch.js`)

Follow the `webhook-dispatch.js` pattern exactly:

```
dispatchEmail(env, tenantId, notificationType, templateData)
  -> look up tenant notification preferences (D1)
  -> if email disabled for this type, return (no-op)
  -> look up tenant email address (D1, from account/billing)
  -> env.EMAIL_QUEUE.send({ tenantId, notificationType, to, templateData })

handleEmailMessage(msg, env, ctx)
  -> render template (HTML + plain text)
  -> POST to Resend API
  -> on 2xx: ack
  -> on 422 (invalid address, etc.): ack, log as permanent failure
  -> on 429: retry with backoff
  -> on 5xx: retry with backoff
  -> on network error: retry with backoff

handleEmailDlqMessage(msg, env, ctx)
  -> log at severity 5
  -> ack
```

The Resend API call itself is simple -- a single `fetch()` to `https://api.resend.com/emails`:

```js
const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'WRL <notifications@webresourceledger.com>',
    to: [recipientEmail],
    subject: subject,
    html: htmlBody,
    text: textBody,
  }),
});
```

No SDK needed. The Resend REST API is a single endpoint. Adding the `resend` npm package would be unnecessary dependency for what is effectively one `fetch()` call. This aligns with the project's lean-and-mean philosophy.

#### 6. Domain verification

Resend requires a verified sending domain. `webresourceledger.com` needs DNS records:
- SPF TXT record (or include in existing SPF)
- DKIM CNAME records (Resend provides these)
- Optional: DMARC TXT record

These are one-time manual setup steps in the Cloudflare DNS dashboard and Resend dashboard. Not Terraform-managed (the project doesn't use Terraform for DNS).

#### 7. Rate limit and capacity planning

| Tier | Daily limit | Monthly limit | Rate limit | Cost |
|------|-------------|---------------|------------|------|
| Free | 100/day | 3,000/month | 5 req/s | $0 |
| Pro | No limit | 50,000/month | 5 req/s | $20/month |

For WRL's current scale (early-stage product), the free tier is sufficient. The 6 notification types are low-volume:
- Capture failure: only on failures, not every capture
- Approaching free limit: once per billing period per tenant
- Free limit reached: once per billing period per tenant
- Invoice generated: once per month per tenant
- Payment failure: rare event
- Weekly schedule digest: once per week per tenant

Even with 100 tenants, weekly volume would be well under 1,000 emails/month. The 100/day free tier limit is the binding constraint. If all 100 tenants received a weekly digest on the same day, that's 100 emails -- exactly at the daily limit. Add operational emails and there's no headroom.

**Recommendation**: Start on free tier for development/staging. Budget for Pro tier ($20/month) for production from day one. The daily limit on free tier is too tight for production reliability.

#### 8. Failure modes to plan for

| Failure | Detection | Response |
|---------|-----------|----------|
| Resend 429 (rate limited) | HTTP status | Retry with backoff (queue handles via `msg.retry()`) |
| Resend 5xx | HTTP status | Retry with backoff |
| Resend 422 (invalid params, bad address) | HTTP status + response body | Ack immediately, log as permanent failure. Do NOT retry. |
| Resend API key invalid/expired | HTTP 401/403 | Ack immediately, log at severity 5. This is a config error -- all emails will fail until fixed. |
| Network timeout to api.resend.com | fetch() throws | Retry with backoff |
| Daily/monthly quota exceeded | Resend returns 429 with quota-specific error | Log at severity 5, retry (will keep failing until quota resets). Consider KV-based circuit breaker to stop sending until next day/month. |
| Email bounced (hard bounce) | Resend webhook (future enhancement) | Not in scope for R36. Log if Resend provides inline bounce info. |
| Template rendering error | Exception in render function | Ack, log at severity 5. Do NOT retry a template bug. |

### Proposed Tasks

#### Task 1: Create Cloudflare Queues for email delivery
**What**: Add `wrl-emails` / `wrl-emails-dlq` queue pairs to `wrangler.toml` (production and staging). Create the queues via `wrangler queues create`.
**Deliverables**: Updated `wrangler.toml` with EMAIL_QUEUE and EMAIL_DLQ bindings for both environments.
**Dependencies**: None. Can be done first.

#### Task 2: Provision Resend API key
**What**: Create Resend account, verify `webresourceledger.com` domain (SPF, DKIM, DMARC DNS records), generate API keys for staging and production, store in 1Password and push via `wrangler secret put`.
**Deliverables**: Working Resend API key in both environments, verified sending domain, updated 1Password items, updated `wrangler.toml` comments and `CLAUDE.local.md` field mapping.
**Dependencies**: Access to Cloudflare DNS for webresourceledger.com.

#### Task 3: Implement email dispatch module (`src/email-dispatch.js`)
**What**: Build `dispatchEmail()`, `handleEmailMessage()`, and `handleEmailDlqMessage()` following the `webhook-dispatch.js` pattern. Direct `fetch()` to Resend API, no SDK.
**Deliverables**: `src/email-dispatch.js` with full retry/error classification logic, structured Coralogix logging.
**Dependencies**: Task 1 (queues exist), Task 2 (API key available), notification preferences schema (from api-design-minion), email templates (separate task).

#### Task 4: Wire email queue consumer into index.js
**What**: Add email queue routing branch to the `queue()` handler in `index.js`, matching the existing webhook/capture pattern.
**Deliverables**: Updated `index.js` with email queue consumer routing.
**Dependencies**: Task 3 (handlers exist).

#### Task 5: Email sending integration test
**What**: Write an integration test that actually sends an email via Resend (to a test address) and verifies delivery. This is consistent with the project's "test the real boundaries" philosophy. Use Resend's test/sandbox mode or a dedicated test domain.
**Deliverables**: Integration test in `test/` directory.
**Dependencies**: Task 2, Task 3.

### Risks and Concerns

1. **Resend free tier daily limit (100/day) is too tight for production.** If a batch of capture failures or digest emails coincides, the daily cap will be hit. Mitigate by budgeting $20/month for Pro tier from launch.

2. **No sending domain verification = all emails fail.** Domain verification (SPF/DKIM/DMARC) is a manual prerequisite that blocks the entire feature. It requires DNS access and Resend dashboard interaction. Plan this as a blocker in the first task.

3. **Resend API availability.** Resend is a third-party dependency. If their API goes down, no emails are sent. The queue-based architecture provides natural buffering -- messages wait in the queue and retry. But a sustained outage (hours) could fill the DLQ. This is acceptable for notification emails (they are not critical-path).

4. **Queue count limits.** Adding 4 more queues (2 per env) brings the total to 12 queues. Cloudflare allows up to 10,000 queues per account on paid plans. No concern.

5. **No bounce handling.** Resend supports webhooks for bounce/complaint notifications, but that requires a separate inbound endpoint. Not in scope for R36, but worth noting: repeatedly sending to bounced addresses will hurt sender reputation. Track this for a future phase.

6. **Template rendering in the queue consumer uses CPU time.** HTML template rendering should be trivial (string concatenation, not a heavy templating engine). If a complex templating library is chosen, verify it doesn't exceed the 60s CPU limit. Recommendation: use simple template literal functions, no library.

7. **Unsubscribe handling needs a signed token mechanism.** One-click unsubscribe links in emails need to work without requiring login. This means either signed tokens (HMAC with a secret) or short-lived one-time tokens stored in KV. The security-minion should weigh in on which approach is safer. From an infra perspective, both are feasible within the existing bindings (SIGNING_KEY for HMAC, KV for ephemeral tokens).

### Additional Agents Needed

None. The current team covers all aspects:
- **api-design-minion**: notification preferences API, unsubscribe endpoint design
- **security-minion**: unsubscribe token mechanism, email address handling
- **observability-minion**: Coralogix logging for email delivery events
- **frontend-minion**: notification preferences UI

One note: if the email templates need to include branding, responsive HTML email design, and cross-client compatibility, that is a specialized skill. The frontend-minion can handle simple HTML templates, but if production-quality responsive email templates are needed, consider whether React Email or MJML templating would be worth the dependency. My recommendation: start with hand-written HTML templates (the Helix Manifesto "lean and mean" principle applies) and only add a templating library if cross-client rendering issues emerge.
