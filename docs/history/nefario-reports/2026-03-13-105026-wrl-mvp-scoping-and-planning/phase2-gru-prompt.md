You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Scope and plan the WRL (Web Resource Ledger) minimum shippable product. The goal is the smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture.

## Your Planning Question
Given the WRL product vision (capture web resources, store immutably with cryptographic proof, public verification), what is the current technology landscape for:
(a) Web archival bundle formats (WARC vs MHTML vs custom)
(b) Cryptographic timestamping approaches (RFC 3161 TSA vs blockchain-anchored vs simpler HMAC-based)
(c) Headless browser capture engines (Playwright vs Puppeteer vs lightweight alternatives)
(d) Immutable storage backends suitable for MVP (S3 with object lock vs R2 vs simpler file-hash-based approach)

For each, recommend the simplest viable option that doesn't close the door on legal admissibility later. Factor in the technology bias toward Fastly/Cloudflare edge platforms, JavaScript/TypeScript, and Helix/Franklin architecture patterns.

## Context
PRODUCT.md describes a full-featured capture/verification product. CLAUDE.md mandates Helix Manifesto principles (YAGNI, KISS, Lean and Mean). Technology bias: prefer Cloudflare/Fastly edge platforms, JS/TS (JS over TS where possible), Adobe-adjacent tech patterns. The signing approach needs to be upgradeable to legal-admissibility-grade later without rewriting the capture format.

## Instructions
1. Research the current state of each technology area
2. For each area, evaluate options on: simplicity, JS/TS ecosystem fit, Cloudflare/Fastly compatibility, path to legal admissibility
3. Recommend the simplest viable option for MVP with clear rationale
4. Identify risks, dependencies, and requirements from your perspective
5. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
6. Return your contribution in the format below
7. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-gru.md

## Domain Plan Contribution: gru

### Recommendations
<your expert recommendations for technology choices>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
