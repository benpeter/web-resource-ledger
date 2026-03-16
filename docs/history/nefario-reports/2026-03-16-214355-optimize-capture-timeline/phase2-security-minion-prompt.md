You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Optimize capture pipeline: consent timeout, graceful consent failure, adaptive settle.
Wrapping dismissCookieConsent() in try/catch so autoconsent bugs (like TypeError on adobe.com) don't crash the entire capture.

## Your Planning Question

Review the consent failure handling plan for evidence chain integrity:
1. Currently, dismissCookieConsent() in consent.js already has a top-level try/catch returning {status:'failed'}. But it's called from defaultRenderer() in capture.js line 474 without a try/catch. If the consent function throws an unexpected error (e.g., Playwright page methods throw after context close), the entire renderer fails.
2. The plan is to wrap the dismissCookieConsent(page) call in capture.js with try/catch, degrading to consentStatus:'failed' and continuing the capture.
3. Review whether this degradation path maintains evidence chain integrity in the WACZ bundle -- specifically, can auditors distinguish "consent library crashed" from "no CMP detected"?
4. Are there any error types from dismissCookieConsent that SHOULD abort the capture rather than being swallowed?

Read src/capture.js (especially lines 470-496) and src/consent.js for the full picture.

## Context

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/optimize-capture-timeline

## Instructions
1. Read src/capture.js and src/consent.js to understand the current error handling
2. Assess whether any errors from consent should propagate (vs. degrade gracefully)
3. Evaluate the evidence chain impact on WACZ bundle captureSettings
4. Provide specific recommendations for the try/catch implementation
5. Return your contribution in the structured format

## Domain Plan Contribution: security-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-H6iVro/optimize-capture-timeline/phase2-security-minion.md
