You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a tested URL validation module (`src/url-validation.js`) that blocks known SSRF bypass vectors for a Cloudflare Worker. Tests must run under `vitest run` inside the Miniflare pool.

## Your Planning Question

How should we structure tests for a URL validation module that performs DNS resolution, given these constraints:
(a) Tests run in the Miniflare pool (`@cloudflare/vitest-pool-workers`). Does Miniflare support the Node.js `dns` module via `nodejs_compat`, or do we need a different resolution approach?
(b) How do we test DNS resolution and private IP blocking without making real DNS queries? Should the module accept an injected resolver function for testability?
(c) How do we test redirect chain validation? Can we set up mock HTTP servers within the Miniflare test environment, or should we use a different approach?
(d) The acceptance criteria list 8 specific bypass vectors. Should each be a separate test case, or should we use parameterized tests? What grouping makes the test suite most auditable?
(e) Are there bypass vectors that are inherently untestable in unit tests (e.g., actual DNS rebinding) that should be flagged for integration testing later?

## Existing Test Conventions (from codebase)
- Tests in `test/` directory
- Using `vitest` with `@cloudflare/vitest-pool-workers`
- Import from `cloudflare:test` for `SELF`
- `describe`/`it`/`expect` pattern
- Tests are integration-style (hitting the worker via SELF.fetch)
- Also pure unit tests (responses.test.js imports functions directly)

## Acceptance Criteria (Bypass Vectors to Test)
- Hex-encoded IP (`http://0x7f000001/`) blocked
- Octal IP (`http://0177.0.0.1/`) blocked
- Decimal IP (`http://2130706433/`) blocked
- IPv6-mapped IPv4 (`http://[::ffff:127.0.0.1]/`) blocked
- IPv6 ULA (`http://[fc00::1]/`) blocked
- DNS-to-loopback redirect blocked
- Redirect to private IP after initial validation blocked
- Embedded credentials (`http://user@169.254.169.254/`) blocked
- Double-encoded paths blocked

## Context
- vitest.config.js uses `defineWorkersConfig` with Miniflare pool
- `nodejs_compat` flag is enabled in wrangler.toml
- Plain JavaScript, ESM modules
- The module will be standalone (`src/url-validation.js`) with its own test file

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: test-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-I3rCZb/mvp-step-2-url-validation-ssrf-prevention/phase2-test-minion.md`
