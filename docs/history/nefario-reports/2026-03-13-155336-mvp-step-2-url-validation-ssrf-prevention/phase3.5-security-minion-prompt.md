You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase3-synthesis.md

## Your Review Focus
Security gaps in the SSRF prevention plan: missing bypass vectors, incomplete IP range coverage, validation pipeline ordering vulnerabilities, error message information leakage, DNS resolution edge cases, IPv4/IPv6 parsing completeness.

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/prompt.md

## Instructions
Return exactly one verdict:

- APPROVE: No concerns from your domain.

- ADVISE: Return warnings using this format for each concern:
  - [your-domain]: <one-sentence description>
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

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase3.5-security-minion.md
