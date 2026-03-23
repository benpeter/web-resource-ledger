# Phase 3.5 Review Prompt: test-minion

You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase3-synthesis.md

## Your Review Focus
Test architecture, coverage, and reliability:
- Test isolation: can tests run independently without ordering dependencies?
- Flakiness risk: are timeouts, polling, and retry strategies adequate for staging latency?
- Coverage gaps: are critical user journeys covered? Are edge cases handled?
- Test infrastructure: is global setup/teardown robust? What happens on partial failure?
- Playwright config: are settings appropriate for CI and local development?
- Time budget: will 6 tests fit within 5 minutes given staging latency?

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-wXsjF2/e2e-test-suite-playwright/prompt.md

## Instructions
Return exactly one verdict:

- APPROVE: No concerns from your domain.

- ADVISE: Return warnings using this format for each concern:
  - [testing]: <one-sentence description>
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

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase3.5-test-minion.md
