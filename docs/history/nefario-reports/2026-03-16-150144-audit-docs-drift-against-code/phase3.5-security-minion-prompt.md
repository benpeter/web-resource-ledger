You are reviewing a delegation plan before execution begins.
Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase3-synthesis.md

## Your Review Focus
- Security implications of documentation changes (could updated docs leak internal security details?)
- Task 2 rewrites the Key Rotation section -- verify the prompt doesn't instruct documenting internal key storage mechanisms, KV key paths, or SSRF prevention details
- Verify no task prompts instruct exposing secret values, internal architectures, or attack surface details
- Check that the PRODUCT.md/MVP.md status headers don't direct users to internal-only resources

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/prompt.md

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

Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase3.5-security-minion.md
