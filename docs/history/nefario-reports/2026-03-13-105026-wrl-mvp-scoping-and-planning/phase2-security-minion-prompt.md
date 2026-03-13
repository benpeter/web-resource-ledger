You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Scope and plan the WRL (Web Resource Ledger) minimum shippable product. The goal is the smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture.

## Your Planning Question
For an MVP capture service that accepts URLs from users and renders them in a headless browser:
(a) What are the critical security risks (SSRF via user-supplied URLs, headless browser sandbox escapes, etc.) that MUST be addressed even in MVP?
(b) What is the minimum viable auth model -- API keys, or can MVP be unauthenticated with rate limiting?
(c) For the cryptographic signing of captures, what is the simplest signing approach that provides meaningful integrity guarantees without requiring a full PKI or timestamping authority?
(d) Does the verification endpoint need any protection, or should it be fully public?

Distinguish between "must have for MVP" and "should add before production."

## Context
Read these files for full context:
- /Users/ben/github/benpeter/web-resource-ledger/PRODUCT.md (signing/hashing, verification endpoint, legal admissibility as future goal)
- /Users/ben/github/benpeter/web-resource-ledger/CLAUDE.md (engineering philosophy)

Emphasis: URL rendering in a headless browser is a significant attack surface. The signing approach needs to be upgradeable to legal-admissibility-grade later without rewriting the capture format.

## Instructions
1. Read the files listed above
2. Threat model the URL capture flow
3. Identify non-negotiable security controls for MVP
4. Recommend the simplest signing approach that's upgradeable
5. Return your contribution in the format below
6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase2-security-minion.md

## Domain Plan Contribution: security-minion

### Recommendations
<your security analysis and recommendations>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<security risks and threat model>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
