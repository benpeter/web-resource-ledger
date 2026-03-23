# Phase 3.5 Review Prompt: margo

You are reviewing a delegation plan before execution begins.
Your role: identify over-engineering, YAGNI violations, dependency bloat, and unnecessary complexity.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase3-synthesis.md

## Your Review Focus
- Over-engineering: Are any tasks more complex than necessary? Can anything be simplified?
- YAGNI: Are any features or infrastructure being built speculatively?
- Dependency bloat: Is `@playwright/test` the only new dependency? Are there unnecessary abstractions?
- Operational burden: Does the test suite add maintenance overhead disproportionate to its value?
- Scope creep: The original issue asked for 6 tests. The plan has 6 tests but some differ from the original list. Is this justified or is it scope expansion?

IMPORTANT: The complete feature set has been approved by the product owner. Focus on IMPLEMENTATION simplicity within each feature, not whether features should exist. Do NOT argue against features in the active roadmap.

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-wXsjF2/e2e-test-suite-playwright/prompt.md

## Instructions
Return exactly one verdict:

- APPROVE: No concerns from your domain.

- ADVISE: Return warnings using this format for each concern:
  - [simplicity]: <one-sentence description>
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

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase3.5-margo.md
