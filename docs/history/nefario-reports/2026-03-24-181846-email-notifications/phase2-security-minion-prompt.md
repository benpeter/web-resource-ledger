You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
R36: Email notifications (operational + billing) for WRL (Web Resource Ledger).

Build an email notification system that stores tenant email addresses, sends transactional emails, and provides an unauthenticated unsubscribe endpoint. Must comply with CAN-SPAM and GDPR.

## Your Planning Question
What security considerations apply to this notification system? Specifically:
1. Signed unsubscribe URL design (HMAC vs opaque token) — how to make tamper-proof
2. PII risks of storing email addresses in D1
3. GDPR implications (right to deletion, consent tracking)
4. Email injection prevention (header injection, content injection)
5. Rate limiting on notification dispatch to prevent abuse
6. Information leakage in notification content (what capture details are safe to include in emails)
7. Unsubscribe endpoint — unauthenticated surface area risks

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell
- Read src/webhook-signing.js for existing HMAC pattern
- Read src/auth.js for authentication model
- Read src/index.js for route patterns
- Existing auth: GitHub OAuth + API keys (tenant-scoped)
- Email addresses are new PII — not currently stored anywhere

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
(your expert recommendations)

### Proposed Tasks
(specific tasks with deliverables and dependencies)

### Risks and Concerns
(things that could go wrong)

### Additional Agents Needed
(or "None")

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-security-minion.md
