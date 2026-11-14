# Outcome

- `package.json`: vitest 4.1.12, `@cloudflare/vitest-pool-workers` 0.19.1.
- `vitest.config.js`, `vitest.integration.config.js`: `cloudflareTest()` plugin.
- `test/fetch-mock.js` (new) and the imports in 13 test files.
- `src/index.js`: `_session` and `_captureAuth` are own properties of the per-request
  env.
- `test/email-login.test.js`: resets the `rl:` counters in `beforeEach`.
- `CONTRIBUTING.md` (test gotchas, unit test time), `.planning/codebase/STACK.md`.
- Local runs: unit 1894 passed, 19 failed (the DNS-only ones, as on main), 34 s
  instead of about 50 s; sync 15/15.

## Backlog changes

- benpeter/wrl-backlog#85: commented; left open for the runner move back to
  ubuntu-latest and the wrangler and @redocly/cli bumps.
