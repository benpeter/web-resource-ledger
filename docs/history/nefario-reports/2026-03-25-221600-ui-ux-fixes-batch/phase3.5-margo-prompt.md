You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase3-synthesis.md

## Your Review Focus
Over-engineering, YAGNI violations, dependency bloat, unnecessary complexity. Check that:
- The plan doesn't add unnecessary abstractions or indirection
- No speculative features or "while we're at it" additions
- Dependencies are justified
- The implementation approach is the simplest that could work
- Note: The features themselves (contrast fix, billing dedup, docs link, notification alert) are approved by the product owner. Focus on implementation simplicity, not whether the features should exist.

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-BgfDVA/ui-ux-fixes-batch/prompt.md

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

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase3.5-margo.md
