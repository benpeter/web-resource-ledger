## Domain Plan Contribution: test-minion

### Recommendations

**1. Script format: Shell (curl-based), not Node.js**

A shell script with `curl` and `jq` is the right choice here. Reasons:

- Zero dependency footprint. The smoke test should validate the deployed Worker, not exercise a Node.js test harness. `curl` and `jq` are available on every GitHub Actions runner and every developer's machine.
- The project's engineering philosophy explicitly favors lightweight, vanilla solutions (CLAUDE.md: "What does this dependency give me that I can't do in 10 lines of vanilla code?"). A Node.js smoke test would pull in `node-fetch` or similar for something `curl` handles natively.
- Shell scripts are transparent. Every HTTP call is visible as a single line. No abstraction layers, no test framework output to parse.
- The existing CI workflow (`ci.yml`) already runs `npm test` for unit/integration tests via Vitest. The smoke test serves a fundamentally different purpose -- it validates a live deployment, not isolated code. Mixing it into the Vitest suite would conflate two concerns.

**2. Scope: Health check + security headers + signing key + capture round-trip + ToS endpoint**

The smoke test should validate five things, in escalating order of cost:

1. **Health endpoint** (`GET /health`): Confirms the Worker is deployed and responding. If this fails, everything else is pointless. Assert: HTTP 200, body contains `{"status":"ok"}`.

2. **Security headers**: On the health response, verify the four mandatory security headers are present (`Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`). This catches deployment misconfigurations that strip headers.

3. **Signing key endpoint** (`GET /.well-known/signing-key`): Confirms the signing key secret is configured in staging. Assert: HTTP 200, JSON body has `algorithm` and `publicKey` fields. This validates that secrets propagated correctly -- a common staging environment failure mode.

4. **Capture round-trip** (`POST /v1/captures` -> poll status -> `GET /v1/captures/{id}`): This is the core value. A health check passing while captures are broken (misconfigured R2 bucket, missing Browser binding, wrong KV namespace) gives false confidence. The capture round-trip is the only test that exercises the full stack: auth, KV write, browser rendering, R2 storage, KV update, retrieval. Assert: 202 on create, eventual `complete` or `failed` status on poll, capture metadata retrievable if complete.

5. **ToS endpoint/headers** (if R7 adds a ToS endpoint or Link header): Assert the ToS is accessible and linked from API responses. The specific check depends on R7's implementation -- if it's a `Link` header on all responses, check it on the health endpoint. If it's a dedicated `/tos` endpoint, hit it and assert 200.

**Why include the capture round-trip despite the 5-30s cost:**

The issue's success criteria explicitly require "health check + capture round-trip." More importantly, the staging environment's purpose is to validate that the full stack works before production deploy. A health-check-only smoke test would miss the most common staging failures: misconfigured bindings, missing secrets, browser session pool issues. The capture round-trip is the minimum useful integration test for a live deployment.

**Why accept `failed` status as passing:**

The capture may fail in staging because the target URL is unreachable, the browser session pool is cold, or rate limits are hit. The smoke test should distinguish between:
- **Infrastructure working** (got 202, status polled successfully, final status reached) = PASS
- **Infrastructure broken** (connection refused, 500 on create, status never resolves) = FAIL

A `failed` capture status with a valid error message means the Worker is running correctly -- it just couldn't render that particular page. The smoke test should log this as a warning, not a failure.

**3. Timeout and retry strategy**

- **Health check**: No retries. If `/health` doesn't respond within 10s on first try, the deploy failed.
- **Capture polling**: Poll `GET /v1/captures/{id}/status` every 5 seconds (matching the `Retry-After: 5` header the API returns), with a maximum of 12 attempts (60s total). This accommodates both fast captures (~5s) and slow ones (~30s) with headroom for cold-start browser session acquisition.
- **Overall script timeout**: 90 seconds. This leaves buffer beyond the 60s polling window for the initial create request, final retrieval, and ToS checks.
- **No blind retries on non-polling requests**: If `POST /v1/captures` returns 500 or 503, the smoke test fails immediately. Retrying hides real deployment problems.

**4. Standalone script that also runs as a GitHub Actions step**

The script should be a standalone executable (`scripts/smoke-test.sh`) that:
- Accepts `STAGING_URL` and `STAGING_API_KEY` as environment variables
- Can be run locally: `STAGING_URL=https://wrl-staging.workers.dev STAGING_API_KEY=xxx ./scripts/smoke-test.sh`
- Is invoked from the GitHub Actions deploy workflow as a step after `wrangler deploy`
- Uses exit code 0 for pass, exit code 1 for fail
- Outputs structured, human-readable results (not JSON, not TAP -- just clear pass/fail lines)

This dual-use design means developers can run the same smoke test against any environment (staging, local dev via `wrangler dev`, even production in read-only mode by skipping the capture step).

**5. Script structure**

```
scripts/smoke-test.sh
```

Required environment variables:
- `SMOKE_URL` -- base URL of the deployed Worker (e.g., `https://wrl-staging.example.workers.dev`)
- `SMOKE_API_KEY` -- API key for the staging environment

Optional:
- `SMOKE_CAPTURE_URL` -- URL to capture (default: `https://example.com`, a stable, fast-loading target)
- `SMOKE_TIMEOUT` -- overall timeout in seconds (default: 90)
- `SMOKE_SKIP_CAPTURE` -- set to `1` to skip the capture round-trip (useful for read-only checks against production)

The script should use `set -euo pipefail` and follow the bash test organization pattern from memory (pass/fail counters, color-coded output, summary at end).

### Proposed Tasks

**Task 1: Create smoke test script**

- **What**: Write `scripts/smoke-test.sh` implementing the five-check strategy described above.
- **Deliverables**: Executable shell script, `chmod +x`, with inline documentation of each check and its expected outcomes.
- **Dependencies**: The staging environment must exist (wrangler.toml env section) and have secrets configured. If R7 (ToS) adds an endpoint or header, the ToS check needs to know what to look for -- coordinate with whoever implements R7.

**Task 2: Add smoke test step to GitHub Actions deploy workflow**

- **What**: In the staging deploy workflow (new or extended `ci.yml`), add a step after `wrangler deploy --env staging` that runs `./scripts/smoke-test.sh` with `SMOKE_URL` and `SMOKE_API_KEY` injected from GitHub secrets.
- **Deliverables**: Updated workflow YAML with the smoke test step. The step should have a clear name like "Smoke test staging deployment" and should fail the workflow if the smoke test fails.
- **Dependencies**: Task 1 (script must exist). GitHub secrets `WRL_STAGING_URL` and `WRL_STAGING_API_KEY` must be configured (iac-minion concern).

**Task 3: Add package.json script entry for local use**

- **What**: Add `"smoke"` script to `package.json` that runs `./scripts/smoke-test.sh`. This gives developers a discoverable entry point: `npm run smoke`.
- **Deliverables**: Updated `package.json` scripts section.
- **Dependencies**: Task 1.

**Task 4: Validate ToS visibility in smoke test (conditional on R7 implementation)**

- **What**: Once R7 decides on the mechanism for exposing ToS (Link header, dedicated endpoint, or both), add the corresponding check to the smoke test script.
- **Deliverables**: Updated `scripts/smoke-test.sh` with ToS-specific assertions.
- **Dependencies**: R7 implementation decision. If R7 adds a `Link` header to all responses, the health check already fetches the response -- just add a header assertion. If R7 adds a `/tos` endpoint, add a new check.

### Risks and Concerns

**Risk 1: Capture round-trip flakiness in CI**

The capture round-trip depends on: (a) the Cloudflare Browser Rendering session pool having capacity, (b) `example.com` being reachable from the Worker, (c) the capture completing within the polling window. Any of these can fail intermittently.

**Mitigation**: Accept both `complete` and `failed` as passing outcomes (validates the infrastructure works). Only fail the smoke test when the infrastructure itself is broken (no response, 500, timeout on status polling). Log the capture status and error for debugging without failing the build.

**Risk 2: API key management for staging**

The smoke test requires a valid `STAGING_API_KEY`. This key must be: (a) configured as a Cloudflare Worker secret for the staging environment, (b) stored as a GitHub Actions secret, (c) different from the production key. If any of these fall out of sync, the smoke test fails with 401 -- which is indistinguishable from a real auth misconfiguration unless the error message is clear.

**Mitigation**: The smoke test should output the HTTP status code and response body on failure. A 401 with "Invalid API key" clearly points to a key mismatch. A 503 with "Service is not configured" points to a missing `CAPTURE_API_KEY` Worker secret.

**Risk 3: Rate limiting in staging**

The staging environment uses the same rate limit configuration as production (10 captures/minute per IP, 200 global). If the smoke test runs repeatedly (e.g., multiple pushes to main in quick succession), rate limits could cause false failures.

**Mitigation**: The smoke test makes exactly 1 capture request per run. Even with rapid redeploys, hitting 10/minute is unlikely. If it becomes a problem, the staging environment can use relaxed rate limits in `wrangler.toml` under the `[env.staging]` section. The smoke test should also explicitly check for 429 responses and report them distinctly from other failures.

**Risk 4: `jq` not available**

While `jq` is pre-installed on GitHub Actions ubuntu-latest runners, some developer machines may not have it.

**Mitigation**: The script should check for `jq` at the top and print a clear error message if missing. Alternatively, use `grep` and `cut` for simple JSON field extraction, but `jq` is far more reliable for parsing `application/problem+json` responses. Prefer the `jq` dependency with a clear prerequisite check.

**Risk 5: ToS implementation not finalized when smoke test is written**

If R7 and R9 are implemented in the same phase, the ToS endpoint/header mechanism might not be decided when the smoke test is first written.

**Mitigation**: Write the smoke test with a clearly marked placeholder for the ToS check. Use a simple pattern like `# TODO: R7 -- add ToS check when endpoint is decided`. Or better, implement R7 first, then R9, so the smoke test can include the ToS check from the start.

### Additional Agents Needed

**iac-minion** -- The smoke test requires staging environment infrastructure (Cloudflare Worker environment with isolated KV namespace, R2 bucket, Browser binding, and secrets). The iac-minion should confirm the `wrangler.toml` staging environment configuration is correct and that GitHub Actions secrets for the staging API key and URL are provisioned. The smoke test script itself is test-minion's concern, but the infrastructure it runs against is iac-minion's.

No other additional agents are needed. The security-minion's concerns (separate staging API key, no production key leakage) are addressed by the architecture of using GitHub Actions secrets and environment-specific Worker secrets. The api-design-minion's concerns (ToS endpoint design) are part of R7 and feed into Task 4 above.
