You are reviewing a delegation plan before execution begins.
Your role: evaluate journey coherence, cognitive load, and simplification
opportunities across the plan.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase3-synthesis.md

## Your Review Focus
1. Journey coherence: Do the planned deliverables form a coherent user
   experience? Are there gaps or contradictions in the user-facing flow?
2. Cognitive load: Will the planned changes increase complexity for users?
   Are there simpler alternatives that achieve the same goal?
3. Simplification: Can any planned deliverables be combined, removed, or
   simplified without losing value?
4. User jobs-to-be-done: Does each user-facing task serve a real user need,
   or is it feature creep?

Note: This module has an internal API consumed by other code (Step 3 capture endpoint), not end users directly. Evaluate the developer experience of the API contract.

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

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase3.5-ux-strategy-minion.md

Be concise. Only flag issues within your domain expertise.
