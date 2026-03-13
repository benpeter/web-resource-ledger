You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a tested URL validation module (`src/url-validation.js`) for a Cloudflare Worker. The module validates URLs for SSRF safety before browser rendering. Its "users" are other modules in this codebase (primarily the capture endpoint).

## Your Planning Question

This module's "users" are the other modules in this codebase that will call it (primarily the capture endpoint in Step 3). What should the module's API shape look like for clarity and safety? Specifically:
- Should it return a result object (with the resolved IP for DNS pinning) or throw on invalid URLs?
- Should error messages be developer-facing (for debugging) or user-facing (for API responses)? Or both?
- How do we make the "pit of success" as wide as possible so callers cannot accidentally skip validation?
- The module needs to return both a pass/fail verdict AND a resolved IP address (for DNS pinning). What's the cleanest way to express this dual output?

## Context
- Existing error pattern: `problemResponse(status, detail)` using RFC 9457 (see src/responses.js)
- Plain JavaScript, ESM modules, no TypeScript
- YAGNI/KISS philosophy
- The module is internal -- consumed by the capture handler, not exposed directly to users
- DNS pinning requires passing the resolved IP to Browser Rendering downstream

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: ux-strategy-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase2-ux-strategy-minion.md`
