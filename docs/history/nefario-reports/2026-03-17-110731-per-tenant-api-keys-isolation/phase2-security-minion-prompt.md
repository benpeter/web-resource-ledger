You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Your Planning Question
Given the pre-resolved design (KV-based key lookup via `apikey:{sha256hex}`, three scopes `capture`/`read`/`admin`, `ADMIN_KEY` as infrastructure secret, dual-mode fallback for `CAPTURE_API_KEY` during migration), what is the correct implementation sequence to avoid security gaps during the transition? Specifically:
1. How should the dual-mode auth fallback be implemented so the legacy key cannot escalate to admin scope?
2. What timing-safe comparison approach is needed when switching from direct string compare to KV-based hash lookup?
3. What are the security-critical ordering constraints between deploying the code, setting `ADMIN_KEY`, and provisioning the first tenant key?
4. What should the admin API authorization check look like (ADMIN_KEY env var check vs. KV-stored admin-scoped key)?
5. What are the injection/bypass risks for the `apikey:{sha256hex}` key pattern in KV (e.g., crafted key values that collide with other KV prefixes)?

## Context
Read these files: `src/auth.js`, `src/index.js`, `src/kv.js`, `wrangler.toml`, `OPERATIONS.md`

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-security-minion.md`
