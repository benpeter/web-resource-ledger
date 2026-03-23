# Phase 3: Synthesis Prompt

MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

A Playwright-based end-to-end test suite validates the complete WRL user journey against a running environment. The suite covers signup through verification, batch operations, webhooks, quota enforcement, and public share links. It runs as a separate CI workflow, catching integration regressions that unit tests miss.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-ux-strategy-minion.md

## Key consensus across specialists:

### test-minion
- Use API key auth (not OAuth sessions) for all tests; skip browser-based OAuth entirely
- Use webhook.site + ping for webhooks; drop scheduled capture test; use dedicated e2e-{timestamp} tenant per run
- 9 tasks: project setup/config; global setup/teardown; capture-verify test; batch capture test; webhook delivery test; quota enforcement test; verify page browser test; CI workflow; README

### iac-minion
- No browser caching (Playwright docs advise against it); chain after staging deploy via workflow_run + manual dispatch
- Sequential execution (workers:1); HTML report always, traces on failure only
- Need @playwright/test as devDep alongside existing @cloudflare/playwright
- 3 secrets needed: existing API key, new admin key, new webhook secret

### security-minion
- Dynamic test tenant via admin API (one GH secret: ADMIN_KEY); skip real OAuth
- Proposes admin/sessions endpoint for test session creation (bypasses OAuth)
- Static webhook secret acceptable per run; environment protection rules critical
- PR workflows must NOT trigger e2e (secrets exposure risk)

### api-design-minion
- Deploy dedicated Cloudflare Worker as webhook test receiver (reject webhook.site and tunnels)
- Verify HMAC client-side in Playwright (receiver is dumb sink)
- Don't test real queue retries -- use ping endpoint for fail/succeed behavior
- 4-endpoint receiver: POST /session, POST /hook/:sessionId, GET /session/:sessionId/deliveries, DELETE /session/:sessionId

### ux-strategy-minion
- Extend Test 1 with ToS, welcome redirect, show-once key semantics
- Reframe Test 6 as "Public Evidence Verification" (no share link API exists)
- Add Account Key Rotation test (P1 priority)
- Drop scheduled captures entirely; webhook test is cut-eligible (P3)
- Priority ranking: P0 golden path, P1 verification + key rotation, P2 quota + batch, P3 webhooks

## Key Conflicts to Resolve

1. **Webhook receiver**: test-minion recommends webhook.site + ping; api-design-minion recommends dedicated Worker. Security-minion requires HMAC verification.
2. **OAuth approach**: test-minion says skip entirely (API key only); security-minion proposes admin/sessions endpoint (adds code to src/). Both agree real GitHub OAuth is too fragile.
3. **Test scope**: ux-strategy-minion adds key rotation test (not in original issue). Original issue asked for 6 tests; ux recommends 6 different tests.
4. **Admin sessions endpoint**: security-minion proposes adding POST /v1/admin/sessions. This adds production code for test purposes -- tension with YAGNI.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase3-synthesis.md
