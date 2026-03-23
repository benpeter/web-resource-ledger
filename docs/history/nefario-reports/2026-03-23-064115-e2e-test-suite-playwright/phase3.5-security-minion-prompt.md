# Phase 3.5 Review Prompt: security-minion

You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase3-synthesis.md

## Your Review Focus
Security gaps in the e2e test suite plan:
- Credential handling (API keys, admin keys, webhook secrets in CI and test code)
- Test isolation (can test tenants interfere with production data?)
- Secret exposure risk (PR triggers, artifact uploads, log output)
- HMAC verification correctness (is the independent verification approach sound?)
- GitHub Actions security (environment protection, permission scoping, action pinning)

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-wXsjF2/e2e-test-suite-playwright/prompt.md

## Instructions
Return exactly one verdict:

- APPROVE: No concerns from your domain.

- ADVISE: Return warnings using this format for each concern:
  - [security]: <one-sentence description>
    SCOPE: <file, component, or concept affected>
    CHANGE: <what should change, in domain terms>
    WHY: <risk or rationale, self-contained>
    TASK: <task number affected>

- BLOCK: Return using this format:
  SCOPE: <file, component, or concept affected>
  ISSUE: <description of the blocking concern>
  RISK: <what happens if this is not addressed>
  SUGGESTION: <how the plan could be revised>

Be concise. Only flag issues within your domain expertise.

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase3.5-security-minion.md
