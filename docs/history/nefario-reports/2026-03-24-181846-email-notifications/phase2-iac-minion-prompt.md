You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
R36: Email notifications (operational + billing) for WRL (Web Resource Ledger).

Build an email notification system with 6 notification types (capture failure, approaching free limit, free limit reached, invoice generated, payment failure, weekly schedule digest), notification preferences API (GET/PUT /v1/tenant/notifications), HTML+plain text templates, and unsubscribe handling. Email delivery via Resend or Cloudflare Email Workers.

## Your Planning Question
What is the recommended architecture for email sending from a Cloudflare Worker? Evaluate Resend vs Cloudflare Email Workers — which integrates better with the existing queue-based dispatch pattern? Should email delivery use a dedicated queue or the existing webhook queue? How should the Resend API key be provisioned (wrangler secret)? What are the rate limits and failure modes to plan for?

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell
- Read wrangler.toml for queue architecture and existing bindings
- Read src/webhook-dispatch.js for the existing dispatch pattern
- Read src/index.js for the queue consumer pattern
- The project uses a single Cloudflare Worker with D1, R2, KV, and Queues
- Resend free tier: 100 emails/day

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: iac-minion

### Recommendations
(your expert recommendations for this aspect of the task)

### Proposed Tasks
(specific tasks that should be in the execution plan)
For each task: what to do, deliverables, dependencies

### Risks and Concerns
(things that could go wrong from your domain perspective)

### Additional Agents Needed
(any specialists not yet involved who should be, and why)
(or "None" if the current team is sufficient)

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-iac-minion.md
