You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Capture retrieval endpoints require tenant authentication. Share tokens allow access to specific captures. The CLI verify tool must continue working.

## Your Planning Question

The auth gate introduces multiple new code paths (authenticated access, cross-tenant 404, share token valid/expired/invalid, CLI backward compat). What test scenarios are needed to verify tenant isolation (cross-tenant 404), share token lifecycle (create, use, expire), and CLI backward compatibility? What test strategy covers both unit tests (auth middleware, token validation) and integration tests (actual HTTP flows)?

## Context
Read these files for full context:
- test/ directory structure and existing test patterns
- src/auth.js (existing auth tests as reference)
- Any existing test files related to captures and verification

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: test-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-test-minion.md
