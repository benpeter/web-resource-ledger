You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
R36: Email notifications (operational + billing) for WRL (Web Resource Ledger).

Build an email notification system with 6 notification types. Need logging and alerting for email delivery success/failure, bounce handling, and unsubscribe events.

## Your Planning Question
How should email delivery events be logged and monitored? Specifically:
1. What log events should be emitted (send, delivered, failed, bounced, unsubscribed)?
2. How to integrate with the existing Coralogix logging pattern (src/log.js)?
3. What alerting thresholds make sense for email delivery failures?
4. Should delivery status be stored in D1 for tenant visibility, or logs-only?
5. How to correlate email events with the originating capture/billing event?

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell
- Read src/log.js for existing Coralogix logging pattern
- Read src/webhook-dispatch.js for existing delivery logging
- Read wrangler.toml for environment configuration
- Coralogix is the observability platform

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: observability-minion

### Recommendations
(your expert recommendations)

### Proposed Tasks
(specific tasks with deliverables and dependencies)

### Risks and Concerns
(things that could go wrong)

### Additional Agents Needed
(or "None")

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-observability-minion.md
