MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
## Goal
A tested URL validation module that blocks known SSRF bypass vectors.

## Context
The project scaffold and Worker exist (Step 1 complete). This step adds the security-critical URL validation module that all capture requests will pass through before any browser rendering occurs.

## Work Items
- [ ] URL scheme allowlist: reject anything that is not `http` or `https`
- [ ] Reject URLs containing embedded credentials (`http://user:pass@host`) and bare `0.0.0.0`
- [ ] DNS pre-resolution with private IP blocking: IPv4 ranges `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `127/8`
- [ ] DNS pre-resolution blocking IPv6 ranges: `fc00::/7`, `fe80::/10`, `::1`, `::ffff:127.0.0.1`
- [ ] DNS pinning: resolve once, pass resolved IP to Browser Rendering to prevent DNS rebinding
- [ ] Redirect chain re-validation at each hop (max 5 hops), private IP check applied at every hop
- [ ] URL normalization and 2048-character length limit enforced
- [ ] Unit test suite covering all bypass vectors listed in Acceptance Criteria

## Acceptance Criteria
- [ ] Hex-encoded IP (`http://0x7f000001/`) blocked
- [ ] Octal IP (`http://0177.0.0.1/`) blocked
- [ ] Decimal IP (`http://2130706433/`) blocked
- [ ] IPv6-mapped IPv4 (`http://[::ffff:127.0.0.1]/`) blocked
- [ ] IPv6 ULA (`http://[fc00::1]/`) blocked
- [ ] DNS-to-loopback redirect blocked
- [ ] Redirect to private IP after initial validation blocked
- [ ] Embedded credentials (`http://user@169.254.169.254/`) blocked
- [ ] Double-encoded paths blocked
- All tests pass under `vitest run` inside the Miniflare pool

## Dependencies
- Blocked by: #1
- Blocks: #3

## Technical Notes
- This is the most security-critical component in the entire system — the capture endpoint is SSRF-capable by design (it fetches arbitrary URLs)
- DNS pinning prevents TOCTOU (time-of-check/time-of-use) attacks and DNS rebinding: resolve the hostname once, use the raw IP for all subsequent requests in the capture lifecycle
- Implement as a standalone module with its own test suite so it can be audited and tested in isolation
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## Existing Codebase Context
This is a Cloudflare Worker project (scaffolded in Step 1):
- `src/index.js` — Worker entry point with route dispatcher, health endpoint
- `src/responses.js` — RFC 9457 problem+json response helpers
- `test/health.test.js` — health endpoint tests using Miniflare pool
- `test/responses.test.js` — response helper unit tests
- `vitest.config.js` — Vitest with @cloudflare/vitest-pool-workers
- `wrangler.toml` — Worker config with R2, KV, Browser bindings
- `package.json` — vanilla JS, ESM modules, no frameworks

Key conventions:
- Plain JavaScript (no TypeScript)
- ESM modules
- RFC 9457 error responses
- Tests run in Miniflare worker pool
- YAGNI / KISS philosophy (see CLAUDE.md)
- nodejs_compat flag enabled

## External Skill Discovery
No project-local skills found (.claude/skills/ and .skills/ do not exist).

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills were discovered
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase1-metaplan.md`
