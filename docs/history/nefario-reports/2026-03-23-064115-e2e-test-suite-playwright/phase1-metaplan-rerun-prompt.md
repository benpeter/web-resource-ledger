# Phase 1: Meta-Plan Re-Run Prompt

MODE: META-PLAN

You are revising a meta-plan after a team adjustment.

## Original Task

A Playwright-based end-to-end test suite validates the complete WRL user journey against a running environment. The suite covers signup through verification, batch operations, scheduled captures, webhooks, quota enforcement, and public share links. It runs as a separate CI workflow, catching integration regressions that unit tests miss.

Success criteria:
- Playwright test suite in `tests/e2e/` directory
- Test: signup via OAuth -> receive API key -> first capture -> poll until complete -> verify signature -> download WACZ
- Test: batch capture (POST /v1/captures/batch) -> 207 multi-status response -> poll individual capture statuses
- Test: scheduled capture creation -> cron trigger fires -> new capture appears in list
- Test: webhook delivery on capture completion -> retry on 5xx failure -> successful delivery on retry
- Test: quota enforcement -> capture rejected with 429 -> response includes upgrade guidance
- Test: share link generation -> public verification page loads without auth -> signature validates
- All tests pass against staging environment
- CI workflow (`e2e-tests.yml`) runs on push to main and on-demand, separate from unit test workflow
- Tests complete within 5 minutes total
- Test failures produce screenshots and trace files as artifacts
- Tests are independent (no ordering dependency, can run in parallel)

Constraints:
- Depends on R24 (OAuth signup must exist for the signup flow test)
- Tests run against staging, not production
- Playwright browser binaries must be cached in CI
- Webhook test needs a publicly reachable endpoint for callback
- Scheduled capture test may need a mechanism to trigger the cron manually

## Original Meta-Plan
Read from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase1-metaplan.md

## Team Adjustment
- Removed: software-docs-minion (docs are implementation artifacts, not planning concerns; test-minion and iac-minion outputs naturally define what needs documenting)
- Revised team: test-minion, iac-minion, security-minion, api-design-minion, ux-strategy-minion

## Constraints for Re-Run
- Keep the same scope and task description
- Generate planning consultations for ALL agents in the revised team
- Re-evaluate the cross-cutting checklist against the new team
- Produce output at the same depth and format as the original
- Do NOT change the fundamental scope of the task
- Do NOT add agents the user did not request
- Design planning questions as a coherent set -- each question should address aspects that no other agent on the team covers

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/swift-sprouting-music

## Instructions
Write your complete revised meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase1-metaplan-rerun.md`
