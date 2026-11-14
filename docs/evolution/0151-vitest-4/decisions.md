# Decisions

- Target vitest 4.1.12 with vitest-pool-workers 0.19.1, the last line on stable
  miniflare 4 (0.20 and later need the miniflare 5 alpha). vitest 5 exists and is left
  for later; `wrangler` stays at 4.73.0.
- Config follows Cloudflare's vitest 3 to 4 guide: `defineConfig` from `vitest/config`
  with the `cloudflareTest()` plugin instead of `defineWorkersConfig`;
  `readD1Migrations` comes from the package root. `isolatedStorage` and `poolOptions`
  are gone; storage is now isolated per test file.
- `fetchMock` is no longer exported by `cloudflare:test`. `test/fetch-mock.js` replaces
  it with the subset the tests use (`get().intercept().reply()`, `replyWithError`,
  `persist`, `times`, `activate`, `deactivate`, `disableNetConnect`,
  `assertNoPendingInterceptors`), by swapping `globalThis.fetch`, which the tests and
  the Worker share. 13 test files import it from there. `env`, `SELF` and the
  execution-context helpers still come from `cloudflare:test` (deprecated, still
  supported).
- The first full run had 41 failures against the usual 19 local DNS ones. They came
  from two places:
  - pool 0.13+ passes one shared `env`, as production does, which exposed request auth
    stored on `env` (fixed in production by phase 0147). In this pool `env` is also a
    Proxy, so the phase 0147 fix (`Object.create(env)`) still leaked: assigning a field
    the per-request object didn't have went to the prototype's setter, and the Proxy
    wrote it onto the shared object. `_session` and `_captureAuth` are now declared as
    own properties of the per-request object, which works for a plain object and a
    Proxy alike.
  - `test/email-login.test.js` relied on fresh KV per test; with storage per file the
    hourly sign-in counters piled up and later tests got 429. It now deletes the `rl:`
    keys in `beforeEach`, like `batch-capture` and `quota-enforcement` already do.
- TDD exception: this is a dependency migration, so there is no red commit of its own.
  The existing suite is the check (same 19 DNS-only local failures as main, 0 in CI),
  and the one source change is covered by phase 0147's "leaves no request state on
  env", which fails under the new pool without it.
- The vitest jobs stay on ubuntu-24.04 here. Whether the hangs on ubuntu-26.04 are
  gone with vitest 4 needs repeated runs; changing the runner in the same PR would mix
  the two questions. Follow-up on #85.
- `npm audit`: 11 findings (0 critical, 10 high, 1 low), all in dev tooling (miniflare,
  wrangler, @redocly/cli, the pool's own zod 3). `npm audit --omit=dev` finds none. The
  rest goes with the wrangler and @redocly/cli bumps on #85.
