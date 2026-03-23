You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Capture retrieval endpoints require tenant authentication. The npx @w-r-l/verify CLI tool currently fetches captures and WACZ artifacts without authentication. Share tokens provide backward compatibility.

## Your Planning Question

The npx @w-r-l/verify CLI tool currently fetches captures and WACZ artifacts without authentication (key-resolver.js fetchWaczFromCaptureUrl). After the auth gate, it will get 401s. The issue says share tokens provide backward compatibility. What is the best DX approach? Options:
(a) The verify endpoint response could include artifact URLs with share tokens baked in (e.g., the wacz URL in the verify response already has ?token=xxx).
(b) The CLI could accept a --token flag.
(c) The verification endpoint (GET /v1/verify/{id}) remains public and could be enhanced to return the WACZ bytes directly or include a tokenized download URL.
Which approach minimizes disruption for existing users while maintaining security? What version bump (minor vs major) does this require for the npm package?

## Context
Read these files for full context:
- packages/verify/lib/key-resolver.js (full, especially fetchWaczFromCaptureUrl)
- packages/verify/lib/cli.js (argument parser and help text)
- packages/verify/package.json
- src/index.js (handleVerifyCapture handler)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: devx-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-devx-minion.md
