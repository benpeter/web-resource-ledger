You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a tested URL validation module (`src/url-validation.js`) for a Cloudflare Worker. This is the most security-critical module in the system -- it validates URLs before browser rendering to prevent SSRF attacks.

## Your Planning Question

What documentation does a security-critical validation module need?
- Should the module have inline JSDoc documenting each check and why it exists?
- Should there be a standalone doc listing all blocked vectors (useful for security audits)?
- What level of documentation makes this module auditable by someone who did not write it?
- The project follows YAGNI/KISS -- how do we balance minimal docs with security auditability?

## Context
- No existing documentation beyond code comments and CLAUDE.md
- Evolution log exists in docs/evolution/ tracking build phases
- Tests serve as executable documentation of bypass vectors
- Plain JavaScript, no TypeScript (so no type-level documentation)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase2-software-docs-minion.md`
