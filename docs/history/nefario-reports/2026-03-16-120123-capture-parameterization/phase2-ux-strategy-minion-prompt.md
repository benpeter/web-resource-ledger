You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed
into a team recommendation, not an execution plan. Focus on analysis,
trade-offs, and recommendations rather than implementation tasks.

## Project Task

Evaluate whether WRL (Web Resource Ledger) should support parameterized capture requests — allowing API callers to control browser behavior during web page capture. WRL is a web evidence/archival service running on Cloudflare Workers with Playwright-based browser rendering. It captures web pages (HTML + screenshot + metadata) and stores them in R2 with Ed25519 signatures for integrity. Currently, every capture starts with a completely blank browser session.

## Your Planning Question

WRL positions itself as an "evidence" product. Cookie consent banners currently dominate every screenshot, degrading capture fidelity. How should we think about the tension between "clean slate = reproducible evidence" and "parameterized = higher fidelity but caller-influenced"? What user jobs-to-be-done does parameterization serve, and which parameter categories (cookie handling, viewport, wait conditions, session injection) have the highest impact on the core evidence use case? Should WRL distinguish between "neutral" parameters (viewport size) and "opinion" parameters (cookie consent choice) in how they affect the evidence claim?

## Context

Current capture pipeline (src/capture.js) uses fixed 1280x720 viewport, no cookie handling, no session state. The product positions WRL as "capture a URL, store it immutably, let a third party verify." Backlog parking lot has two capture fidelity items: "Screenshot timing / wait-for-load" and "Screenshot height cap configurability" -- both with demand-driven triggers. The 0017 prompt identifies cookie consent banners as "the single biggest fidelity issue for screenshots."

Read the following files for additional context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/capture.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/docs/backlog.md

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
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

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-ux-strategy-minion.md
