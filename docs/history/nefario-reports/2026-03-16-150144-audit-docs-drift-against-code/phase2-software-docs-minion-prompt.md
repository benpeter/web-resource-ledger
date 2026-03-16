You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Audit documentation for drift against recent code changes

**Outcome**: All project documentation accurately reflects the current state of the codebase after recent issues and PRs, so that developers and users aren't misled by stale instructions, outdated API references, or missing coverage for new features.

**Scope**:
- In: All documentation in the repo (README, docs/, inline API docs, configuration references), recent closed issues and merged PRs as the change source
- Out: Evolution log history (those are historical records, not living docs), external documentation hosted outside this repo

## Your Planning Question
Assess whether the project's technical documentation (MVP.md, PRODUCT.md, openapi.yaml) accurately represents the current architecture and API surface. MVP.md and PRODUCT.md were written before implementation -- how should they be updated (or archived) now that the system is built and Act 1 is complete? Should MVP.md become a historical artifact (moved to evolution log or marked clearly as "implemented, see backlog.md for current state")? Should PRODUCT.md be updated to reflect the implemented product? What is the right documentation structure going forward given that `docs/backlog.md` now serves as the living roadmap?

## Context
Key files to read: `PRODUCT.md`, `MVP.md`, `docs/backlog.md`, `docs/evolution/README.md`

The project has 9 implemented routes:
1. POST /v1/captures (create capture)
2. GET /v1/captures/:id (retrieve capture metadata)
3. GET /v1/captures/:id/artifacts/:filename (retrieve capture artifact)
4. GET /v1/captures (list captures)
5. GET /.well-known/signing-key (current public key)
6. GET /.well-known/signing-keys (key archive)
7. GET /health (health check)
8. GET /verify (static verification page)
9. OPTIONS * (CORS preflight)

PRODUCT.md is a pre-implementation vision document. MVP.md is a pre-implementation spec.
docs/backlog.md is the living roadmap. docs/evolution/ contains phase-by-phase build records.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: software-docs-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase2-software-docs-minion.md
