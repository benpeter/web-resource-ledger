You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Add minimum viable observability with Coralogix integration to a Cloudflare Worker that captures web pages and bundles them into signed WACZ archives.

Every capture pipeline failure, successful capture, and security event must be logged as structured JSON and shipped to Coralogix in real time.

Success criteria include security event logging for auth failures, SSRF blocks, and rate limit hits.

## Your Planning Question

The issue requires security event logging for auth failures, SSRF blocks, and rate limit hits.

1. What fields should security event logs contain beyond the common envelope -- should they include client IP, request path, or user-agent, and what are the information disclosure risks of logging these?
2. Should SSRF blocks log the rejected URL/hostname or just the rejection reason (balancing debuggability vs. leaking attacker probes)?
3. Are there additional security events in the current codebase that should be logged (e.g., Content-Type rejections, malformed JSON, scheme violations)?
4. Any concerns about the Coralogix send key being accessible in Worker code via env binding -- is the current secret pattern sufficient?

## Context

Read these files for codebase context:
- `src/index.js` -- all rejection points in handleCreateCapture
- `src/auth.js` -- auth failure paths
- `src/url-validation.js` -- SSRF rejection paths
- `wrangler.toml` -- secret binding pattern

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wUNrkM/mvo-coralogix-integration/phase2-security-minion.md`
