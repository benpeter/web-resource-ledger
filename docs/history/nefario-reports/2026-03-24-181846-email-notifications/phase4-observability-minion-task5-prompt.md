## Task: Observability -- Alerts, Log PII Guard, and Documentation

You are adding observability infrastructure for the new email notification system. The logging statements themselves are already placed by the implementation tasks. Your job is the supporting infrastructure.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell

### Part A: Log PII Guard Update

Update src/log.js header comment to add email to the NEVER LOG list. The existing comment block lists fields that must never appear in logs. Add email addresses to this list.

Study the existing NEVER LOG list and add email addresses in the same style.

### Part B: Coralogix Alerts

Add two new alert definitions to scripts/provision-alerts.sh (study the existing alert definitions for the exact format):

Alert 1: [WRL] Email Delivery Failures
- Query: event:"email.send_fail" in app: wrl, subsystem: email
- Threshold: > 5 events in 30 minutes
- Priority: P2 (Medium)
- Retriggering: 60-minute suppression

Alert 2: [WRL] Email Bounces
- Query: event:"email.bounce" AND bounceType:"hard" in app: wrl, subsystem: email
- Threshold: > 3 events in 24 hours
- Priority: P3 (Low)
- Retriggering: 24-hour suppression

### Part C: Alert Documentation

Update docs/operations/alerts.md (if it exists; create it following the existing docs patterns if not) with the two new alerts. Follow the existing alert documentation format.

### Constraints
- Do NOT create runbooks (YAGNI at current scale)
- Do NOT modify the actual logging calls in email-dispatch.js
- Keep it minimal and lean

When you finish your task, report:
- File paths with change scope and line counts
- 1-2 sentence summary
