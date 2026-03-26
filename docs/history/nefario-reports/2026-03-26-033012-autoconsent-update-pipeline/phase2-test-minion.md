# Test-Minion: CI Pipeline Contribution

## Planning Question
Runner type, job structure, timeouts, and failure handling for `npm test` + `npm run test:battery` in the autoconsent update workflow.

## Recommendations

### Runner Type: `ubuntu-latest` Is Sufficient

The existing CI already runs `npm test` (vitest + workerd/D1) on `ubuntu-latest` with a 10-minute timeout. GitHub-hosted `ubuntu-latest` runners have 7 GB RAM (4 vCPU). The CLAUDE.md warning about ~8 GB is for the local dev machine where workerd runs alongside other processes. In CI, with nothing else running, 7 GB is enough -- the existing `ci.yml` and `deploy-staging.yml` workflows already prove this works on `ubuntu-latest`. No need for `ubuntu-latest-8-core` or self-hosted runners.

### Job Structure: Two Separate Jobs, Not Same-Job Steps

The battery test (`test:battery`) must be a **separate job** from unit tests, for three reasons:

1. **Different failure semantics.** Unit test failure = code is broken, must block PR. Battery failure = external site changed behavior, may not indicate a regression. These need different `continue-on-error` settings.

2. **Different environments.** The battery hits staging (`staging.webresourceledger.com`) and requires `WRL_STAGING_CAPTURE_API_KEY` from the `staging` GitHub environment. Unit tests need no secrets. Mixing them in one job forces the unit tests into the `staging` environment unnecessarily (environment protection rules, approval gates if configured).

3. **Different timeouts.** Unit tests: 10 minutes. Battery: 15 minutes (21 sites x 300s poll timeout worst case, though concurrent polling makes actual time ~5-8 minutes). Separate timeouts prevent a slow battery from inflating the unit test job's timeout.

Proposed job dependency graph:

```
update-check --> unit-tests --> battery-tests --> open-pr
                                    |
                            (continue-on-error: true)
```

### Timeout Configuration

| Job | Timeout | Rationale |
|-----|---------|-----------|
| `unit-tests` | `timeout-minutes: 12` | Current CI uses 10m; add 2m buffer for npm update + vendor rebuild step |
| `battery-tests` | `timeout-minutes: 15` | 21 concurrent captures with 300s poll timeout. Actual runtime ~5-8 min, 15m provides safety margin for staging cold starts |

Individual step-level timeouts are not needed -- vitest has its own test timeouts, and `test-battery.js` has `POLL_TIMEOUT_MS = 300_000` built in.

### Failure Handling: Battery Failures Should NOT Block the PR

**Unit test failures:** Block PR creation entirely. If `npm test` or `npm run test:sync` fails, the autoconsent update broke something. No PR should be opened.

**Battery test failures:** Report as a PR comment, do not block PR creation. Rationale:

1. The battery tests 21 external sites. Sites change their CMP implementations, go down, rate-limit CI runners, or alter robots.txt at any time. A battery failure after an autoconsent update is ambiguous -- it could be the update or the site.

2. The battery's value for autoconsent updates is specifically the **consent-related columns** (consentResult, cmpDetected). A regression here is the signal we care about, but it needs human judgment to distinguish "autoconsent update broke Guardian consent" from "Guardian changed their CMP provider this week."

3. Blocking on battery failures would cause the workflow to silently produce no PR on most weeks (external site flakiness), defeating the automation purpose.

**Implementation approach:**

```yaml
battery-tests:
  needs: unit-tests
  runs-on: ubuntu-latest
  timeout-minutes: 15
  continue-on-error: true
  environment: staging
  steps:
    - # ... setup ...
    - name: Run battery tests
      id: battery
      continue-on-error: true
      run: npm run test:battery
      env:
        WRL_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}
    - name: Save battery output
      if: always()
      run: |
        # Capture stdout/stderr for PR comment
        echo "${{ steps.battery.outcome }}" > battery-result.txt
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: battery-results
        path: battery-result.txt

open-pr:
  needs: [unit-tests, battery-tests]
  if: always() && needs.unit-tests.result == 'success'
  # ... create PR, add battery status as comment ...
```

