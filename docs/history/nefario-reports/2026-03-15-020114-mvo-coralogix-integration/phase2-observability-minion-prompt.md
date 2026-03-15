You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Add minimum viable observability with Coralogix integration to a Cloudflare Worker that captures web pages and bundles them into signed WACZ archives.

Every capture pipeline failure, successful capture, and security event must be logged as structured JSON and shipped to Coralogix in real time. The Coralogix integration must ship with this work, not deferred.

Success criteria:
- Every capture pipeline stage failure (browser render, R2 write, KV write, WACZ bundling, signing) emits a structured JSON log with captureId, stage name, error category, and retryable flag
- Every successful capture emits a structured log with captureId, total duration, WACZ success/fail, and bundle size
- Auth failures, SSRF blocks, and rate limit hits each emit a security event log
- All log entries shipped to Coralogix via REST ingestion using non-blocking fetch() in waitUntil — Coralogix failures swallowed
- CORALOGIX_ENDPOINT configured as [vars] entry in wrangler.toml
- Log helper is a single function under 30 lines with no external dependencies
- All existing tests pass, no new npm dependencies

## Your Planning Question

Given a Cloudflare Worker with a multi-stage capture pipeline (browser render, R2 write, KV write, WACZ bundling, signing) running inside ctx.waitUntil(), how should structured log events be designed for Coralogix REST ingestion? Specifically:

1. What fields belong in every log entry (common envelope) vs. stage-specific fields?
2. What severity levels map to pipeline failures vs. security events vs. success?
3. How should the log() helper be structured to stay under 30 lines while supporting captureId, stage, error category, retryable flag, duration, and bundle size?
4. What Coralogix-specific fields are required in the REST payload (applicationName, subsystemName, severity)?

The constraint is: single function, no external dependencies, JSON.stringify + fetch(), fire-and-forget in waitUntil, Coralogix failures swallowed silently.

## Context

Read these files for codebase context:
- `src/capture.js` -- pipeline stages and error handling
- `src/index.js` -- auth/rate-limit/SSRF rejection points
- `src/responses.js` -- existing response helpers pattern
- `wrangler.toml` -- current bindings
- Coralogix REST ingestion API: POST to endpoint with JSON body, Authorization: Bearer <send-key>

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: observability-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wUNrkM/mvo-coralogix-integration/phase2-observability-minion.md`
