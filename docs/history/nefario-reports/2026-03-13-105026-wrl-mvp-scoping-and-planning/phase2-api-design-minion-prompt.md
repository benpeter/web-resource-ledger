You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Scope and plan the WRL (Web Resource Ledger) minimum shippable product. The goal is the smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture.

## Your Planning Question
For an MVP with three core operations -- (1) capture a URL (submit + async result), (2) retrieve a capture by ID, (3) verify a capture's authenticity -- what is the minimal API surface? Specifically:
(a) What HTTP methods/endpoints?
(b) Should capture be synchronous or asynchronous (capture could take 5-30 seconds for rendering)? If async, what's the simplest polling/callback pattern?
(c) What does the verification endpoint look like -- does it return a boolean, a signed attestation, or a full proof bundle?
(d) What error model is appropriate for MVP (simple HTTP status codes vs structured error responses)?

Keep it minimal -- this is the foundation that everything else builds on top of.

## Context
Read these files for full context:
- /Users/ben/github/benpeter/web-resource-ledger/PRODUCT.md (API-first principle, verification endpoint description)
- /Users/ben/github/benpeter/web-resource-ledger/CLAUDE.md (KISS, <300ms latency target for uncached ops)

Note the latency target is for uncached operations -- capture itself will be async, but retrieval and verification must be fast (<300ms).

## Instructions
1. Read the files listed above
2. Design the minimal API surface for the three core operations
3. Consider sync vs async tradeoffs for capture
4. Design the verification endpoint response format
5. Return your contribution in the format below
6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-api-design-minion.md

## Domain Plan Contribution: api-design-minion

### Recommendations
<your minimal API surface design>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<API design risks>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
