# Outcome

- Red first (b8a353e), then green (6d51f45): `src/capture.js` loads
  `@cloudflare/playwright` with `await import()` in `getOrCreateSession`.
- Bump (6741570): `@cloudflare/playwright` `^1.1.2` -> `^1.4.0`;
  `.planning/codebase/STACK.md` rows brought in line with `package.json`
  (`@playwright/test`, autoconsent, MCP SDK and zod were stale too).
- `test/queue-consumer.test.js` loads the library in `beforeAll` (0aaf063):
  its tests run the real renderer without a browser, and under Vitest the
  first import of the library takes 2-3 s, which pushed one test past its 5 s
  timeout in the full suite.
- Tests: `test/browser-import-sync.test.js` (new, in `vitest.sync.config.ts`).
- Startup CPU (local `wrangler check startup`): 48 ms with 1.1.2, 90-106 ms
  with 1.4.0 imported statically, 35-36 ms with 1.4.0 loaded lazily.
- Staging, before and after deploying this branch there (`gh workflow run
  deploy-staging.yml --ref <branch>`; production only follows `main`):
  - Battery (`scripts/test-battery.js`, 23 sites, Reuters skipped by its
    robots.txt): `scripts/battery-compare.js` gave 18 sites the same, NYT and
    Yahoo Finance worse, Merriam-Webster better. Both stayed worse on the
    retry.
  - Capturing those three sites twice more on main, then twice more on this
    branch, gave the same results on both: NYT failed with the subresource
    limit, Yahoo Finance failed with it once and completed once,
    Merriam-Webster completed in full, Etsy (failing on both versions) showed
    a blank page. NYT's blank page in the first branch runs came from NYT, not
    from the library: on the branch a few minutes later it served the full
    page again.
  - Six fixed URLs: all complete on both versions; apache.org went from
    partial to full, the rest kept their render quality, page height and
    consent result. WACZ sizes stayed within 1%, except BBC News (5% smaller,
    a news front page changes between runs). Render times were the same or
    shorter.
- Yahoo Finance showed that a page over the subresource cap fails when `load`
  fires and gets a partial capture when `load` times out. 1.4.0 makes `load`
  fire sooner once requests past the cap are blocked. Filed as backlog #98.

## Backlog changes

- #98 (new, Next, needs-ben): pages over the subresource or size cap fail or
  get a partial capture depending on timing.
