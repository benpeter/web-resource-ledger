# Decisions

- The SDK advisory says "upgrading alone changes nothing": 1.32.0 adds
  `maxToolInputElements` on `McpServer`, off by default. `/mcp` now sets it to 1,000 and
  sets `maxRequestBodySize` on the transport to 256 KiB instead of the 4 MiB default. The
  largest real input is `batch_capture` with 20 URLs of at most 2,048 characters, about
  41 KB and a few dozen elements, so both limits leave plenty of room.
- `/mcp` checks the API key before the SDK sees the body, so an attacker needed a key.
  Any GitHub account gets a free one, so that wasn't much of a barrier.
- `npm audit fix` without `--force` also moved transitive packages within their ranges
  (87 lockfile entries). Production dependencies report 0 findings afterwards, down from
  11; the total is 13, down from 53.
- The 13 left are dev tooling behind exact pins or majors: `vitest` 3.2.4 (the fixes are
  in 4.1.12+), `@cloudflare/vitest-pool-workers` 0.12.21 (0.23 is the fix), `wrangler`
  4.73.0 and `@redocly/cli` 1.x. They run in CI and on a developer's machine, never in
  the Worker. Moving the test stack to vitest 4 is its own piece of work, filed in the
  backlog. `npm audit` suggested `vitest@3.2.7` as a fix; it isn't one (the advisory
  ranges end at 4.1.11), so it stays at 3.2.4.
- Locally, 19 tests that create captures fail because workerd's `node:dns` goes through
  Cloudflare DNS-over-HTTPS, which this machine can't reach; the same 19 fail on main.
  CI runs them.
