You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed
into a team recommendation, not an execution plan. Focus on analysis,
trade-offs, and recommendations rather than implementation tasks.

## Project Task

Evaluate whether WRL (Web Resource Ledger) should support parameterized capture requests — allowing API callers to control browser behavior during web page capture.

## Your Planning Question

How should capture parameters be exposed in the API? Evaluate: (1) Request body extension (add fields alongside `url`) vs. named presets vs. a separate configuration resource. (2) Which parameters should be top-level fields vs. nested objects? (3) How should the API communicate what parameters were actually applied (for evidence provenance)? (4) Backward compatibility: the current API accepts only `{ url }` -- how do we extend without breaking existing callers? (5) Should parameterized captures be a separate endpoint or the same `POST /v1/captures`? Consider that capture metadata is stored in KV and parameters may need to be recorded for evidence integrity.

## Context

Current API: `POST /v1/captures` accepts `{ url }` in JSON body, returns 202 with captureId. KV stores capture metadata including url, status, timestamps, artifacts, wacz info. The `performCapture()` function signature is `(env, url, ip, captureId, tenantId, renderer)`. Relevant parking lot items: "Screenshot timing / wait-for-load" and "Screenshot height cap configurability."

Read the following files for additional context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/index.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/capture.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/kv.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/openapi.yaml

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the standard format.
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-api-design-minion.md
