You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Implement browser session reuse with Playwright migration for 10x capture throughput (from ~30 to ~300 captures/min).

## Your Planning Question
Does the 10x throughput improvement change any user-facing behavior or error scenarios? Specifically:
(a) Are there new failure modes (session contention, no idle sessions available) that need user-safe error messages in categorizeError()?
(b) Should the Retry-After: 5 header on 202 responses be adjusted given faster capture completion?
(c) Does the capacity change affect any documented limitations?

## Context
- Current categorizeError() in src/capture.js maps errors to user-safe messages
- Current error categories: timeout, subresource limit, page size limit, navigation error, generic
- API returns 202 with Retry-After: 5 for async capture processing
- The capacity improvement is purely backend -- no API surface changes
- Current rate limits: 10 captures/min per IP, 20 global captures/min

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution with Recommendations, Proposed Tasks, Risks/Concerns, Additional Agents Needed
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-ux-strategy-minion.md
