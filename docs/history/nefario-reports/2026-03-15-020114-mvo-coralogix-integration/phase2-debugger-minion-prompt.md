You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Add minimum viable observability with Coralogix integration to a Cloudflare Worker that captures web pages and bundles them into signed WACZ archives.

Structured JSON log calls need to be inserted at every capture pipeline stage (success and failure) in src/capture.js, and security event log calls for auth failures, SSRF blocks, and rate limit hits in src/index.js.

## Your Planning Question

Looking at `src/capture.js`, the pipeline has multiple error paths:
1. renderer rejection (categorizeError maps to user-safe messages)
2. R2 write failures (currently caught by outer try/catch)
3. WACZ bundling failure (caught and warned but capture completes)
4. KV completeCapture/failCapture failures (catch-all)

For each of these, where exactly should log() calls be inserted to capture stage-level granularity without disrupting the existing error flow? Should logging happen before or after KV status updates? Should the WACZ "completed without bundle" path log at warn vs. error severity? What about the catch-all at line 157-162 where both the original error and the KV write might fail?

## Context

Read these files for full context:
- `src/capture.js` -- full file, the main instrumentation target
- `src/kv.js` -- KV operations that could fail
- `src/index.js` -- auth/rate-limit/SSRF rejection points that need security event logging

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: debugger-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wUNrkM/mvo-coralogix-integration/phase2-debugger-minion.md`
