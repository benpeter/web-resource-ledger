You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase3-synthesis.md

## Your Review Focus
Security: SQL injection defense (parameterized queries), tenant isolation in WHERE clauses, url filter input validation, API key hash timing attacks, data migration script credential handling, signing key exposure.

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/prompt.md

## Instructions
Return exactly one verdict:

- APPROVE: No concerns from your domain.
- ADVISE: Return warnings using this format for each concern:
  - [security]: one-sentence description
    SCOPE: file, component, or concept affected
    CHANGE: what should change
    WHY: risk or rationale
    TASK: task number affected
- BLOCK: Return using this format:
  SCOPE: file, component, or concept affected
  ISSUE: description of the blocking concern
  RISK: what happens if not addressed
  SUGGESTION: how the plan could be revised

Be concise. Only flag issues within your domain expertise.
Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase3.5-security-minion.md