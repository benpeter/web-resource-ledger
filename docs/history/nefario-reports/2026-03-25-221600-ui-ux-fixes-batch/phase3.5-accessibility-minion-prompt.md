You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase3-synthesis.md

## Your Review Focus
WCAG 2.2 compliance and accessibility:
- Verify the proposed --color-text-muted value (#595550) achieves >= 4.5:1 contrast against both #f7f6f5 and #ffffff
- Review the docs link implementation for screen reader accessibility (sr-only text pattern, external link icon with aria-hidden)
- Check that billing status removal doesn't break screen reader announcements
- Evaluate any other a11y implications of the planned changes

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-BgfDVA/ui-ux-fixes-batch/prompt.md

## Instructions
Return exactly one verdict:

- APPROVE: No concerns from your domain.

- ADVISE: Return warnings using this format for each concern:
  - [accessibility]: <one-sentence description>
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

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase3.5-accessibility-minion.md
