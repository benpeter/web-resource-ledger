You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase3-synthesis.md

## Your Review Focus
Convention adherence and CLAUDE.md compliance: Does the plan follow the project's engineering philosophy (Helix Manifesto, YAGNI, KISS, vanilla JS)? Does it satisfy all evolution log requirements (prompt.md, decisions.md, outcome.md, backlog update)? Does the plan match the user's original intent from the GitHub issue? Is there any goal drift or scope creep beyond what was requested?

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/prompt.md

## Instructions
Return exactly one verdict:

- APPROVE: No concerns from your domain.

- ADVISE: Return warnings using this format for each concern:
  - [your-domain]: <one-sentence description>
    SCOPE: <file, component, or concept affected>
    CHANGE: <what should change, in domain terms>
    WHY: <risk or rationale, self-contained>
    TASK: <task number affected>

  Each advisory must be understandable by a reader who has not seen the plan
  or this review session. SCOPE names the artifact, not a plan step number.
  CHANGE and WHY use domain terms, not plan-internal references.

- BLOCK: Return using this format:
  SCOPE: <file, component, or concept affected>
  ISSUE: <description of the blocking concern>
  RISK: <what happens if this is not addressed>
  SUGGESTION: <how the plan could be revised>

Be concise. Only flag issues within your domain expertise.

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T/nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase3.5-lucy.md
