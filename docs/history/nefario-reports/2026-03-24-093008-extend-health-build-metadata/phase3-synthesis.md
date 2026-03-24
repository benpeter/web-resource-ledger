## Delegation Plan

**Team name**: health-build-metadata
**Description**: Extend /health with build identity metadata injected at deploy time via wrangler --define

### Task 1: Implement build metadata in handleHealth and update unit tests
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Extend the /health endpoint in the WRL Worker with build identity metadata.
    This is a straightforward additive change -- the handler gains a `build` object
    and a Cache-Control header, and the unit tests assert the new shape.

    ## What to do

    ### 1. Modify `handleHealth()` in `src/index.js` (line 578)

    Add a `build` object to the response and set `Cache-Control: no-store`.
    The build metadata comes from wrangler `--define` globals that are injected
    at deploy time. During local dev / tests, these globals do not exist.

    Current code:
    ```js
    function handleHealth() {
      return jsonResponse({
        status: 'ok',
        legal: {
          terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
          policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
        },
      });
    }
    ```

    New code:
    ```js
    function handleHealth() {
      const body = {
        status: 'ok',
        legal: {
          terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
          policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
        },
      };

      // Build identity metadata -- injected at deploy time via wrangler --define.
      // Uses typeof guards because these are compile-time text replacements:
      // when not defined (local dev, tests), accessing them directly throws
      // ReferenceError. typeof on undeclared identifiers safely returns 'undefined'.
      if (typeof BUILD_COMMIT !== 'undefined') {
        body.build = {
          commit: BUILD_COMMIT,
          version: BUILD_VERSION,
          env: BUILD_ENV,
          deployedAt: BUILD_DEPLOYED_AT,
        };
      }

      return jsonResponse(body, 200, { 'Cache-Control': 'no-store' });
    }
    ```

    Key design decisions (already agreed upon -- do not deviate):
    - `build` is **optional** at the top level: absent during local dev, present when
      deployed via CI. This means NO fallback values like `'dev'` or `'development'`.
      When `--define` globals are missing, the `build` key is simply absent.
    - When `build` IS present, all 4 children are required (all-or-nothing).
    - Use `typeof BUILD_COMMIT !== 'undefined'` as the single guard. If this one
      exists, all four exist (they are always injected together in CI).
    - `Cache-Control: no-store` is set per-handler (third arg to `jsonResponse`),
      NOT as a default in the shared `jsonResponse` helper. This matches existing
      codebase patterns (e.g., signing key handler sets its own cache header).
    - Global names: `BUILD_COMMIT`, `BUILD_VERSION`, `BUILD_ENV`, `BUILD_DEPLOYED_AT`.
    - `commit` contains the full 40-character git SHA.
    - `env` values are full words: `"production"`, `"staging"`.
    - `deployedAt` is ISO 8601 UTC (e.g., `"2026-03-24T14:30:00Z"`).

    The `jsonResponse` helper is in `src/responses.js` (line 41):
    ```js
    export function jsonResponse(body, status = 200, headers = {}) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }
    ```
    It already supports the third `headers` parameter -- no changes needed there.

    ### 2. Update unit tests in `test/health.test.js`

    The existing tests use `toMatchObject({ status: 'ok' })` which is a partial
    matcher and tolerant of extra keys. Existing tests will NOT break from the
    addition. However, add explicit assertions for the new behavior.

    Changes to the existing test "returns 200 with status ok and legal URLs":
    - Add assertion that `body.build` is **undefined** (since no `--define` globals
      are set in the vitest/miniflare environment).
    - Add assertion that `response.headers.get('Cache-Control')` equals `'no-store'`.
    - Keep all existing assertions (status, content-type, legal URLs).

    The trailing-slash test should also verify Cache-Control: no-store is present.

    Do NOT inject `--define` values into vitest.config.js. The unit tests verify
    the **fallback path** (build absent). The injection path is verified by the
    smoke test against a real deployment -- that is the correct test boundary.

    ### 3. Update OpenAPI spec in `openapi.yaml` (lines 1615-1660)

    Add the `build` property to the /health 200 response schema. Also add
    Cache-Control header. The `build` property is NOT in the `required` array
    (it's optional at the top level), but when present, all children are required.

    Under the existing `properties:` block (after `legal:`), add:
    ```yaml
                  build:
                    type: object
                    description: Build identity metadata. Present when deployed via CI; absent during local development.
                    required: [commit, version, env, deployedAt]
                    properties:
                      commit:
                        type: string
                        description: Full git commit SHA of the deployed code.
                        pattern: '^[a-f0-9]{40}$'
                        example: '43f8b68a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f'
                      version:
                        type: string
                        description: Semantic version from package.json.
                        pattern: '^\d+\.\d+\.\d+'
                        example: '0.1.0'
                      env:
                        type: string
                        description: Deployment environment.
                        enum: [production, staging]
                      deployedAt:
                        type: string
                        format: date-time
                        description: ISO 8601 UTC timestamp of when the deploy job ran.
                        example: '2026-03-24T14:30:00Z'
    ```

    Add a `Cache-Control` header to the response headers block:
    ```yaml
            Cache-Control:
              schema:
                type: string
                const: 'no-store'
    ```

    Add a second example alongside the existing `healthy` example:
    ```yaml
                deployed:
                  summary: Response from a CI-deployed Worker
                  value:
                    status: ok
                    legal:
                      terms: https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md
                      policy: https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md
                    build:
                      commit: '43f8b68a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f'
                      version: '0.1.0'
                      env: production
                      deployedAt: '2026-03-24T14:30:00Z'
    ```

    After editing, run `npm run lint:api` to validate the spec.

    ## What NOT to do
    - Do NOT add `[define]` stanzas to `wrangler.toml` -- the typeof guards handle
      missing globals gracefully. No wrangler.toml changes needed.
    - Do NOT modify `src/responses.js` or the `jsonResponse` helper.
    - Do NOT add `define` config to `vitest.config.js` or `wrangler.test.toml`.
    - Do NOT touch the workflow files (`.github/workflows/`) -- Task 2 handles those.
    - Do NOT touch `scripts/smoke-test.sh` -- Task 3 handles that.
    - Do NOT touch documentation files (README.md, OPERATIONS.md, CONTRIBUTING.md) --
      Phase 8 handles documentation.
    - Do NOT use fallback values like `'dev'` or `'development'` when globals are
      missing. The `build` object is simply absent.

    ## Verification
    - `npm test` passes (all existing + new assertions).
    - `npm run lint:api` passes (OpenAPI spec valid).
    - Local `wrangler dev`: `/health` returns `{"status":"ok","legal":{...}}` with
      no `build` key and `Cache-Control: no-store` header.

- **Deliverables**: Modified `src/index.js` (handleHealth), modified `test/health.test.js`, modified `openapi.yaml`
- **Success criteria**: `npm test` passes; `npm run lint:api` passes; health response includes Cache-Control: no-store; build object absent in test environment

### Task 2: Add --define flags to deploy workflows
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Add build metadata injection via wrangler `--define` flags to both deploy
    workflows. This burns commit SHA, version, timestamp, and environment into
    the Worker bundle at deploy time.

    ## What to do

    ### 1. Modify `.github/workflows/deploy-staging.yml`

    In the `deploy` job, add two steps before the wrangler-action step, and
    modify the wrangler-action step to use `command:` with `--define` flags.

    Current deploy job steps (starting at the wrangler-action):
    ```yaml
    deploy:
      needs: test
      runs-on: ubuntu-latest
      timeout-minutes: 5
      environment: staging
      steps:
        - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
          with:
            node-version-file: '.nvmrc'
            cache: 'npm'
        - run: npm ci
        # D1 migrations are applied manually before deploy (the deploy API token
        # lacks D1 permissions). Run: wrangler d1 migrations apply DB --remote --env staging
        - uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
          with:
            apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
            environment: staging
    ```

    Add these steps AFTER `npm ci` and BEFORE the wrangler-action step:

    ```yaml
        - name: Resolve build metadata
          id: meta
          run: |
            echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
            echo "version=$(jq -r .version package.json)" >> "$GITHUB_OUTPUT"
            echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"
    ```

    Modify the wrangler-action step to include `command:` with `--define` flags:
    ```yaml
        - uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
          with:
            apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
            environment: staging
            command: >-
              deploy
              --define BUILD_COMMIT:"'${{ steps.meta.outputs.sha }}'"
              --define BUILD_VERSION:"'${{ steps.meta.outputs.version }}'"
              --define BUILD_DEPLOYED_AT:"'${{ steps.meta.outputs.timestamp }}'"
              --define BUILD_ENV:"'staging'"
    ```

    CRITICAL syntax note: `--define BUILD_COMMIT:"'abc123'"` -- the outer quotes
    are YAML, the inner single quotes become part of the JS string literal. Without
    the inner single quotes, esbuild would substitute a bare identifier instead of
    a string, causing ReferenceError at runtime.

    The `environment: staging` key is KEPT. The wrangler-action auto-appends
    `--env staging` to the command because the command string does not contain
    `--env`. This is verified behavior from reading the action source.

    In the `smoke` job, add `GITHUB_SHA` to the env block:
    ```yaml
      smoke:
        needs: deploy
        runs-on: ubuntu-latest
        timeout-minutes: 3
        environment: staging
        steps:
          - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
          - run: ./scripts/smoke-test.sh
            env:
              SMOKE_URL: ${{ vars.WRL_STAGING_BASE_URL }}
              SMOKE_API_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}
              GITHUB_SHA: ${{ github.sha }}
    ```

    `${{ github.sha }}` is correct for the staging workflow because it triggers
    on `push` to `main`, where `github.sha` is the pushed commit.

    ### 2. Modify `.github/workflows/deploy-production.yml`

    In the `deploy` job, add a "Resolve build metadata" step after checkout
    (and after `npm ci`), and modify the wrangler-action step.

    Current deploy job:
    ```yaml
    deploy:
      needs: staging-smoke
      if: |
        always() && (
          (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') ||
          (github.event_name == 'workflow_dispatch' && needs.staging-smoke.result == 'success')
        )
      runs-on: ubuntu-latest
      timeout-minutes: 5
      environment: production
      steps:
        - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
          with:
            ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}
        - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
          with:
            node-version-file: '.nvmrc'
            cache: 'npm'
        - run: npm ci
        # D1 migrations are applied manually before deploy (the deploy API token
        # lacks D1 permissions). Run: wrangler d1 migrations apply DB --remote
        - uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
          with:
            apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    ```

    Add after `npm ci`:
    ```yaml
        - name: Resolve build metadata
          id: meta
          run: |
            echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
            echo "version=$(jq -r .version package.json)" >> "$GITHUB_OUTPUT"
            echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"
    ```

    Using `git rev-parse HEAD` instead of `${{ github.sha }}` is critical here.
    The production workflow can be triggered by `workflow_run` (where `github.sha`
    is the HEAD of main at trigger time, NOT the commit that triggered staging)
    or by `workflow_dispatch` with `inputs.ref` (which could be a tag name).
    `git rev-parse HEAD` reflects the *actually checked out* commit regardless
    of trigger path, and resolves tags to their commit SHA.

    Modify the wrangler-action step:
    ```yaml
        - uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
          with:
            apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
            command: >-
              deploy
              --define BUILD_COMMIT:"'${{ steps.meta.outputs.sha }}'"
              --define BUILD_VERSION:"'${{ steps.meta.outputs.version }}'"
              --define BUILD_DEPLOYED_AT:"'${{ steps.meta.outputs.timestamp }}'"
              --define BUILD_ENV:"'production'"
    ```

    No `environment:` key in production -- production is the top-level wrangler
    config, matching current behavior.

    In the `smoke` job, add `GITHUB_SHA` to the env block. Use the same
    resolution as the checkout ref:
    ```yaml
      smoke:
        needs: deploy
        runs-on: ubuntu-latest
        timeout-minutes: 5
        environment: production
        steps:
          - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
          - run: ./scripts/smoke-test.sh
            env:
              SMOKE_URL: ${{ vars.WRL_PROD_BASE_URL }}
              SMOKE_API_KEY: ${{ secrets.WRL_PROD_CAPTURE_API_KEY }}
              SMOKE_SKIP_CAPTURE: "1"
              GITHUB_SHA: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}
    ```

    NOTE: When `GITHUB_SHA` is a branch name (from `workflow_dispatch` with a
    branch ref), the smoke test's hex-pattern guard will skip the commit check
    gracefully. This is correct behavior.

    ## What NOT to do
    - Do NOT modify `src/index.js`, `test/health.test.js`, or `openapi.yaml` -- Task 1 handles those.
    - Do NOT modify `scripts/smoke-test.sh` -- Task 3 handles that.
    - Do NOT add `[define]` stanzas to `wrangler.toml`.
    - Do NOT change any secrets or environment variable configuration.
    - Do NOT change the checkout ref logic in deploy-production.yml -- it is already correct.

    ## Verification
    - YAML syntax is valid (no broken indentation or quoting).
    - `actionlint` or manual review of the workflow files.
    - The `environment: staging` key is still present in the staging deploy step.
    - Both smoke jobs pass `GITHUB_SHA` in env.

- **Deliverables**: Modified `.github/workflows/deploy-staging.yml`, modified `.github/workflows/deploy-production.yml`
- **Success criteria**: Both workflow files have valid YAML; deploy steps include --define flags with correct quoting; smoke steps pass GITHUB_SHA; staging keeps `environment: staging`

### Task 3: Add commit verification check to smoke test
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Add a new Check 5 (Build version) to the smoke test script that verifies
    the deployed commit SHA matches `$GITHUB_SHA`, with a retry loop for
    global rollout propagation lag.

    ## What to do

    ### Modify `scripts/smoke-test.sh`

    **1. Update the header comment** to document the new optional env var:

    Add to the "Optional env vars" section:
    ```
    #   GITHUB_SHA         -- expected commit SHA (auto-set by GitHub Actions; skip check if absent)
    ```

    **2. Add Check 5 between the end of Check 4 (line 138) and the Summary section (line 140).**

    Insert this block:

    ```bash
    # --- Check 5: Build version ---
    if [ -z "${GITHUB_SHA:-}" ]; then
      echo "Check 5: Build version (SKIPPED -- GITHUB_SHA not set)"
    elif ! echo "$GITHUB_SHA" | grep -qE '^[0-9a-f]{7,40}$'; then
      echo "Check 5: Build version (SKIPPED -- GITHUB_SHA is not a commit SHA)"
    else
      echo "Check 5: Build version matches deployed commit"
      ATTEMPTS=0
      MAX_ATTEMPTS=6
      MATCH=false

      while [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; do
        DEPLOYED_SHA=$(curl -sf "${SMOKE_URL}/health" 2>/dev/null | jq -r '.build.commit // empty')
        if [ "$DEPLOYED_SHA" = "$GITHUB_SHA" ]; then
          MATCH=true
          break
        fi
        ATTEMPTS=$((ATTEMPTS + 1))
        [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ] && sleep 5
      done

      if [ "$MATCH" = true ]; then
        pass "Deployed commit matches expected (${GITHUB_SHA:0:7}...)"
      else
        fail "Deployed commit '${DEPLOYED_SHA:-empty}' does not match expected '${GITHUB_SHA:0:7}...' after ${MAX_ATTEMPTS} attempts"
      fi
    fi
    ```

    Design decisions (already agreed upon -- do not deviate):

    - **Separate check, not integrated into Check 1.** Check 1 is a binary
      gate (is the Worker alive?). Check 5 has different failure semantics
      (Worker is alive but serving stale code) and different retry needs.

    - **Retry: 6 attempts, 5s fixed interval, 30s max.** Workers propagation
      is an eventually-consistent update, not a congestion problem. Fixed
      interval is simpler and equally effective as exponential backoff.

    - **Full 40-char SHA comparison.** The task requires the health response to
      include the full 40-char SHA. Compare the full SHA directly -- no truncation.
      The pass/fail messages show the first 7 chars for readability only.

    - **Skip when GITHUB_SHA is absent.** The variable is auto-set by GitHub
      Actions. When absent (local runs), the check prints "SKIPPED" and adds
      no pass/fail count. Follows the existing `SMOKE_SKIP_CAPTURE` pattern.

    - **Skip when GITHUB_SHA is not a hex string.** The production workflow
      can pass `inputs.ref` as a branch/tag name. The hex-pattern guard
      (`^[0-9a-f]{7,40}$`) catches this and skips gracefully.

    - **Non-fatal failure.** Unlike Check 1 which aborts on failure (FATAL),
      Check 5 uses the normal `fail` function which increments FAIL_COUNT
      but allows the summary to print. A commit mismatch is a deployment
      concern, not a "stop everything" emergency.

    ## What NOT to do
    - Do NOT modify the existing Checks 1-4 in any way.
    - Do NOT add a new env var like `SMOKE_EXPECTED_SHA` -- reuse `GITHUB_SHA`.
    - Do NOT use short SHA comparison. Compare full 40-char SHAs.
    - Do NOT make this check fatal (no `exit 1` within the check).
    - Do NOT modify workflow files -- Task 2 handles those.
    - Do NOT modify `src/index.js` or any other source files.

    ## Verification
    - `shellcheck scripts/smoke-test.sh` passes with no errors/warnings.
    - Running the script locally without GITHUB_SHA set prints "SKIPPED".
    - Running with `GITHUB_SHA=not-a-sha` prints "SKIPPED -- not a commit SHA".
    - The retry loop uses `$((ATTEMPTS + 1))` not `((ATTEMPTS++))` (the latter
      triggers `set -e` exit when value is 0).

- **Deliverables**: Modified `scripts/smoke-test.sh`
- **Success criteria**: shellcheck passes; check skips gracefully without GITHUB_SHA; retry logic correct; non-fatal on mismatch

### Cross-Cutting Coverage
- **Testing**: Covered. Task 1 updates unit tests for the fallback path. Task 3 adds smoke test for the injection path. Phase 6 runs both.
- **Security**: No new attack surface. Build metadata (commit SHA, version, deploy timestamp, environment) is already public information for an open-source repo. The health endpoint is unauthenticated by design.
- **Usability -- Strategy**: Covered during planning. Recommendation adopted: nested `build` object with full 40-char SHAs, full-word env values, visual chunking matching the existing `legal` grouping pattern.
- **Usability -- Design**: Not applicable. No user-facing UI changes. The health endpoint is consumed by CI scripts and operators via curl.
- **Documentation**: Deferred to Phase 8. Six files need updating: openapi.yaml (covered in Task 1), README.md, OPERATIONS.md (3 sections), CONTRIBUTING.md.
- **Observability**: Not applicable. The health handler is synchronous with zero I/O. No new runtime components, services, or background processes.

### Architecture Review Agents
- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None. This is a small, additive change to a single synchronous handler with no UI, no new runtime components, and no web-facing output changes.
- **Not selected**:
  - ux-design-minion: No user-facing UI produced by any task.
  - accessibility-minion: No web-facing HTML/UI produced.
  - sitespeed-minion: No web-facing runtime code changes (health endpoint is operational plumbing, not user-facing).
  - observability-minion: Single synchronous handler with zero I/O. No coordinated logging/metrics/tracing needed.
  - user-docs-minion: End users do not interact with the health endpoint. Operator docs (OPERATIONS.md) are handled by Phase 8.

### Decisions

- **SHA format: full 40-char vs short 7-char**
  Chosen: Full 40-character SHA in the health response.
  Over: Short 7-char SHA (recommended by api-design-minion and test-minion for brevity and reduced information surface).
  Why: The task success criteria explicitly require "full 40-char SHA". For an open-source repo, the information surface argument is moot. Full SHA enables exact matching in CI without truncation logic on either side.

- **Build object presence when globals absent: omit vs fallback values**
  Chosen: Omit `build` entirely when `--define` globals are not injected (local dev, tests).
  Over: Always include `build` with fallback values like `'dev'` and `'development'` (recommended by test-minion).
  Why: No fake data in the response. `build` absent is a clear signal that metadata was not injected. The OpenAPI contract models this cleanly (build is optional at top level). Fallback values create ambiguity -- is `'dev'` a real version string or a placeholder?

- **wrangler.toml [define] stanza: add defaults vs skip**
  Chosen: Skip entirely. No [define] in wrangler.toml.
  Over: Add [define] with safe defaults for local dev, duplicated in [env.staging.define] (initially proposed by iac-minion as Task 4, then self-rejected).
  Why: `[define]` is non-inheritable in wrangler -- requires duplication in every env block. The typeof guards handle missing globals gracefully. Fewer moving parts, no duplication maintenance burden.

### Risks and Mitigations

1. **YAML quoting of --define values.** The `--define KEY:"'value'"` syntax requires careful quoting. YAML multi-line scalars (`>-`) mitigate escaping issues. The values (hex SHAs, semver strings, ISO timestamps) contain no special characters requiring additional escaping. **Risk: Low.**

2. **Production GITHUB_SHA resolution.** The production smoke job receives `${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}` as GITHUB_SHA. When `inputs.ref` is a branch/tag name, this is not a hex SHA. **Mitigation:** The smoke test's hex-pattern guard skips the check gracefully. **Risk: Low.**

3. **Stale metadata from edge cache after deploy.** Cloudflare Workers propagate globally within ~30 seconds. The smoke test's retry loop (6 attempts, 5s interval, 30s max) covers the observed worst-case propagation tail. **Risk: Low.**

4. **typeof guard removal during future refactoring.** If someone refactors the typeof check to direct access (`BUILD_COMMIT ?? null`), local dev and tests break with ReferenceError. **Mitigation:** Code comment explains why typeof is required. Unit test asserts build is absent (would catch the regression immediately). **Risk: Low.**

### Execution Order

```
Batch 1 (parallel: none, sequential):
  Task 1: handleHealth + unit tests + OpenAPI spec

Batch 2 (parallel, both blocked by Task 1):
  Task 2: Deploy workflow --define flags
  Task 3: Smoke test Check 5

Post-execution:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (npm test, shellcheck)
  Phase 8: Documentation (README.md, OPERATIONS.md, CONTRIBUTING.md)
```

### Verification Steps

After all tasks complete and CI runs:
1. `npm test` passes locally (unit tests assert build absent, Cache-Control present).
2. `npm run lint:api` passes (OpenAPI spec valid).
3. `shellcheck scripts/smoke-test.sh` passes.
4. Push to main triggers staging deploy. After deploy:
   - `curl -s https://wrl-staging.benpeter.workers.dev/health | jq .` shows `build` object with real SHA, version, timestamp, and `"env": "staging"`.
   - `curl -sI https://wrl-staging.benpeter.workers.dev/health | grep Cache-Control` shows `no-store`.
   - Smoke test Check 5 passes (commit SHA matches).
5. Production deploy auto-triggers. Same verification against production URL with `"env": "production"`.
