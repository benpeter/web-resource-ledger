You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed
into a team recommendation, not an execution plan. Focus on analysis,
trade-offs, and recommendations rather than implementation tasks.

## Project Task

Evaluate whether WRL (Web Resource Ledger) should support parameterized capture requests — allowing API callers to control browser behavior during web page capture. WRL is a web evidence/archival service running on Cloudflare Workers with Playwright-based browser rendering.

## Your Planning Question

What attack surface does capture parameterization open? Specifically evaluate: (1) Cookie/session injection as a vector for capturing authenticated content the API caller shouldn't access (e.g., injecting stolen session cookies). (2) Arbitrary JavaScript execution via wait-for conditions or page manipulation. (3) CSS injection or DOM manipulation to alter what the "evidence" shows. (4) Resource exhaustion via viewport size parameters (e.g., 10000x10000 viewport). (5) How do these risks differ between single-tenant (current) and multi-tenant (R12 planned) deployments? What's the minimum set of security constraints that would make parameterization safe?

## Context

Current security model: SSRF prevention via URL validation (src/url-validation.js), BrowserContext isolation per capture, cross-domain navigation blocking, subresource limits (200), page size limits (50MB), Set-Cookie redaction in captured headers, service workers blocked. Auth is single API key (src/auth.js), multi-tenant planned as R12. Playwright BrowserContext accepts cookies, localStorage, viewport, and other options at creation time. The capture runs in ctx.waitUntil() with a ~30s budget.

Read the following files for additional context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/capture.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/url-validation.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/auth.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/index.js

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-security-minion.md
