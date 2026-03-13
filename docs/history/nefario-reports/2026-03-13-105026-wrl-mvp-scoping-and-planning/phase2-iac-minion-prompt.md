You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Scope and plan the WRL (Web Resource Ledger) minimum shippable product. The goal is the smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture.

## Your Planning Question
For an MVP that needs: (a) an HTTP API server (Node.js/JS), (b) a headless browser for page capture, (c) immutable blob storage for capture artifacts, and (d) a public verification endpoint -- what is the simplest deployment architecture? Consider:
- Should this be a single containerized service or split?
- Can we use Cloudflare Workers / R2 for any of this?
- What's the cheapest way to run headless Chrome in the cloud?
- Does the MVP need CI/CD from day one, or is manual deployment acceptable?
- Factor in the preference for Fastly/Cloudflare edge platforms and the <300ms latency target.
- Aim for the architecture that a single developer can operate.

## Context
Read these files for full context:
- /Users/ben/github/benpeter/web-resource-ledger/PRODUCT.md (storage requirements, latency target)
- /Users/ben/github/benpeter/web-resource-ledger/CLAUDE.md (ops reliability wins, lean and mean)

Emphasis: single-developer operability is a hard constraint for MVP. The <300ms latency target applies to uncached retrieval and verification, not to capture itself.

## Instructions
1. Read the files listed above
2. Evaluate deployment options against the constraints
3. Recommend the simplest architecture that meets the requirements
4. Return your contribution in the format below
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-iac-minion.md

## Domain Plan Contribution: iac-minion

### Recommendations
<your deployment architecture recommendation>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<infrastructure risks>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
