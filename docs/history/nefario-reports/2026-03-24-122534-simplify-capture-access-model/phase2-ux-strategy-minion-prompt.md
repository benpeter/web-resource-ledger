You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Phase 0062 added tenant auth to all capture GET endpoints, which broke the public verify page, CLI verifier, and the "anyone can verify" value proposition. The proposal is to simplify the access model by making individual capture access public (128-bit IDs as capability tokens), keeping list endpoint authed, and removing the share token system entirely.

## Your Planning Question
The "anyone can verify" proposition is the entire motivation for this change. Does simplifying the access model actually improve the user journey for third-party verifiers (no auth, no share tokens, just a URL)?

Specifically:
(a) User journey for third-party verifiers: how does the experience change? Currently they need a share token or authenticated access — after this change, they just need the capture URL.
(b) User journey for tenants who used share tokens for controlled sharing: what do they lose? Is the loss acceptable given that capture IDs have 128-bit entropy?
(c) The verify page (GET /v1/verify/{id}) shows capture metadata and allows downloading WACZ artifacts. With individual capture access becoming public, the verify page can fetch capture data directly. Does this simplify the verify page's implementation/UX?
(d) Are there any cognitive load concerns — will users understand that "knowing the capture ID = having access"?

## Context
Read these files:
- src/verify-page.js or similar (verify page implementation)
- test/e2e/verify-page.spec.js (the E2E test to understand current UX flow)
- SECURITY.md (current model documentation)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: ux-strategy-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-ux-strategy-minion.md`
