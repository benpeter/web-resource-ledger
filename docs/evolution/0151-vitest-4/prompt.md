# Prompt

Same session as phases 0133 to 0150. benpeter/wrl-backlog#85: move the tests from
vitest 3.2.4 and `@cloudflare/vitest-pool-workers` 0.12.21 to vitest 4. The old pool
pulled in the dev-only advisories `npm audit` kept reporting (2 critical among 13),
and vitest-pool-workers hung in some CI runs on ubuntu-26.04, which is why the vitest
jobs are pinned to ubuntu-24.04.
