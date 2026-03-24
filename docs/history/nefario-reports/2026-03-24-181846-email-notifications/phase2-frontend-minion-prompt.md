You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
R36: Email notifications (operational + billing) for WRL (Web Resource Ledger).

Build HTML + plain text email templates for 6 notification types: capture failure, approaching free limit, free limit reached, invoice generated, payment failure, weekly schedule digest. Templates must use vanilla HTML/CSS with inline styles for email client compatibility.

## Your Planning Question
What is the right approach for HTML email templates in a Workers context (no filesystem)? Template strings vs pre-compiled HTML? How to structure shared header/footer with inline CSS for email client compatibility? How to generate both HTML and plain text from the same data model? What email client quirks should we plan for (Outlook, Gmail, Apple Mail)?

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/toasty-yawning-newell
- Read src/verify-page.js for existing HTML-in-JS pattern
- Read src/ui/ directory for existing design patterns and CSS
- Read src/design-system.css or similar for brand colors/styles
- Workers runtime: no filesystem, no Node.js modules like fs
- Templates must produce both HTML and plain text versions

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: frontend-minion

### Recommendations
(your expert recommendations)

### Proposed Tasks
(specific tasks with deliverables and dependencies)

### Risks and Concerns
(things that could go wrong)

### Additional Agents Needed
(or "None")

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9FzqZh/email-notifications/phase2-frontend-minion.md
