# Test-Minion Review: WRL MVP Planning

## Verdict: ADVISE

---

- [testing]: No test framework or test runner is specified anywhere in the 8-step implementation plan, leaving implementers to make that call ad hoc.
  SCOPE: Task 3 (Implementation Plan), all 8 GitHub issues
  CHANGE: Add a test infrastructure decision to the implementation plan. For Cloudflare Workers JS, the standard stack is Vitest + `@cloudflare/vitest-pool-workers` (which runs tests inside the Workers runtime via Miniflare). This belongs as an explicit prerequisite in Step 1, not a per-issue afterthought. The plan currently says "Plain JS, no framework" for the Worker -- that constraint should explicitly carve out a test runner.
  WHY: Without a named test runner, each implementer will choose differently or skip entirely. Cloudflare Workers have a non-standard runtime (no Node.js globals, Web Crypto API, KV/R2 bindings) -- tests that run in plain Node will not catch Worker-specific bugs. Vitest pool workers runs tests in the actual Miniflare runtime, which is the only reliable way to test Workers code without deploying.
  TASK: Task 3 (Implementation Plan), Issue 1 (Project Scaffold)

- [testing]: Step 1's verification criterion is "curl https://wrl.yourdomain.com/health returns 200" -- this requires a live deployment to verify the scaffold, making the first runnable artifact dependent on a Cloudflare account and `wrangler deploy`.
  SCOPE: Step 1 (Project Scaffold), Issue 1
  CHANGE: Add `wrangler dev` (local dev server via Miniflare) as the primary test loop for Steps 1-5. Deployed verification should be secondary. The acceptance criterion for Issue 1 should be "health check passes in `wrangler dev` local environment AND deployed environment." This gives developers a fast feedback loop that does not require every code change to be deployed.
  WHY: If the only verification path is a live deploy, developers will skip testing intermediate steps. `wrangler dev` provides a local Miniflare environment that supports R2, KV, and Browser Rendering stubs. This is the standard Cloudflare Workers development workflow and should be established in Step 1 before any feature work starts.
  TASK: Task 3 (Implementation Plan), Issue 1

- [testing]: The URL validation module (Step 2 / Issue 2) is the only component in the plan that explicitly requires unit tests. The plan calls for "unit tests with SSRF bypass attempts" but specifies no test vectors, no expected failure modes, and no pass/fail criteria in the issue's Acceptance Criteria section.
  SCOPE: Issue 2 (URL Validation and SSRF Prevention)
  CHANGE: The acceptance criteria for Issue 2 must enumerate the specific bypass classes that the test suite must cover. At minimum: hex-encoded IP (http://0x7f000001/), octal IP (http://0177.0.0.1/), decimal IP (http://2130706433/), IPv6-mapped IPv4 (http://[::ffff:127.0.0.1]/), DNS to loopback (requires a resolvable test hostname), and redirect to private IP after initial validation passes. Without named test cases, "unit tests" is unverifiable in the acceptance criteria.
  WHY: SSRF prevention is the plan's own identified "single most important security control in the entire system." A vague "has unit tests" acceptance criterion means an implementer can write three happy-path tests and close the issue. The bypass techniques are well-known -- they should be enumerated in the issue so the test suite can be reviewed for completeness.
  TASK: Issue 2

- [testing]: Ed25519 signing and SHA-256 manifest construction (Step 4 / Issue 4) have no test strategy. The bundleHash computation requires canonical JSON (sorted keys, no whitespace) -- this is a format constraint that is easily broken by implementation drift and impossible to detect without deterministic test vectors.
  SCOPE: Issue 4 (WACZ Bundling and Signing)
  CHANGE: Issue 4 acceptance criteria should require: (a) a test that constructs a known bundle, computes its bundleHash, signs it, and verifies the signature using the public key; (b) a test that verifies the canonical JSON serialization is stable across runs and implementations (sort keys, strip whitespace, identical output given identical inputs). These are unit-testable with Web Crypto API in the Miniflare test environment.
  WHY: The entire verification value prop depends on the signing round-trip working correctly. If canonical JSON is implemented differently in the signing step versus the verification step (Step 6), verification will fail for all captures. This is the kind of bug that only appears when two steps are integrated -- a unit test with a fixed test vector catches it immediately.
  TASK: Issue 4

- [testing]: The verification endpoint (Step 6 / Issue 6) is the core value proposition -- "let a third party verify the capture" -- but the plan contains no integration test that exercises the full capture-to-verify round trip.
  SCOPE: Issue 6 (Verification Endpoint), Task 3 (Implementation Plan)
  CHANGE: Add an explicit integration test requirement to Issue 6 (or as a separate Issue 9 if preferred): a test that calls POST /captures, polls GET /captures/{id}/status until complete, then calls GET /verify/{id} and asserts `verified: true`. This can run against `wrangler dev` with a real (non-private) URL. This is the only test that validates the entire system works end-to-end and is the definition of done for the MVP.
  WHY: Each step's unit tests verify isolated components. The signing test verifies the bundle is signed correctly. The verification test verifies the endpoint logic. But if the KV metadata schema written in Step 4 does not match what the verification endpoint reads in Step 6, both unit tests pass and the system is broken. A round-trip integration test is the only thing that catches integration bugs.
  TASK: Issue 6, Task 3 (Implementation Plan)

- [testing]: The GitHub issue acceptance criteria as specified in the issue format template are consistently stated as outcomes ("third parties can verify capture integrity via a public endpoint") rather than as verifiable checks ("GET /verify/{id} returns { verified: true } for a known-good capture stored in R2"). This pattern makes issues closable without any test evidence.
  SCOPE: Task 4 (GitHub Issues), all 8 issues
  CHANGE: The issue template's Acceptance Criteria section should require at least one criterion phrased as a verifiable check: an HTTP response code, a specific JSON field value, a command that can be run and compared to expected output, or a test that must pass. "Produces X" is a goal, not an acceptance criterion. The devx-minion prompt creating the issues should be updated to enforce this distinction.
  WHY: Acceptance criteria that describe outcomes rather than verifiable checks create ambiguity about when an issue is done. For a project where the implementer may also be the reviewer, unverifiable criteria are rubber stamps. Concrete criteria also serve as the specification for automated tests.
  TASK: Task 4
