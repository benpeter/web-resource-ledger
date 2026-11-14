# Decisions

- Cause: the fetch gates in `src/index.js` store the verified caller on `env`
  (`env._session` for account and billing routes, `env._captureAuth` for capture GET
  routes). Workers pass the same `env` object to every request an isolate serves, and
  nothing cleared the fields, so a request without credentials inherited the last
  caller. Effects:
  - keyless reads of single captures, status, artifacts and certificates got tenant
    isolation and returned 404 for other tenants' public captures (seen live);
  - the diff route treats a set `env._captureAuth` as authenticated, so a keyless diff
    could run as the previous caller, counting usage and rate limit against that
    tenant. Captures are public, so it exposed nothing a keyless reader can't fetch
    from the artifact routes. Cloudflare analytics show one diff request in the last
    7 days, answered 401;
  - keyless artifact and certificate reads skipped the per-IP verify limit;
  - two concurrent requests could overwrite each other's value between the gate and
    the handler. Not observed, but the same fix covers it.
- Fix: `fetch()` starts with `env = Object.create(env)`. Each request gets its own
  object; bindings and vars come through the prototype, and writes stay on that object.
  Nothing in `src/` copies or enumerates `env` (`{...env}`, `Object.keys(env)`), so the
  inherited properties are enough. Passing the caller as an argument would be cleaner
  but touches every handler signature; that can follow if more request state appears.
- The red test calls `worker.fetch` directly with a shared `env` and asserts that no
  `_session` or `_captureAuth` is left on it. On pool-workers 0.12 that is the only test
  that sees the bug; the two `SELF` tests in the same block catch it once the pool
  shares `env` (vitest 4).
- `docs/INTERNALS.md` gets a short paragraph on how the gate hands the caller to
  handlers, so the next gate doesn't write to the shared object.
