You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Add stage-level timing instrumentation to `defaultRenderer()` in the WRL capture pipeline so that per-stage durations are visible via GET /v1/captures/:id and Coralogix logs.

## Your Planning Question

The current `render` object is `{ waitUntilReached, timedOut, durationMs }`, stored in KV and exposed via `GET /v1/captures/:id`. The task adds per-stage durations (sessionAcquireMs, contextSetupMs, navigationMs, settleMs, consentMs, screenshotMs, contentMs). Should these be top-level siblings of `durationMs` or nested under a `stages` sub-object? Should `durationMs` remain as total for backward compatibility? How should partial captures represent skipped stages (where consent/screenshots after consent are not performed)?

## Context

Key files:
- openapi.yaml — RenderInfo schema (lines 257-290)
- src/capture.js — return shape from defaultRenderer(), render metadata flow
- test/fixtures.js — existing renderer stubs

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/stage-level-timings

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the structured format
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9aXQ3r/stage-level-timings/phase2-api-design-minion.md