The PR-opening job should:
- Download the battery artifact
- If battery passed: PR body says "Battery tests passed (21/21 sites)"
- If battery failed: PR body includes a warning section with the failure summary and a note that manual review of consent columns is recommended
- Either way, the PR is created

### Battery Output Capture

`test-battery.js` writes a summary table to stdout (lines 249-277). Capture this output and include it verbatim in the PR body or as a PR comment. This gives the reviewer immediate visibility into consent detection changes without having to run the battery manually.

Redirect stdout to a file:

```yaml
- name: Run battery tests
  id: battery
  continue-on-error: true
  run: npm run test:battery 2>&1 | tee battery-output.txt
  env:
    WRL_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}
```

Then in the PR creation step, read `battery-output.txt` and embed the summary table in the PR description inside a `<details>` block.

### Secrets Required

The workflow needs these secrets from the `staging` GitHub environment (already configured per `e2e-tests.yml` and `deploy-staging.yml`):

| Secret/Variable | Used By | Already Exists |
|-----------------|---------|----------------|
| `secrets.WRL_STAGING_CAPTURE_API_KEY` | Battery tests | Yes (used by smoke tests in deploy-staging) |
| `secrets.GITHUB_TOKEN` | PR creation (gh cli) | Yes (automatic) |

No new secrets need to be provisioned.

## Proposed Tasks

### Task 1: Unit Test Job Configuration
**Deliverable:** YAML job definition for `unit-tests` in the autoconsent update workflow.
**Details:**
- `runs-on: ubuntu-latest`, `timeout-minutes: 12`
- Steps: checkout, setup-node, npm ci, npm test, npm run test:sync
- Must pass for workflow to continue
- No environment/secrets needed
**Dependencies:** Depends on the version-check/update job producing code changes.

### Task 2: Battery Test Job Configuration
**Deliverable:** YAML job definition for `battery-tests` with output capture.
**Details:**
- Separate job with `needs: unit-tests`, `continue-on-error: true`
- `environment: staging` for secret access
- Capture battery output to artifact for PR body inclusion
- `timeout-minutes: 15`
**Dependencies:** Task 1 (unit tests must pass first).

### Task 3: PR Creation with Battery Status
**Deliverable:** PR creation step that includes battery results in PR description.
**Details:**
- Create PR only if `needs.unit-tests.result == 'success'`
- Download battery artifact and embed summary table in PR body
- Use `<details><summary>` for the full battery output
- Mark PR body clearly if battery failed vs passed
**Dependencies:** Tasks 1 and 2.

## Risks and Concerns

1. **Battery test flakiness from rate limiting.** The battery submits 21 captures concurrently to staging. If the staging worker has rate limits or the underlying browser rendering service throttles, some captures may fail intermittently. This is not a new risk (battery already exists) but becomes more visible when running weekly in CI. Mitigation: the `continue-on-error: true` approach handles this.

2. **Staging API key rotation.** If `WRL_STAGING_CAPTURE_API_KEY` is rotated, the battery job will fail silently (continue-on-error swallows it). The PR will be created with a "battery failed" note but no clear indication it was an auth failure. Mitigation: check for HTTP 401 specifically in the battery output and flag it distinctly in the PR comment.

3. **Battery runtime growth.** Currently 21 sites. If the site list grows, the 15-minute timeout may not be enough. The concurrent polling architecture scales well, but each additional site adds ~3s of API submission time and contributes to staging load. Keep the site list stable or increase timeout proportionally.

4. **Memory on `ubuntu-latest`.** The 7 GB runner memory is sufficient today but leaves limited headroom. If the vitest test suite grows significantly or workerd memory usage increases with new Cloudflare SDK versions, this could become tight. Monitor for OOM kills in CI logs. Fallback: use `ubuntu-latest` 8-core runners (16 GB RAM) which are available in GitHub Actions.

5. **No diff comparison for battery results.** The battery reports absolute results, not a diff against the previous run. Without comparing "before autoconsent update" vs "after," a reviewer cannot tell which consent changes are attributable to the update. This is a limitation worth noting in the PR template but solving it (run battery twice, diff) would double the runtime and staging load. Not recommended for v1.

## Additional Agents Needed

None. The workflow YAML authoring falls to the implementing agent. The secrets are already provisioned. No infrastructure changes needed.
