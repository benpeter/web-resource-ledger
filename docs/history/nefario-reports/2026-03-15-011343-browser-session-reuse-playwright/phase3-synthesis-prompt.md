MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Implement browser session reuse with Playwright migration for 10x capture throughput (#21).

Captures reuse browser sessions instead of launching and closing a browser per capture, increasing throughput from ~30 to ~300 captures/min within the existing 30-session Browser Rendering limit. Simultaneously migrates from Puppeteer to Playwright (GA on Cloudflare since Sep 2025).

Success criteria:
- browser.disconnect() replaces browser.close() in capture flow (NOTE: edge-minion found Playwright uses connect()+close() not disconnect())
- Idle sessions are discovered and reconnected before launching new browsers
- keep_alive is set on browser launch to prevent premature session timeout
- Puppeteer replaced with @cloudflare/playwright throughout src/capture.js
- All existing capture tests pass
- Concurrent capture throughput improves measurably under load
- src/capture.js header comment documents why BrowserContext isolation is sufficient (threat model reasoning)
- Scaling path added to docs/backlog.md
- TOCTOU backlog entries marked DONE

Scope:
- In: src/capture.js session lifecycle, browser launch options, session discovery and reconnection logic
- In: Puppeteer to Playwright migration (src/capture.js, package.json, wrangler.toml)
- In: Document the isolation decision and threat model reasoning in code comments
- In: Add scaling options beyond session reuse to docs/backlog.md
- Out: Queue-based backpressure, Durable Object session coordination, Cloudflare Containers, infrastructure changes

Constraints:
- Must work within the existing Cloudflare Browser Rendering binding
- Must handle session contention gracefully (multiple Workers racing for the same free session)
- BrowserContext must be closed after each capture (state cleanup) -- browser stays alive

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-edge-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-ux-strategy-minion.md

## Key consensus across specialists:

1. edge-minion: Playwright uses acquire()/connect()/close() not disconnect(). GLOBAL_CAPTURE_LIMITER at 20/min must be raised. Session contention handled by random selection + fallback to acquire().

2. frontend-minion: Mostly mechanical API renames. waitUntil:'networkidle' (no networkidle2 equivalent) is highest-risk. page.route() requires async handlers. page.setViewportSize() replaces setViewport().

3. security-minion: BrowserContext isolation sufficient for WRL. Mandatory context.close() in try/finally. Use browserContext.route() not page.route() for navigation blocking. Disable Service Workers. Orphan cleanup on reconnect.

4. test-minion: stubRenderer DI pattern survives. Verify miniflare binding early. Update categorizeError() for Playwright error strings. Extract renderer if needed for testability.

5. ux-strategy-minion: Add session pool exhaustion error category. Keep Retry-After:5. GLOBAL_CAPTURE_LIMITER at 20/min is the real bottleneck users will hit.

## Cross-specialist conflicts to resolve:

1. networkidle vs networkidle2: frontend-minion flagged this as highest-risk regression. Need a mitigation strategy. Options: (a) accept stricter behavior, (b) use domcontentloaded + explicit wait, (c) use commit + networkidle with short timeout fallback.

2. page.route() vs browserContext.route(): frontend-minion says page.route(), security-minion says browserContext.route() for the cross-domain navigation blocker. Security concern: page.route() misses popup first-request. Resolution should favor security-minion (browserContext.route() covers more).

3. Rate limiter scope: Both edge-minion and ux-strategy-minion agree GLOBAL_CAPTURE_LIMITER must be raised. BUT the issue scope says "Out: infrastructure changes". Raising a rate limit in wrangler.toml is a config change, not infra -- it should be in scope.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions (read each file)
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format with:
   - Numbered tasks with complete, self-contained prompts
   - Agent assignments (prefer sonnet for execution)
   - Dependencies between tasks
   - Approval gates where needed
   - Model selection (sonnet for most execution, opus only if deep reasoning needed)
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase3-synthesis.md
