You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Phase 0062 added tenant auth to all capture GET endpoints, which broke the public verify page, CLI verifier, and the "anyone can verify" value proposition. The proposal is to simplify the access model by making individual capture access public (128-bit IDs as capability tokens), keeping list endpoint authed, and removing the share token system entirely.

## Your Planning Question
SECURITY.md needs to be updated with the simplified access model. How should the documentation change?

Specifically:
(a) SECURITY.md currently documents the tenant auth + share token model. What sections need rewriting vs. removal?
(b) Should this access model simplification be documented as an ADR (Architecture Decision Record)?
(c) Are there other documentation files that reference share tokens or the old auth model?
(d) The README mentions capture verification — does it need updating?

## Context
Read these files:
- SECURITY.md (current security documentation)
- README.md (may reference capture access model)
- docs/ directory (check for other relevant docs)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: software-docs-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-software-docs-minion.md`
