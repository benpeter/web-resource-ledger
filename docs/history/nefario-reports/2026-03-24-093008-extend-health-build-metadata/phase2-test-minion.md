# Test Strategy: Health Endpoint Build Metadata

## 1. Current State

**smoke-test.sh** (4 checks): Health, Security Headers, Signing Key, Capture Round-trip. Check 1 hits `/health`, asserts HTTP 200 and `.status == "ok"`. No retry logic -- single curl, immediate pass/fail. Already has the `SMOKE_SKIP_CAPTURE` pattern for optional checks.

**health.test.js** (vitest + cloudflare:test): 4 tests using `SELF.fetch`. Asserts `{ status: 'ok' }` via `toMatchObject` (partial match -- tolerant of extra keys). Checks `legal.terms` and `legal.policy` strings. Also tests trailing-slash normalization, POST 404, and absence of rate-limit headers.

**vitest.config.js**: Uses `@cloudflare/vitest-pool-workers` with `wrangler.test.toml`. Bindings are injected via `miniflare.bindings`. No `define` configuration exists. The Worker runs inside miniflare's workerd runtime, not Node.

**wrangler.toml / deploy workflows**: `wrangler-action` v3.14.1 with `apiToken` and optional `environment`. No `--define` flags are passed today. The action supports a `command` property for custom wrangler invocations, but staging/production deploys use the default (which runs `wrangler deploy`).

**handleHealth()** in `src/index.js` (line 578): Pure function, takes no arguments, returns a static JSON body. No access to `env` bindings.

## 2. Smoke Test: Commit Verification Retry Strategy

### Recommendation: Separate Check (not integrated into Check 1)

Add a new **Check 5: Build version** after the existing health check. Reasons:

1. **Check 1 is a gate** -- if it fails, the script aborts (`FATAL`). Mixing propagation retry into the gate check means a 45-second retry loop before we even know the Worker is alive. Keep Check 1 fast and binary.
2. **Different failure semantics** -- Check 1 failing means "Worker is down." Check 5 failing means "Worker is up but serving stale code." These are different operational conclusions requiring different remediation.
3. **Skippability** -- the commit check must be skippable for local/manual runs. That logic is cleaner as a separate check with its own skip condition, following the `SMOKE_SKIP_CAPTURE` precedent.

### Retry Parameters

Cloudflare Workers deploy via a global network with ~300 PoPs. Observed propagation characteristics:
- Typical propagation: 1-5 seconds for most PoPs
- Worst-case tail: ~30 seconds for globally distributed edge caches to purge/update
- The smoke test runner (GitHub Actions ubuntu-latest) hits a single PoP, so you are testing one path, not global propagation -- but a stale edge cache can still serve the old Worker for tens of seconds

**Proposed strategy:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Max retries | 6 | 6 attempts before failure |
| Interval | 5 seconds | Aggressive enough for fast feedback, not wasteful |
| Total timeout | 30 seconds max | Covers the observed worst-case propagation tail |
| Backoff | Fixed, not exponential | Workers propagation is not a congestion problem -- exponential backoff does not model the failure mode. We are waiting for an eventually-consistent update, not backing off from overload. Fixed interval with a count cap is simpler and equally effective. |

### Skip Logic

Use `GITHUB_SHA` as the implicit enable/disable signal. The variable is automatically set by GitHub Actions. When absent (local runs, `workflow_dispatch` without context), the check prints "SKIPPED" and adds no pass/fail. This avoids a new env var (`SMOKE_SKIP_COMMIT`) and is self-documenting -- the check runs exactly when the information is available.

```bash
# --- Check 5: Build version ---
if [ -z "${GITHUB_SHA:-}" ]; then
  echo "Check 5: Build version (SKIPPED -- GITHUB_SHA not set)"
else
  echo "Check 5: Build version matches deployed commit"
  EXPECTED_SHA="${GITHUB_SHA:0:7}"  # short SHA, or full -- depends on what /health returns
  ATTEMPTS=0
  MAX_ATTEMPTS=6
  MATCH=false

  while [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; do
    DEPLOYED_SHA=$(curl -sf "${SMOKE_URL}/health" 2>/dev/null | jq -r '.build.commit // empty')
    if [ "$DEPLOYED_SHA" = "$EXPECTED_SHA" ]; then
      MATCH=true
      break
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ] && sleep 5
  done

  if [ "$MATCH" = true ]; then
    pass "Deployed commit ${DEPLOYED_SHA} matches expected ${EXPECTED_SHA}"
  else
    fail "Deployed commit '${DEPLOYED_SHA:-empty}' does not match expected '${EXPECTED_SHA}' after ${MAX_ATTEMPTS} attempts"
  fi
fi
```

### SHA Format Decision

Compare the **short SHA** (first 7 characters) rather than the full 40-char SHA. Rationale:
- `--define` values are baked into the bundle. Short SHA is conventional and sufficient for uniqueness.
- The health response is public -- shorter SHA is marginally less information surface.
- GitHub Actions' `GITHUB_SHA` is always 40 chars; truncating in the comparison (`${GITHUB_SHA:0:7}`) is trivial.

