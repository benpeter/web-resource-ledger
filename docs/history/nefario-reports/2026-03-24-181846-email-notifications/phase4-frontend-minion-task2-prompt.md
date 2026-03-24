## Task: Email Templates and Dispatch Pipeline (Resend Integration)

You are building the email template system and the dispatch-to-delivery pipeline for WRL's notification system. This is a Cloudflare Workers project. Follow the existing patterns exactly -- study src/webhook-dispatch.js for the queue dispatch pattern and src/verify-page.js for HTML template patterns.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell

### Part A: Email Design Tokens

Create src/email/email-tokens.js -- a module exporting brand constants as plain strings for inline CSS in emails. Email clients strip style blocks and do not support CSS custom properties. All styles must be inlined.

Extract the hex values from src/design-system.css (read it to get the exact values). Export an object with colors, fonts, maxWidth, borderRadius. Use the actual values from the design system -- do not guess.

### Part B: Shared Email Layout

Create src/email/email-layout.js -- a function that wraps body HTML in a complete email document:

- DOCTYPE, html lang="en" with Outlook XML namespaces
- meta name="x-apple-disable-message-reformatting" for Apple Mail
- meta name="color-scheme" content="light" (light mode only)
- MSO conditional comments for Outlook font stacks
- Outer table for background, inner table for 600px container
- Header: "Web Resource Ledger" text (no image/logo)
- Content card: white background with border, body content injected here
- Footer: "Web Resource Ledger - Gerhard Benjamin Peter - Marburg, Germany", unsubscribe link, website link
- Hidden preheader div for inbox preview text

Function signature: emailLayout({ bodyHtml, unsubscribeUrl, preheaderText })

Use table role="presentation" for ALL layout. All styles inline. No CSS custom properties, no calc(), no rem units. Use px throughout.

Import escapeHtml from ../verify-page.js for escaping the unsubscribe URL and preheader text.

### Part C: Six Email Templates

Create one module per notification type in src/email/templates/. Each exports a function that takes a data object and returns { html, text, subject }.

1. src/email/templates/capture-failure.js
   - Data: { url, errorCategory, failedAt, captureDetailUrl, unsubscribeUrl }
   - Subject: Capture failed: {url}
   - Alert style with error color accent
   - CTA button: "View Capture Details" linking to captureDetailUrl

2. src/email/templates/approaching-limit.js
   - Data: { used, limit, period, addPaymentUrl, unsubscribeUrl }
   - Subject: Approaching free capture limit ({used}/{limit})
   - Warning style with warning color accent
   - CTA button: "Add Payment Method"

3. src/email/templates/limit-reached.js
   - Data: { used, limit, period, addPaymentUrl, unsubscribeUrl }
   - Subject: Free capture limit reached
   - Error style, more urgent than approaching-limit
   - CTA button: "Add Payment Method"

4. src/email/templates/invoice-generated.js
   - Data: { amountFormatted, currency, period, portalUrl, unsubscribeUrl }
   - Subject: Invoice generated: {amountFormatted} {currency}
   - Info style
   - CTA button: "View Invoice"

5. src/email/templates/payment-failure.js
   - Data: { gracePeriodEnd, portalUrl, unsubscribeUrl }
   - Subject: Payment failed -- action required
   - Error style, urgent
   - CTA button: "Update Payment Method"

6. src/email/templates/weekly-digest.js
   - Data: { periodStart, periodEnd, schedules: [{ url, total, succeeded, failed }], dashboardUrl, unsubscribeUrl }
   - Subject: Weekly capture digest: {periodStart} - {periodEnd}
   - Info style with a table showing schedule results
   - Cap at 20 schedules, include "View all in dashboard" link if more
   - CTA button: "Open Dashboard"

Template rules:
- HTML and plain text are built independently from the same data -- do NOT strip HTML to make plain text
- Plain text: key-value pairs, blank lines between sections, URLs written out, unsubscribe link at bottom
- All user-provided data (URLs, error categories) must be HTML-escaped in the HTML version
- CTA buttons built as table-based buttons (not styled a tags) for Outlook compatibility
- Every template includes a preheader appropriate to the notification
- No images -- text and colors only
- Keep total HTML under 80KB (Gmail clips at 102KB)

### Part D: Email Dispatch Module

Create src/email-dispatch.js following the src/webhook-dispatch.js pattern exactly. Three exported functions:

