You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase3-synthesis.md

## Your Review Focus
Security gaps in the planning documents that will be produced:
- Does the MVP scope document adequately address SSRF prevention requirements?
- Does the signing approach (Ed25519 self-signing with extensible signatures array) have gaps?
- Are the API key requirements for the capture endpoint clearly specified?
- Does the implementation plan sequence security-critical work appropriately?
- Are there security risks in the planned GitHub issues that could lead to insecure implementation?

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/prompt.md

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

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-vPJfMN/wrl-mvp-scoping-and-planning/phase3.5-security-minion.md
