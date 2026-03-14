MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
## Goal
Browser-accessible verification page for non-technical users.

## Context
Retrieval endpoint exists (Step 5 complete). The verification API contract from Step 6 is the dependency for the page's data shape — Step 7 can be developed in parallel with Step 6 once that contract is stable. This step makes verification accessible to anyone with a browser, not just developers with curl.

## Work Items
- [ ] Content negotiation in Worker: if `Accept` header includes `text/html`, serve HTML instead of JSON for `GET /v1/verify/{id}`
- [ ] Single HTML file with vanilla JS: calls `GET /v1/verify/{id}` API, renders result
- [ ] Rendered result shows: URL, capture timestamp, SHA-256 bundle hash, verified/unverified badge, screenshot inline
- [ ] `<noscript>` fallback: shows capture ID and a direct link to the JSON API endpoint
- [ ] No framework, no build step, no external dependencies; inlined CSS only

## Acceptance Criteria
- Open verification URL in a browser — result renders with verified badge and screenshot
- Disable JS in browser — `<noscript>` fallback shows capture ID and a direct API link
- Zero external HTTP requests from the page (no CDN fonts, no analytics, no external scripts)

## Dependencies
- Blocked by: #5 (needs capture data shape)
- Blocks: none
- Note: NOT blocked by #6 — can be developed in parallel once the Step 6 API contract (`/v1/verify/{id}` response shape) is known

## Technical Notes
- This is NOT a server-side rendered page — the `<noscript>` fallback (capture ID + API link) is the accessibility floor, not full SSR
- Content negotiation keeps the Worker entry point as the single routing layer — no separate static hosting needed
- Inlined CSS only: the page must be a single self-contained HTML string returned by the Worker, with no external stylesheet or script dependencies
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan
(see your Core Knowledge for the output format).

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase1-metaplan.md`
