# Phase 2: ux-strategy-minion Planning Prompt

You are contributing to the PLANNING phase of a multi-agent project. You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

A Playwright-based e2e test suite for WRL that covers six user journey tests. Two of the six reference features that don't exist in the codebase.

## Your Planning Question

Review the six proposed test scenarios against actual user journeys. Two scenarios reference features that don't exist (scheduled captures, share link generation).

(a) Does the signup-through-verification test accurately represent how a real user would onboard? The flow in the code is: `/auth/login` -> GitHub redirect -> `/auth/callback` -> `/v1/account/first-key` -> use API key for captures.

(b) The "share link" test -- the verify page is already public. Is the right test to verify that `/v1/verify/{id}` loads without auth and validates the signature? Or is there a user journey gap here that should be flagged?

(c) Are there user journeys that the six tests DON'T cover but should -- e.g., the web UI dashboard flow, the account settings key management flow?

(d) From a journey-completeness perspective, which tests exercise the most critical "moments of truth" for a new WRL user, and which are lower-priority? This ranking would help if the team needs to cut scope to stay within the 5-minute budget.

The six proposed tests:
1. Signup via OAuth -> receive API key -> first capture -> poll until complete -> verify signature -> download WACZ
2. Batch capture (POST /v1/captures/batch) -> 207 multi-status -> poll individual statuses
3. Scheduled capture creation -> cron trigger fires -> new capture appears in list (FEATURE DOESN'T EXIST)
4. Webhook delivery on capture completion -> retry on 5xx failure -> successful delivery on retry
5. Quota enforcement -> capture rejected with 429 -> response includes upgrade guidance
6. Share link generation -> public verification page loads without auth -> signature validates (NO SHARE LINK API)

## Context

Read these files for context:
- src/oauth.js (full signup flow)
- src/verify-page.js (public verification page)
- src/index.js (route table showing all available endpoints)
- src/account.js (account management endpoints)
- docs/backlog.md (scheduled captures in parking lot)

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/swift-sprouting-music

## Instructions
1. Read the context files listed above
2. Apply your UX strategy expertise to the planning questions
3. Identify gaps and priorities from a user journey perspective
4. Return your contribution in this format:

## Domain Plan Contribution: ux-strategy-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<or "None">

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-ux-strategy-minion.md`
