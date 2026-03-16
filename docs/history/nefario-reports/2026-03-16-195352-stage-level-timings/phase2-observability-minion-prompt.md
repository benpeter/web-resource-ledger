You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Add stage-level timing instrumentation to `defaultRenderer()` in the WRL capture pipeline so that per-stage durations (sessionAcquireMs, contextSetupMs, navigationMs, settleMs, consentMs, screenshotMs, contentMs) are visible in Coralogix logs and the capture API response.

## Your Planning Question

What should the structured log event look like for per-stage capture timings? The current `capture.success` and `capture.partial` events already include a single `durationMs` and some consent fields. How should per-stage durations be added -- as flat top-level fields on the existing events, or as a nested `stages` object? Should the log event carry the full stage breakdown even for partial captures (where consent/screenshot stages may be skipped)? What field naming convention aligns with Coralogix query patterns?

## Context

Key files:
- src/capture.js — defaultRenderer() function and both log calls (capture.success, capture.partial)
- src/log.js — Coralogix integration (fire-and-forget structured JSON)
- src/consent.js — already returns durationMs

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/stage-level-timings

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the structured format
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9aXQ3r/stage-level-timings/phase2-observability-minion.md
