You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Migrate src/capture.js from Puppeteer to Playwright and implement browser session reuse. Need to ensure all existing tests pass and new scenarios are covered.

## Your Planning Question
How should the test suite be adapted for the Playwright migration and session reuse pattern? Specifically:
(a) The current tests use a stubRenderer injection pattern -- does this pattern survive the Playwright migration, or do tests need to mock Playwright's API differently?
(b) The vitest.config.js uses miniflare with browserRendering: { binding: 'BROWSER' } -- does miniflare support @cloudflare/playwright, or does the test infrastructure need changes?
(c) How should session reuse behavior be tested -- session discovery, reconnection, contention handling, disconnect() vs close()?
(d) Can the @cloudflare/vitest-pool-workers test pool simulate concurrent captures to verify throughput improvement?
(e) Should the categorizeError() function be updated for Playwright-specific error messages (different from Puppeteer's)?

## Context
Current test infrastructure:
- vitest.config.js uses @cloudflare/vitest-pool-workers with miniflare browserRendering binding
- test/capture.test.js uses stubRenderer = async () => ({ screenshot: PNG_BYTES, html: TEST_HTML })
- performCapture() accepts an optional renderer parameter for DI
- Tests use fetchMock for header fetch mocking
- categorizeError() matches on: 'timeout', 'Timeout', 'subresource limit', '50MB size limit', 'Could not navigate', 'net::ERR', 'Navigation'

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution with Recommendations, Proposed Tasks, Risks/Concerns, Additional Agents Needed
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-test-minion.md
