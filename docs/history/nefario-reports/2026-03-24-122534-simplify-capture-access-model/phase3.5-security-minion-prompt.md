You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase3-synthesis.md

## Your Review Focus
Security gaps in the execution plan:
- Does the auth removal create any unaddressed attack surface?
- Is the D1 migration safe (no data loss, FK constraints handled)?
- Are there any security implications of removing share tokens that the plan doesn't address?
- Does the plan correctly handle the transition (old share token URLs)?

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/prompt.md

## Instructions
Return exactly one verdict: APPROVE, ADVISE, or BLOCK.
Be concise. Only flag issues within your domain expertise.
Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase3.5-security-minion.md