Both the `--define` value at build time and the comparison at smoke time should use the same truncation (7 chars). Document this in the `handleHealth` implementation.

### Workflow Changes

The smoke jobs in both `deploy-staging.yml` and `deploy-production.yml` must pass `GITHUB_SHA` to the smoke script. In the staging workflow this is straightforward (add `GITHUB_SHA: ${{ github.sha }}`). In the production workflow, `github.sha` is the correct ref when triggered by `workflow_run` because the checkout already uses `${{ github.event.workflow_run.head_sha || github.sha }}`. The smoke step must use the same ref -- pass `GITHUB_SHA: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}` and truncate consistently.

**Risk: `workflow_dispatch` with `inputs.ref` as a branch name.** The `inputs.ref` can be a tag or branch name, not a SHA. The deploy step resolves it via `actions/checkout`, but the smoke step only has the string. If `inputs.ref` is not a SHA, the commit check should be skipped. Add a guard: `echo "$GITHUB_SHA" | grep -qE '^[0-9a-f]{7,40}$'` -- if it does not match a hex pattern, skip the check.

## 3. Unit Test Strategy for Build Metadata Globals

### The Problem

The build metadata values (`COMMIT_SHA`, `BUILD_VERSION`, `DEPLOY_TIMESTAMP`, `ENVIRONMENT`) will be injected via wrangler `--define` flags at deploy time. These are compile-time string replacements (like C `#define`) -- the identifier is literally replaced in the bundled source code. In the vitest/miniflare test environment, no `--define` values are applied, so the globals will be `undefined` at test time.

### Approach: Graceful Defaults in the Implementation

The `handleHealth` function should handle undefined globals gracefully:

```js
function handleHealth() {
  return jsonResponse({
    status: 'ok',
    build: {
      commit: typeof COMMIT_SHA !== 'undefined' ? COMMIT_SHA : 'dev',
      version: typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'dev',
      deployedAt: typeof DEPLOY_TIMESTAMP !== 'undefined' ? DEPLOY_TIMESTAMP : null,
      environment: typeof ENVIRONMENT !== 'undefined' ? ENVIRONMENT : 'development',
    },
    legal: {
      terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
      policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
    },
  });
}
```

Key: Use `typeof X !== 'undefined'` (not `X ?? 'dev'`) because `--define` globals that are not defined at all will throw `ReferenceError` on access, not return `undefined`. The `typeof` check is the correct pattern for potentially-undeclared globals.

### Test Updates for health.test.js

The existing tests use `toMatchObject({ status: 'ok' })` which is already tolerant of additional keys. **The existing tests will not break** when `build` is added to the response. However, we should add explicit assertions for the new fields:

```js
it('returns 200 with status ok, build info, and legal URLs', async () => {
  const response = await SELF.fetch('https://example.com/health');
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('application/json');
  const body = await response.json();
  expect(body).toMatchObject({ status: 'ok' });

  // Build metadata -- fallback values in test environment (no --define)
  expect(body.build).toBeDefined();
  expect(body.build.commit).toBe('dev');
  expect(body.build.version).toBe('dev');
  expect(body.build.deployedAt).toBeNull();
  expect(body.build.environment).toBe('development');

  // Legal URLs unchanged
  expect(body.legal).toBeDefined();
  expect(body.legal.terms).toContain('TERMS.md');
  expect(body.legal.policy).toContain('CONTENT-POLICY.md');
});
```

