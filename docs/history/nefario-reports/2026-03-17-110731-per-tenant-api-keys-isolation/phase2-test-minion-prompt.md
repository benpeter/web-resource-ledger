You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Your Planning Question
The auth module rewrite fundamentally changes what `verifyApiKey` does -- from a single env var string comparison to a KV-based hash lookup with scope checking and dual-mode fallback.
1. What test structure should the new auth tests have? The current `test/auth.test.js` tests are simple (correct key, wrong key, missing header, misconfigured env). The new auth needs tests for: KV-based lookup, scope enforcement (`capture` implies `read`), dual-mode fallback (legacy key still works during migration), revoked key rejection, admin scope enforcement.
2. How should KV be mocked for auth unit tests -- the current tests don't touch KV at all?
3. What admin API endpoint tests are needed (success, auth failures, validation errors, revocation flows)?
4. Should there be integration tests that exercise the full auth-to-capture flow with KV-based keys, or is that covered by the existing capture integration tests with updated auth?
5. What is the boundary between mocked unit tests (acceptable for scope/fallback logic) and real-boundary tests (needed for KV interaction)? The project philosophy says "mocking out the browser is like testing an HTTP server without sending requests" -- does the same apply to mocking KV in auth tests?

## Context
Read these files: `test/auth.test.js`, `test/fixtures.js`, `test/kv.test.js`, `test/list-captures.test.js`, `test/integration/`, CLAUDE.md engineering philosophy section on testing boundaries

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: test-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-test-minion.md`
