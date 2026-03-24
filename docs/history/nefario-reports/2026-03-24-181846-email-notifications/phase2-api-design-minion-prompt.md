You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
R36: Email notifications (operational + billing) for WRL (Web Resource Ledger).

Build an email notification system with 6 notification types (capture failure, approaching free limit, free limit reached, invoice generated, payment failure, weekly schedule digest), notification preferences API (GET/PUT /v1/tenant/notifications), HTML+plain text templates, and unsubscribe handling.

## Your Planning Question
Design the GET/PUT /v1/tenant/notifications API surface and backing D1 schema. How should the email address relate to GitHub OAuth identity (stored separately vs fetched from GitHub)? How should the unsubscribe endpoint work (signed token vs session auth)? Should notification event types use an allowlist or denylist model for opt-in? How should each of the six notification types integrate with existing code? Where should threshold checks (80%/100%) fire in quotas.js/index.js, and how to avoid duplicate notifications within a billing period? Should notification dispatch parallel the existing dispatchWebhooks pattern?

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell
- Read src/account.js for account API patterns
- Read migrations/ directory for schema patterns
- Read openapi.yaml for API contract style
- Read src/quotas.js for threshold check logic
- Read src/billing.js for Stripe webhook handler
- Read src/scheduler.js for cron scheduler
- Read src/webhook-dispatch.js for existing dispatch pattern
- Read src/index.js for queue consumer and routing

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

### Recommendations
(your expert recommendations)

### Proposed Tasks
(specific tasks with deliverables and dependencies)

### Risks and Concerns
(things that could go wrong)

### Additional Agents Needed
(or "None")

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-api-design-minion.md