**dispatchNotification(env, tenantId, eventType, templateData)**:
1. Query notification_preferences: check email_verified=1 AND notify_{eventType}=1
2. If email not configured/verified or type opted out: log email.dispatch_suppressed with suppressionReason and return
3. For threshold notifications (approaching_limit, limit_reached): check notification_sent table for dedup. If already sent for this period, log suppressed and return
4. For capture_failure: Also use notification_sent dedup with a short period key (e.g., date + hour) to limit to 3 per hour per tenant. If already at limit, suppress.
5. Build email payload: render the template, generate unsubscribe token (import from src/unsubscribe.js)
6. Enqueue to EMAIL_QUEUE: { tenantId, notificationType, to, subject, html, text, unsubscribeUrl }
7. For threshold notifications: insert notification_sent row BEFORE returning (pre-enqueue dedup)
8. Log email.dispatch with tenantId, notificationType, and correlation context

IMPORTANT: dispatchNotification must NEVER throw. It must handle ALL errors internally with try/catch and logging. Callers use ctx.waitUntil(dispatchNotification(...)) and need it to always resolve.

**handleEmailMessage(msg, env, ctx)** (queue consumer):
1. POST to https://api.resend.com/emails with direct fetch (NO Resend SDK):
   - from: 'WRL <notifications@webresourceledger.com>'
   - to: [msg.body.to]
   - subject, html, text from message body
   - headers: List-Unsubscribe and List-Unsubscribe-Post (RFC 8058)
2. On 2xx: ack, log email.send with emailId (from Resend response), durationMs
3. On 422/400 (permanent failure): ack, log email.send_fail. Do NOT retry.
4. On 401/403 (API key issue): ack, log email.send_fail at severity 5. Do NOT retry.
5. On 429: msg.retry() with backoff, log email.send_fail
6. On 5xx: msg.retry() with backoff, log email.send_fail
7. On network error: msg.retry(), log email.send_fail

IMPORTANT: Queue messages contain the email address (PII). Add a code comment: "// NOTE: Queue messages contain tenant email (PII). Never log msg.body.to."

Error classification: follow the classifyDeliveryError pattern from webhook-dispatch.js.

**handleEmailDlqMessage(msg, env, ctx)** (DLQ consumer):
- Log email.send_dlq at severity 5 with tenantId, notificationType, totalAttempts
- Ack

### Part E: Queue Configuration in wrangler.toml

Add to wrangler.toml (production):
```toml
# Email delivery queue
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

Add staging equivalents with -staging suffix and max_concurrency = 2.

Add secret comment:
```toml
# Email sending (set via wrangler secret put):
#   RESEND_API_KEY -- Resend API key for transactional email delivery
```

IMPORTANT: After modifying wrangler.toml, also regenerate wrangler.test.toml by copying wrangler.toml and removing ALL [[queues.consumers]] sections. Queue consumers cause miniflare to auto-consume messages during tests. CI will fail if wrangler.test.toml is stale.

### Part F: Wire Queue Consumer in index.js

Add email queue routing to the queue() handler in src/index.js. Study the existing queue routing pattern. Add handling for the email queue and email DLQ queue names.

Import handleEmailMessage, handleEmailDlqMessage from email-dispatch.js.

### Part G: Tests

Write test/email-dispatch.test.js following the patterns in test/webhook-dispatch.test.js:
- dispatchNotification skips when email not verified
- dispatchNotification skips when notification type opted out
- dispatchNotification skips when already sent for period (dedup)
- dispatchNotification enqueues when all checks pass
- handleEmailMessage acks on 2xx
- handleEmailMessage acks without retry on 422 (permanent failure)
- handleEmailMessage retries on 429
- handleEmailMessage retries on 5xx
- handleEmailDlqMessage logs and acks
- RFC 8058 headers (List-Unsubscribe, List-Unsubscribe-Post) are asserted in the request

Write test/email-templates.test.js:
- Each template returns { html, text, subject }
- HTML contains required elements (heading, CTA link, unsubscribe link)
- HTML escapes user-provided data (test with script tag in URL)
- Plain text includes all key data points
- Plain text includes unsubscribe URL
- Weekly digest caps at 20 schedules

### Constraints
- Do NOT add the Resend npm package -- use direct fetch()
- Do NOT implement email verification sending
- Do NOT create a notification_log table (YAGNI -- logs-only)
- Do NOT implement Resend bounce webhooks
- NEVER log email addresses -- log tenantId only
- Every catch block must log or handle a specific error -- no silent catches
- All code in plain JavaScript, following existing style

When you finish your task, report:
- File paths with change scope and line counts
- 1-2 sentence summary
- Approach chosen and alternatives rejected
