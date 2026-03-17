You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Your Planning Question
The advisory specifies enriching existing log events with `keyName`/`reason` fields and adding a new `admin` subsystem for `key_create`/`key_revoke` events.
1. Which existing log events in `src/index.js` and `src/capture.js` need `keyName` enrichment (enumerate them -- there are currently `security.auth_fail`, `security.rate_limit`, `security.capacity_limit`, `security.ssrf_block`, `capture.*`, `list.*` events)?
2. What fields should `admin.key_create` and `admin.key_revoke` events include?
3. Should auth failures from KV lookup include the key hash prefix for debugging, or is that a security risk?
4. What severity levels are appropriate for admin operations?
5. How should the dual-mode fallback period be observable (so operators can tell when all traffic has migrated to KV-based keys)?
6. Should the `reason` field distinguish between "key not found", "key revoked", "scope insufficient", and "legacy fallback used"?

## Context
Read these files: `src/log.js`, `src/index.js`, `src/capture.js`

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: observability-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-observability-minion.md`
