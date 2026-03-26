You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build an admin dashboard for operator visibility into tenant overviews, per-tenant usage, tier consumption — replacing manual D1 queries for operational awareness.

Success criteria:
- Dashboard shows: list of all tenants, per-tenant capture counts (current period and historical), tier/plan info, usage vs. limits
- Data is live from D1 (not cached snapshots)
- Protected by admin authentication
- Loads in under 2 seconds

## Your Planning Question
The existing WRL web UI is a vanilla JS SPA with hash routing, design system CSS tokens, and modular view files. The admin dashboard needs a separate entry point (operators are not regular users). How should the admin UI be structured? Options: (A) a new route within the existing `/ui` SPA (gated by admin auth), (B) a separate `/admin` endpoint serving its own HTML shell, (C) a new section in the existing shell with admin-only nav. Consider: admin auth uses `verifyAdminKey` (Bearer token), not session cookies. The existing UI uses session auth or API key dual auth. Must use vanilla JS (no frameworks), reuse the design system, and load in <2s.

## Context
Read these files for context:
- src/ui/ui-shell.js (existing UI shell)
- src/design-system.css (design system tokens)
- src/index.js (route table)
- Auth patterns in src/auth.js

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the structured format below
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase2-frontend-minion.md

## Domain Plan Contribution: frontend-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed
