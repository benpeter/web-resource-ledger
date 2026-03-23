# Meta-Plan: E2E Playwright Test Suite for WRL

## Scope

**Goal**: Create a Playwright-based end-to-end test suite in `tests/e2e/` that validates six user journeys against the WRL staging environment (`wrl-staging.benpeter.workers.dev`), plus a GitHub Actions workflow to run them.

**In scope**: Playwright test suite, CI workflow (`e2e-tests.yml`), six user journey tests (signup, batch capture, scheduled capture, webhook delivery, quota enforcement, public verification), test fixtures/helpers, screenshot-on-failure, trace artifacts.

**Out of scope**: Visual regression, performance benchmarking, load testing, accessibility testing, mobile viewports.

**Critical scope finding**: Two of the six requested test scenarios reference features that do not exist in the codebase:
1. **Scheduled captures** -- Parking lot item (`[consider] Scheduled captures (cron-style)`). No cron trigger, no scheduling API, no scheduling database table. Cannot write an e2e test for a nonexistent feature.
2. **Share link generation** -- No dedicated share link API exists. The verify page (`GET /v1/verify/:id`) is already public without auth. There is no "generation" step -- the URL is deterministic from the capture ID. The test can validate that the public verification page loads and validates a signature, but there is no share link CRUD to test.

Planning must resolve what to do with these two gaps: skip them, test the closest existing analog, or flag them as deferred.

## Planning Consultations

### Consultation 1: Test Architecture and Playwright Configuration
- **Agent**: test-minion
- **Planning question**: Given that WRL is a Cloudflare Workers app tested against a remote staging environment (not a local dev server), what is the right Playwright project configuration? Specifically: (a) How should auth state be managed across tests -- should the OAuth signup flow run once in a global setup and share session cookies, or should each test independently authenticate via API key? (b) The OAuth flow involves GitHub OAuth with PKCE and browser redirects -- should we mock GitHub's OAuth endpoint or test against real GitHub (which requires a test GitHub account and real credentials)? (c) How should the webhook delivery test create a publicly reachable endpoint for callback verification -- a Workers-based test receiver, webhook.site, or something else? (d) What is the recommended approach for the scheduled capture test given that the feature does not exist? (e) How should test isolation work when all tests hit a shared staging environment with real D1/R2/KV state?
- **Context to provide**: `package.json` (current deps), `vitest.config.js` (existing test config), `test/fixtures.js` (auth helpers, GitHub OAuth stubs), `scripts/smoke-test.sh` (existing staging smoke test), `wrangler.toml` (staging env config including queues, D1, R2, KV), `src/oauth.js` (OAuth flow with `env._githubFetch` injection point), success criteria (5-min timeout, parallel test execution, screenshot/trace artifacts)
- **Why this agent**: test-minion owns test strategy, test architecture, and CI test pipeline design. The core planning challenge is how to structure e2e tests against a remote Workers environment with OAuth, queues, and shared state.

### Consultation 2: CI Workflow and Infrastructure
- **Agent**: iac-minion
- **Planning question**: Design the `e2e-tests.yml` GitHub Actions workflow. Key questions: (a) How should Playwright browser binaries be cached to avoid download on every run? (b) What secrets need to be configured in GitHub Actions for staging access (API key, admin key, OAuth test credentials)? (c) Should the workflow depend on a successful deployment to staging first, or assume staging is always available? (d) What's the right trigger -- push to main, PR, manual dispatch, or some combination? (e) How should test artifacts (screenshots, traces) be uploaded and retained? (f) Should the workflow use Playwright's built-in sharding for parallelism or is that overkill for 6 tests?
- **Context to provide**: `.github/workflows/ci.yml` (existing CI pattern with code-change detection), `scripts/smoke-test.sh` (existing staging validation), staging URL (`wrl-staging.benpeter.workers.dev`), the fact that staging secrets are in 1Password WRL vault
- **Why this agent**: iac-minion owns CI/CD pipelines, GitHub Actions workflow design, and caching strategies. The workflow must efficiently manage Playwright browser binaries, secrets, and artifact collection.

### Consultation 3: Security of Test Credentials and Staging Auth
- **Agent**: security-minion
- **Planning question**: The e2e tests need to authenticate against staging. Several approaches exist: (a) Use the admin API to create a test tenant and API key as part of test setup -- this requires the staging ADMIN_KEY in CI secrets. (b) Pre-provision a dedicated test tenant and store its API key in CI secrets. (c) For OAuth tests, create a dedicated GitHub OAuth test account or use the existing `env._githubFetch` injection point to mock GitHub's response (but this only works in unit tests, not when hitting the real staging Worker). What are the security implications of each approach? What secrets should be in GitHub Actions, and how should test cleanup prevent credential leakage or staging data accumulation?
- **Context to provide**: `src/oauth.js` (env._githubFetch injection point -- only works when the Worker is instantiated in-process), `test/fixtures.js` (existing auth helpers), `wrangler.toml` (staging env vars, GITHUB_CLIENT_ID for staging is `Ov23li0lii7I7Y43lbUs`), the 1Password WRL vault structure, the fact that staging has separate D1/R2/KV from production
- **Why this agent**: security-minion must evaluate the credential management model for CI, ensure test credentials don't leak, and assess whether a real GitHub OAuth flow in CI is safe vs. whether an alternative auth path should be used.

### Consultation 4: Webhook Test Receiver Strategy
- **Agent**: api-design-minion
- **Planning question**: The webhook delivery test needs a publicly reachable endpoint that can (a) receive POST requests from the staging Worker, (b) intentionally return 5xx on first attempt to test retry behavior, (c) succeed on retry, and (d) allow the test to verify the delivered payload and HMAC signature. Three options: (1) Deploy a lightweight Cloudflare Worker as a test webhook receiver with configurable behavior (fail-then-succeed), (2) use webhook.site or similar SaaS, (3) use a tunnel (ngrok/cloudflared) from the CI runner. Which approach best balances reliability, security, and simplicity? What about the HMAC signature verification -- should the test receiver validate signatures, or should the Playwright test fetch the delivery log from the receiver and verify client-side?
- **Context to provide**: `src/webhook-dispatch.js` (delivery flow with HMAC signing, retry schedule [60s, 300s, 900s]), `src/webhook-signing.js` (SIGNATURE_HEADER, TIMESTAMP_HEADER format), `src/webhooks.js` (CRUD + ping endpoint), the constraint that tests must complete within 5 minutes total (retry delays are a problem)
- **Why this agent**: api-design-minion understands webhook delivery patterns and can evaluate which receiver approach produces reliable, testable webhook behavior without introducing flaky external dependencies.

### Consultation 5: User Journey Coherence
- **Agent**: ux-strategy-minion
- **Planning question**: Review the six proposed test scenarios against actual user journeys. Two scenarios reference features that don't exist (scheduled captures, share link generation). For the existing features: (a) Does the signup-through-verification test accurately represent how a real user would onboard? The flow in the code is: `/auth/login` -> GitHub redirect -> `/auth/callback` -> `/v1/account/first-key` -> use API key for captures. (b) The "share link" test -- the verify page is already public. Is the right test to verify that `/v1/verify/{id}` loads without auth and validates the signature? Or is there a user journey gap here that should be flagged? (c) Are there user journeys that the six tests DON'T cover but should -- e.g., the web UI dashboard flow, the account settings key management flow?
- **Context to provide**: `src/oauth.js` (full signup flow), `src/verify-page.js` (public verification page), `docs/backlog.md` (scheduled captures in parking lot), the six test scenarios from the success criteria
- **Why this agent**: ux-strategy-minion ensures the tests map to real user jobs-to-be-done, not just API endpoint coverage. Catches gaps where the test suite misses critical user paths.

### Consultation 6: Documentation Requirements
- **Agent**: software-docs-minion
- **Planning question**: What documentation should accompany the e2e test suite? Consider: (a) A README in `tests/e2e/` explaining how to run tests locally against staging, required environment variables, and how to interpret results. (b) Updates to the main README or CONTRIBUTING.md to reference the e2e test suite. (c) ADR or decision record for the test architecture choices (why Playwright over Cypress, why remote staging vs local, webhook receiver strategy). Should these be separate deliverables or embedded in the evolution log?
- **Context to provide**: `docs/evolution/` structure (prompt.md, decisions.md, outcome.md pattern), existing test documentation (vitest.config.js comments, integration test comments)
- **Why this agent**: software-docs-minion ensures the test suite is documented well enough for future contributors to run and extend it.

## Cross-Cutting Checklist

- **Testing**: INCLUDED -- test-minion is the primary planning consultant (Consultation 1). This is fundamentally a testing task.
- **Security**: INCLUDED -- security-minion consulted for test credential management and staging auth model (Consultation 3). Tests require secrets in CI and interact with OAuth flows.
- **Usability -- Strategy**: INCLUDED -- ux-strategy-minion reviews journey coherence and identifies gaps in the test scenarios (Consultation 5).
- **Usability -- Design**: NOT INCLUDED for planning -- the e2e tests don't produce user-facing interfaces. The tests interact with existing UI but don't create new UI. If test reports need design review, that's post-execution.
- **Documentation**: INCLUDED -- software-docs-minion consulted for test suite documentation (Consultation 6).
- **Observability**: NOT INCLUDED for planning -- the test suite itself is not a production runtime component. Test result reporting is handled by Playwright's built-in HTML reporter and CI artifacts. No custom metrics/logging/tracing needed for the test infrastructure itself.

## Notable Exclusions

- **frontend-minion**: The e2e tests interact with existing frontend pages (verify page, UI dashboard) but don't create or modify frontend code. Frontend expertise not needed for planning.
- **oauth-minion**: While the tests exercise the OAuth flow, the planning question is about test strategy (mock vs real GitHub), not about OAuth protocol correctness. security-minion covers the credential management aspect.
- **observability-minion**: The test suite doesn't produce runtime services. CI test results and artifacts are standard Playwright/GitHub Actions concerns handled by iac-minion and test-minion.

## Anticipated Approval Gates

1. **Test architecture decision** (MUST gate) -- How to handle OAuth in e2e tests (mock GitHub vs. real GitHub account vs. bypass with direct API key auth) has downstream impact on every test and on CI secret requirements. Hard to reverse once tests are written against one model. High blast radius: all 6 tests depend on the auth model.

2. **Webhook test receiver strategy** (MUST gate) -- Whether to deploy a Workers-based test receiver, use webhook.site, or tunnel. Affects CI infrastructure, reliability, and the webhook retry test design. The retry delay schedule (60s, 300s, 900s) is a known problem for a 5-minute test budget.

3. **Scope resolution for nonexistent features** (MUST gate) -- The scheduled capture test and share link test reference features that don't exist. User must decide: skip those tests, test the closest analog, or build the features first.

## Rationale

The six specialists were chosen because this task sits at the intersection of:
- **Test engineering** (test-minion): core domain -- Playwright configuration, test isolation, auth patterns against remote staging
- **CI infrastructure** (iac-minion): GitHub Actions workflow, browser caching, secrets management, artifact upload
- **Security** (security-minion): credentials in CI, staging auth model, test GitHub account implications
- **API design** (api-design-minion): webhook receiver architecture for delivery verification testing
- **UX strategy** (ux-strategy-minion): ensuring tests map to real user journeys, not just endpoint coverage
- **Documentation** (software-docs-minion): test suite documentation, local run instructions

The most complex planning question is how to handle OAuth authentication in e2e tests. The existing codebase has `env._githubFetch` for in-process test injection, but e2e tests hit the real staging Worker over HTTP -- that injection point is unavailable. The team needs to determine whether tests use a real GitHub test account, bypass OAuth via pre-provisioned API keys, or use another mechanism.

The second complexity is the webhook retry test: the retry schedule has delays of 60s, 300s, 900s which far exceed the 5-minute test budget. The team needs a strategy for testing retry behavior without waiting for real queue delays.

## External Skill Integration

No external skills detected in project.
