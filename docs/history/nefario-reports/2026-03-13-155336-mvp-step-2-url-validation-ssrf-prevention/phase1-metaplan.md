# Meta-Plan: MVP Step 2 -- SSRF-Safe URL Validation

## Scope

**In scope**: A standalone `src/url-validation.js` module (and corresponding
test suite) that validates and normalizes URLs before any browser rendering
occurs. The module must block all known SSRF bypass vectors, perform DNS
pre-resolution with private IP blocking, implement DNS pinning to prevent
rebinding, and re-validate across redirect chains. All tests must pass under
`vitest run` in the Miniflare pool.

**Out of scope**: Integration with the capture endpoint (Step 3), route
wiring in `src/index.js`, HTTP handler for capture requests, Browser Rendering
API calls, R2/KV storage. This module is consumed by future steps, not
exposed as an endpoint.

---

## Planning Consultations

### Consultation 1: SSRF Threat Model and Bypass Vector Coverage

- **Agent**: security-minion
- **Planning question**: Given that this Worker fetches arbitrary user-supplied
  URLs via Cloudflare Browser Rendering (a headless browser), what SSRF bypass
  vectors beyond the issue's list should the validation module cover? Specifically:
  (a) Are there Cloudflare-specific internal IPs or metadata endpoints
  (analogous to AWS 169.254.169.254) that need blocking?
  (b) Should we block additional schemes beyond http/https (e.g., `javascript:`,
  `data:`, `blob:`, `file:`) even though the URL constructor would reject most
  of them?
  (c) What is the correct validation order -- normalize first, then check
  scheme, then check credentials, then resolve DNS, then check IP? Does order
  matter for security?
  (d) For DNS pinning: what is the threat model for DNS rebinding in the
  Cloudflare Workers context specifically? Does the Browser Rendering API
  accept a pre-resolved IP, or do we need a different pinning mechanism?
  (e) For redirect chain validation: should the module follow redirects itself,
  or should it provide a per-hop validation function that the caller invokes?
  What are the TOCTOU risks in each approach?
- **Context to provide**: `src/index.js`, `src/responses.js`, `wrangler.toml`
  (shows Browser Rendering binding), the full issue text with bypass vectors,
  `nodejs_compat` flag availability.
- **Why this agent**: SSRF prevention is the #1 security concern in this entire
  system. The issue lists specific bypass vectors, but a security specialist
  may identify gaps (e.g., Unicode normalization attacks, URL parser differentials,
  Cloudflare-specific metadata endpoints). Getting the threat model right in
  planning prevents costly rework.

### Consultation 2: Test Strategy for Network-Dependent Validation

- **Agent**: test-minion
- **Planning question**: How should we structure tests for a URL validation
  module that performs DNS resolution, given these constraints:
  (a) Tests run in the Miniflare pool (`@cloudflare/vitest-pool-workers`).
  Does Miniflare support the Node.js `dns` module via `nodejs_compat`, or do
  we need a different resolution approach?
  (b) How do we test DNS resolution and private IP blocking without making
  real DNS queries? Should the module accept an injected resolver function
  for testability?
  (c) How do we test redirect chain validation? Can we set up mock HTTP
  servers within the Miniflare test environment, or should we use a
  different approach?
  (d) The acceptance criteria list 8 specific bypass vectors. Should each
  be a separate test case, or should we use parameterized tests? What
  grouping makes the test suite most auditable?
  (e) Are there bypass vectors that are inherently untestable in unit tests
  (e.g., actual DNS rebinding) that should be flagged for integration testing
  later?
- **Context to provide**: `vitest.config.js`, `test/health.test.js` (for
  conventions), `test/responses.test.js` (for unit test patterns), `package.json`,
  the full acceptance criteria list.
- **Why this agent**: The test suite is an explicit deliverable and the primary
  verification mechanism for a security-critical module. Testing DNS-dependent
  code in a Worker simulation environment has non-obvious constraints. Getting
  the test architecture wrong means either flaky tests or untested bypass
  vectors -- both unacceptable for SSRF prevention.

### Consultation 3: Cloudflare Workers Runtime Constraints

