MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

R36: Email notifications (operational + billing)

Outcome: WRL sends transactional email notifications to tenants for key operational and billing events. Tenants receive timely alerts for capture failures, billing milestones, and schedule digests. Each tenant configures their notification preferences (email address, event types). All emails include an unsubscribe link and use clean, brand-consistent templates.

Success criteria:
- Email delivery via Resend or Cloudflare Email Workers (no self-hosted SMTP)
- Notification types implemented:
  - Capture failure: URL, timestamp, error category, link to capture detail
  - Approaching free limit: triggered at 80/100 free captures, includes current usage and prompt to add payment method
  - Free limit reached: triggered at 100/100, includes link to add payment method
  - Invoice generated: triggered when $5 threshold reached and invoice finalized, includes amount and link to Stripe Customer Portal
  - Payment failure: triggered on Stripe payment_failed webhook, includes grace period deadline and link to update payment method
  - Weekly schedule digest: URLs captured, success/failure count, next scheduled runs
- Per-tenant notification preferences stored (email address, opted-in event types)
- Preferences configurable via API endpoint (GET/PUT /v1/tenant/notifications)
- Every email includes a one-click unsubscribe link (RFC 8058 List-Unsubscribe-Post header)
- Email templates: plain text and HTML versions for each notification type
- HTML templates use vanilla HTML/CSS (inline styles for email compatibility), no framework
- Email delivery failures logged with tenant context

Scope:
- In: Email sending infrastructure, notification preference API, six notification types, HTML + plain text templates, unsubscribe handling
- Out: SMS/push notifications, real-time in-app notifications, email analytics/tracking pixels, custom notification rules, digest frequency configuration beyond weekly

Constraints:
- Depends on R24 (tenant identity must include email address)
- Depends on R26 (free limit enforcement must emit threshold events)
- Depends on R28 (scheduled captures must exist for digest)
- Depends on R29 (Stripe webhooks for billing events: invoice finalized, payment failed)
- Must comply with CAN-SPAM / GDPR: unsubscribe in every email, no email without opt-in
- Resend free tier (100 emails/day) sufficient for initial scale; evaluate limits before launch

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase1-metaplan.md