This tests the **fallback path** (no `--define` globals set). The actual `--define` injection path is tested by the smoke test against a real deployment -- that is the correct boundary (the define mechanism is wrangler's responsibility, not ours).

### Alternative Considered and Rejected: Injecting `--define` in Vitest Config

We could add `define: { COMMIT_SHA: '"test-sha"', ... }` to `vitest.config.js`. This is rejected because:

1. **It does not test the real code path.** In tests we would always see the test-injected values, never verifying the fallback behavior that protects local `wrangler dev` and `wrangler dev --env staging` runs.
2. **It couples test config to implementation details.** Every new `--define` global requires a corresponding change in vitest.config.js -- a maintenance burden with zero confidence gain.
3. **The smoke test already covers the define-injection path.** The right place to verify that `--define` values propagate into `/health` is a deployed environment, not a mocked one.

### Alternative Considered and Rejected: Using `miniflare.bindings`

`--define` globals are not env bindings -- they are compile-time text replacements. Miniflare bindings go to `env.*`, not to global scope. Using bindings would require changing the implementation to read from `env` instead of globals, which would make the values mutable at runtime. The `--define` approach is correct for immutable build metadata; the test should exercise the fallback path, not simulate the injection mechanism.

## 4. Integration Test Considerations

The `vitest.integration.config.js` runs against a real wrangler environment. If integration tests are executed against a locally running `wrangler dev`, the build globals will also be undefined (same fallback values). No integration test changes needed for this feature -- the deployed-environment verification belongs exclusively to the smoke test.

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `typeof` check gets refactored to direct access, causing ReferenceError in tests | Medium | High (all tests break) | Add a code comment explaining why `typeof` is required. Add a unit test that explicitly verifies the fallback values -- a refactor that breaks this pattern fails the test immediately. |
| Smoke test retry loop masks a broken deploy (Worker is up but serving old code permanently) | Low | Medium | The retry has a hard cap (6 attempts, 30s). If it does not converge, the check fails. The 30s window is generous for propagation but short enough to catch stuck deployments. |
| `GITHUB_SHA` not available in production smoke due to `workflow_run` event indirection | Medium | Low (check skips gracefully) | Explicitly pass `GITHUB_SHA` in the workflow env block. Verify with a dry run of the workflow. |
| `workflow_dispatch` with branch name as `inputs.ref` causes spurious commit mismatch failure | Medium | Medium (blocks manual rollback) | Guard with hex regex check before comparing. If not a SHA, skip the check. |
| Short SHA collision between old and new deploy (both start with same 7 chars) | Negligible | Low | 7 hex chars = 268 million possibilities. Consecutive commits with colliding short SHAs is astronomically unlikely. Not worth mitigating. |
| Build metadata in `/health` leaks information to attackers | Low | Low | The commit SHA and version are already public (open-source repo on GitHub). The deploy timestamp reveals when the last deploy happened, which is low-sensitivity. The environment name (`staging`/`production`) is inferrable from the URL. No sensitive information is exposed. |

## 6. Specific Tasks

### Task 1: Update `handleHealth()` with build metadata (implementation)
- Add `typeof` guarded globals for `COMMIT_SHA`, `BUILD_VERSION`, `DEPLOY_TIMESTAMP`, `ENVIRONMENT`
- Return them under a `build` key in the health response
- Add code comment explaining why `typeof` is required (not `??`)

### Task 2: Update unit tests in `test/health.test.js`
- Modify the primary test to assert `build` object with fallback values (`'dev'`, `null`, `'development'`)
- Existing `toMatchObject({ status: 'ok' })` assertions remain unchanged for backward compatibility tests
- The trailing-slash test should also verify `build` is present (partial match is fine)

### Task 3: Add `--define` flags to wrangler deploy commands
- In `deploy-staging.yml`: add `command: deploy --define COMMIT_SHA:'"${{ github.sha }}"' --define BUILD_VERSION:'"${{ env.VERSION }}"' --define DEPLOY_TIMESTAMP:'"${{ env.TIMESTAMP }}"' --define ENVIRONMENT:'"staging"'` to the wrangler-action step (or use the `vars` input if wrangler-action supports it)
- Same for `deploy-production.yml` with `ENVIRONMENT:'"production"'`
- Generate `VERSION` and `TIMESTAMP` in a preceding step: `echo "VERSION=$(jq -r .version package.json)" >> $GITHUB_ENV && echo "TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> $GITHUB_ENV`
- **Quoting matters**: `--define` values must be JSON strings, so they need the inner quotes: `'"value"'` not `'value'`

### Task 4: Add Check 5 to `smoke-test.sh`
- New check block between Check 4 and the Summary section
- Retry loop: 6 attempts, 5s fixed interval, compare short SHAs
- Skip when `GITHUB_SHA` is unset or does not match hex pattern
- Use the pseudo-code from section 2 above

### Task 5: Pass `GITHUB_SHA` in deploy workflow smoke steps
- `deploy-staging.yml` smoke step: add `GITHUB_SHA: ${{ github.sha }}`
- `deploy-production.yml` smoke step: add `GITHUB_SHA: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}`

### Task 6: Verify with `shellcheck`
- Run `shellcheck scripts/smoke-test.sh` after changes to catch quoting/syntax issues
- Ensure the retry loop uses `$((ATTEMPTS + 1))` not `((ATTEMPTS++))` (the latter triggers `set -e` exit when value is 0 -- documented in agent memory)

## 7. Test Verification Matrix

| What is tested | Where | Globals available? | Asserts |
|---------------|-------|--------------------|---------|
| Fallback values when `--define` not set | `test/health.test.js` (unit) | No | `build.commit === 'dev'`, `build.environment === 'development'`, etc. |
| Response shape includes `build` key | `test/health.test.js` (unit) | No | `body.build` is defined, has expected keys |
| `--define` values propagate to response | `smoke-test.sh` Check 5 (deployed) | Yes | `build.commit` matches `$GITHUB_SHA` (short) |
| Health still returns `status: ok` | `smoke-test.sh` Check 1 (deployed) | Yes | `.status == "ok"` (unchanged) |
| Existing response contract not broken | `test/health.test.js` (unit) | No | `toMatchObject({ status: 'ok' })`, legal URLs present |
