You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Your Planning Question
The admin API has no UI (out of scope). But the operator experience matters -- provisioning keys, understanding the migration sequence, and diagnosing auth failures are all operator journeys.
1. Is the three-endpoint admin API the right abstraction for a single-operator-provisioning-keys workflow?
2. What error messages should the admin API return when things go wrong -- evaluate: "key already revoked" (idempotent DELETE vs. error), "tenant not found" (should tenants be pre-provisioned or created implicitly on first key?), "scope invalid", "name already in use"?
3. How should the migration runbook be structured for cognitive simplicity -- what is the operator's mental model?
4. The `wrl_live_` prefix on generated keys is operator-facing -- is this prefix sufficient for distinguishing WRL keys from other credentials in an operator's key management?
5. When a 403 names the required scope (advisory decision), what is the clearest message format -- `"Requires scope: capture"` vs `"This endpoint requires a key with 'capture' scope"`?

## Context
Read these files: `OPERATIONS.md`, `README.md`, `src/responses.js`, `src/index.js`

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: ux-strategy-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-ux-strategy-minion.md`
