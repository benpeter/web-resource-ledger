You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xrXhca/staging-deploy-race-condition/phase3-synthesis.md

## Your Review Focus
Convention adherence, CLAUDE.md compliance, intent drift. Specifically:
- Does the plan stay within the issue scope (workflow trigger ordering, OPERATIONS.md, ad-hoc staging docs)?
- Does it respect the "Out" scope boundaries (no staging branch, no tag-based promotion, no SMOKE_SKIP_CAPTURE changes)?
- Are the project conventions from CLAUDE.md followed (YAGNI, KISS, fail loudly, evolution log)?
- Is there an evolution log entry planned?
- Does the plan align with the user's original intent as stated in issue #86?

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xrXhca/staging-deploy-race-condition/prompt.md

## Instructions
Return exactly one verdict:

- APPROVE: No concerns from your domain.

- ADVISE: Return warnings using this format for each concern:
  - [governance]: <one-sentence description>
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

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xrXhca/staging-deploy-race-condition/phase3.5-lucy.md