- **Agent**: edge-minion
- **Planning question**: What Cloudflare Workers runtime constraints affect
  the URL validation module design?
  (a) With `nodejs_compat` enabled, which DNS resolution APIs are available?
  `dns.resolve4()`, `dns.resolve6()`, `dns.promises.resolve4()`? Or should
  we use a different approach (e.g., `fetch` to a DNS-over-HTTPS endpoint)?
  (b) Does Browser Rendering accept a pre-resolved IP address in place of a
  hostname? If not, how do we implement DNS pinning -- can we pass resolved
  IPs via custom headers, or does the binding handle this differently?
  (c) What are the CPU time and wall-clock limits for DNS resolution within a
  Worker request? Could multiple DNS lookups (initial + per redirect hop)
  exceed limits?
  (d) Are there Cloudflare-internal IP ranges or metadata service endpoints
  accessible from within a Worker that should be blocked?
  (e) How does `fetch()` handle redirects within Workers -- does it follow
  them automatically, and can we intercept each hop?
- **Context to provide**: `wrangler.toml`, `package.json`, the DNS pinning
  and redirect chain requirements from the issue.
- **Why this agent**: The implementation strategy depends critically on what
  the Workers runtime actually supports. If `dns.resolve4()` is not available
  under `nodejs_compat`, the entire DNS pre-resolution approach needs to
  change. If Browser Rendering cannot accept raw IPs, the DNS pinning
  mechanism needs a different design. These are plan-altering constraints
  that must be understood before writing task prompts.

---

## Cross-Cutting Checklist

- **Testing**: INCLUDE (test-minion, Consultation 2). The test suite is a
  primary deliverable. test-minion needs to advise on Miniflare DNS mocking,
  parameterized test structure, and coverage of all 8+ bypass vectors.

- **Security**: INCLUDE (security-minion, Consultation 1). This is the most
  security-critical module in the system. security-minion must validate the
  threat model, identify missing bypass vectors, and advise on validation
  ordering.

- **Usability -- Strategy**: INCLUDE (ux-strategy-minion). Planning question:
  This module's "users" are the other modules in this codebase that will call
  it (primarily the capture endpoint in Step 3). What should the module's
  API shape look like for clarity and safety? Specifically: should it return
  a result object (with the resolved IP for DNS pinning) or throw? Should
  error messages be developer-facing (for debugging) or user-facing (for
  API responses)? How do we make the "pit of success" as wide as possible
  so callers cannot accidentally skip validation?

- **Usability -- Design**: EXCLUDE. No user-facing interface. This is an
  internal module consumed by other code.

- **Documentation**: INCLUDE (software-docs-minion). Planning question:
  What documentation does a security-critical validation module need?
  Should the module have inline JSDoc documenting each check and why it
  exists? Should there be a standalone doc listing all blocked vectors
  (useful for security audits)? What level of documentation makes this
  module auditable by someone who did not write it?

- **Observability**: EXCLUDE. This is a pure validation function, not a
  runtime service. It will be called within request handlers that have
  their own observability (added in later steps). Adding logging to the
  validation module itself would be premature -- YAGNI applies.

---

## Anticipated Approval Gates

1. **Module API design + validation order** (MUST gate): The function
   signature, return type, and validation pipeline order are hard to
   reverse once callers depend on them. security-minion and
   ux-strategy-minion will likely have opinions on the API shape. This
   gate has 2+ downstream dependents (implementation task, test task,
   and all future steps that call the module). Getting the contract
   wrong means rewriting the module and all its callers.

2. **DNS resolution strategy** (MUST gate, possibly consolidated with #1):
   Whether to use `dns.resolve*()`, DNS-over-HTTPS, or `fetch()` with
   `redirect: 'manual'` is a hard-to-reverse architectural decision
   that depends on edge-minion's findings about Workers runtime
   constraints. If the chosen approach does not work, the entire
   implementation must be rewritten.

---

## Rationale

This task is narrowly scoped (one module, one test file) but
security-critical with platform-specific constraints. The three primary
consultations cover the three axes of risk:

- **security-minion** covers *what* to validate (threat model completeness)
- **test-minion** covers *how to verify* it works (test architecture in
  Miniflare)
- **edge-minion** covers *what is possible* (runtime constraints that
  determine implementation strategy)

ux-strategy-minion and software-docs-minion are included per cross-cutting
requirements, with focused planning questions that add value without
bloating the planning phase.

I am deliberately not including ai-modeling-minion (no LLM involvement),
frontend-minion (no UI), data-minion (no database), api-design-minion
(internal module, not an API endpoint), or observability-minion (pure
function, no runtime telemetry needed yet).

---

## External Skill Integration

No external skills detected in project. `.claude/skills/` and `.skills/`
directories do not exist.
