MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
R36: Email notifications (operational + billing) for WRL (Web Resource Ledger).

Build an email notification system with 6 notification types (capture failure, approaching free limit, free limit reached, invoice generated, payment failure, weekly schedule digest), notification preferences API, HTML+plain text templates, and unsubscribe handling. Email delivery via Resend.

Success criteria:
- Email delivery via Resend (not self-hosted SMTP)
- 6 notification types implemented
- Per-tenant notification preferences stored (email, opted-in event types)
- Preferences configurable via API endpoint (GET/PUT /v1/account/notifications)
- RFC 8058 one-click unsubscribe in every email
- HTML + plain text templates with vanilla HTML/CSS
- Email delivery failures logged with tenant context

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-observability-minion.md

## Key consensus across specialists:

### iac-minion
- Use Resend (CF Email Workers not GA); dedicated queue pair wrl-emails/wrl-emails-dlq with max_concurrency=5
- Resend API key as wrangler secret; domain verification (SPF/DKIM/DMARC) is a blocking prerequisite
- 100/day free tier may be too tight for production

### api-design-minion
- Use /v1/account/notifications (not /v1/tenant/) to match existing auth gate
- Opt-out model (all on by default, gated by email verification)
- HMAC unsubscribe tokens using SESSION_SECRET
- notification_preferences + notification_sent tables in D1
- Capture failure rate limiting via KV (5-min window, max 3 then digest)

### frontend-minion
- Template literals in JS modules (same pattern as verify-page.js)
- src/email/ directory with tokens, layout, and per-type templates
- Resolved design tokens (no CSS custom properties in email)
- Table-based layout, all inline styles

### security-minion
- HMAC-SHA256 unsubscribe with purpose prefix (unsub.)
- GET renders confirmation page, POST performs action
- Per-tenant per-category cooldown is non-optional
- No account deletion endpoint (pre-existing GDPR gap, document but don't block)
- Email validation at storage time (regex + CRLF rejection)

### observability-minion
- 7 structured log events under "email" subsystem
- Logs-only delivery status (no D1 table)
- 2 Coralogix alerts: delivery failures (P2) and bounces (P3)
- Correlate via natural identifiers (captureId, stripeEventId, period)

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions (read the scratch files)
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format with:
   - Numbered tasks with agent assignments, model selection, and dependencies
   - Approval gates where needed (max 3-5)
   - Self-contained prompts for each task
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase3-synthesis.md

IMPORTANT: The working directory is /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell

Keep the plan focused and lean. This is a Cloudflare Worker project following the Helix Manifesto (YAGNI, KISS, lean and mean). Prefer fewer, larger tasks over many small ones. Target 4-6 execution tasks max.
