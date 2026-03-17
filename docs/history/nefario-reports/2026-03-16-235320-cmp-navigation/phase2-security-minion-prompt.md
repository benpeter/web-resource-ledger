You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Fix cross-domain navigation block to allow CMP consent iframes. The route handler in capture.js currently blocks ALL cross-domain navigation requests using `isNavigationRequest()`. This blocks CMP iframes (Sourcepoint, OneTrust, etc.) from loading, preventing autoconsent from detecting and dismissing cookie consent banners. The fix narrows blocking to main-frame only using `route.request().frame() === page.mainFrame()`.

## Your Planning Question

The route handler currently blocks ALL cross-domain `isNavigationRequest()` requests (the TOCTOU mitigation). The fix narrows this to main-frame only, allowing iframe navigations to cross-domain CMP origins. Given the existing security model (BrowserContext isolation, service workers blocked, single-tenant), what are the implications? Can a malicious page exploit cross-origin iframe navigations to exfiltrate data? Does the BBC same-site redirect (bbc.com -> bbc.co.uk) warrant same-registrable-domain allowlisting for top-level nav, or is the main-frame check sufficient? Are there iframe-based attacks the blanket block was implicitly preventing?

## Context

Key files to read:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cmp-navigation/src/capture.js (lines 52-66 for accepted gaps, lines 355-390 for route handler)

The existing security model already acknowledges (line 63-64): "Cross-origin iframe sub-navigation: iframes can navigate internally within their own origin; only top-level cross-origin navigations are blocked. Acceptable for the current single-tenant use case."

Evidence: 6/7 tested sites show consent=notDetected because CMP iframes are blocked by the route handler.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-E0Ctd0/cmp-navigation/phase2-security-minion.md
