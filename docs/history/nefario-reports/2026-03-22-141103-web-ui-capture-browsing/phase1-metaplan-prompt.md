MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
**Outcome**: WRL is demonstrable without a terminal — evaluators can try it by clicking a link, significantly lowering the barrier to first experience.

**Success criteria**:
- Browser-based interface for submitting a URL and viewing capture status
- Capture list view showing recent captures with status
- Capture detail view with verification status, screenshot, metadata
- Auth flow for web (API key input or session-based)
- Works on mobile browsers
- No JavaScript framework — vanilla HTML/JS/CSS per project philosophy

**Scope**:
- In: Capture submission form, capture list view, capture detail view, auth flow, responsive design
- Out: Admin dashboard, user management UI, advanced search, offline support

**Constraints**:
- R1 (list endpoint) and R3 (CORS) must ship first
- Should ship after Act 1 is complete — a web UI on top of sharp edges invites negative first impressions
- Vanilla JS/CSS/HTML only (project philosophy: no frameworks unless demonstrably needed)
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/steady-singing-eagle

## Codebase Context

This is a Cloudflare Worker (vanilla JS, no TypeScript) that captures web pages for evidentiary purposes. Key infrastructure:

- **Runtime**: Cloudflare Workers with D1 (SQLite), R2 (object storage), KV (key-value), Browser API
- **Auth**: Bearer token API keys (SHA-256 hashed, stored in D1 via KV migration)
- **Design system**: Already exists in src/design-system.css and src/design-system.js (CSS custom properties for colors, typography, spacing, etc.)
- **Existing HTML page**: src/verify-page.js serves an HTML verification page — this is the pattern for serving HTML from the worker
- **Brand assets**: src/assets/ contains favicon.svg, logo-doc-check.svg, logo-w-check.svg
- **CORS**: Already implemented via CORS_ORIGINS env var in wrangler.toml
- **API endpoints that the UI would consume**:
  - POST /v1/captures — create capture (auth required)
  - GET /v1/captures — list captures with pagination, status filter, url filter (auth required)
  - GET /v1/captures/:id — get capture detail (no auth, ID is secret)
  - GET /v1/captures/:id/status — polling endpoint for capture progress
  - GET /v1/captures/:id/artifacts/:type — get screenshot, HTML, headers, WACZ
  - GET /v1/verify/:id — verification page (already HTML)
- **Routes**: Defined in src/index.js as regex patterns in a routes array
- **Response pattern**: problemResponse() for errors, jsonResponse() for success

## External Skill Discovery
No external skills found in .claude/skills/ or .skills/.

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills discovered.
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase1-metaplan.md`
