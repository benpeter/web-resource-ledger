---
reviewer: code-review-minion
phase: extend-health-build-metadata
date: 2026-03-24
---

# Code Review: Extend /health with Build Identity Metadata

## VERDICT: ADVISE

One correctness defect (non-fatal but silently wrong), one regex portability
bug that will fail in bash on macOS, and a few nits. No blocking security issues.
No hardcoded secrets. No injection vectors. Approve after the two ADVISE items
are addressed.

---

## FINDINGS

### Correctness

- **ADVISE** `src/index.js:590-596` -- Only `BUILD_COMMIT` is guarded with `typeof`.
  `BUILD_VERSION`, `BUILD_ENV`, and `BUILD_DEPLOYED_AT` are accessed unconditionally
  inside the `if` block on lines 593-595. If wrangler is ever called with only some
  `--define` flags present (e.g., a partial deployment script, a local dev invocation,
  or a future rollback path that omits some flags), the runtime will throw a
  `ReferenceError` for the first ungarded identifier. The guard only protects the
  outer condition; accessing the other three identifiers is not guarded.
  FIX: Either guard all four with `typeof` in the condition, or accept that all four
  are always injected together and document that invariant with a single combined check:
  ```js
  if (
    typeof BUILD_COMMIT !== 'undefined' &&
    typeof BUILD_VERSION !== 'undefined' &&
    typeof BUILD_ENV !== 'undefined' &&
    typeof BUILD_DEPLOYED_AT !== 'undefined'
  ) {
    body.build = { commit: BUILD_COMMIT, version: BUILD_VERSION,
                   env: BUILD_ENV, deployedAt: BUILD_DEPLOYED_AT };
  }
  ```
  Alternatively, if partial injection is not a realistic scenario, add a comment
  stating that all four flags are always supplied together so the guard is intentionally
  minimal.

### Bug Patterns

- **ADVISE** `.github/workflows/deploy-staging.yml:44` and
  `deploy-production.yml:61` -- The regex `'^\d+\.\d+\.\d+'` uses `\d` which is a
  Perl/ERE extension. `grep -E` on macOS (BSD grep) does NOT recognize `\d` as a
  digit class -- it matches a literal backslash followed by `d`. The validation step
  will silently pass any `version` string on macOS runners. GitHub Actions runs on
  Linux (GNU grep), so this does not affect CI, but it creates a hidden discrepancy
  between local and CI behavior that can mislead developers who run the step locally.
  FIX: Replace `\d` with `[0-9]` throughout:
  ```bash
  if ! echo "$version" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
  ```

### Integration / Cross-Agent

- **NIT** `deploy-production.yml:89` -- `GITHUB_SHA` is set to
  `${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}`.
  When a rollback is triggered via `workflow_dispatch` with a tag ref (e.g.
  `v0.1.0`) as `inputs.ref`, the smoke-test script's SHA pattern check
  (`'^[0-9a-f]{7,40}$'`) will correctly skip Check 5 (tags don't match).
  This is the right behavior -- the skip path is intentional and documented.
  Worth noting in code comments so future maintainers don't "fix" the skip.
  No change required; this is a documentation observation.

### Tests

- **NIT** `test/health.test.js:15` -- `expect(body.build).toBeUndefined()` is
  correct and important: it confirms the guard works when `--define` flags are
  absent (test environment). Good addition. No change needed.

- **NIT** `test/health.test.js:9,22` -- `Cache-Control: no-store` is now asserted
  in two tests but not in the third (`POST returns 404`) or in the rate-limit test.
  This is fine -- those tests are not about the health response shape. No change needed.

### OpenAPI

- **NIT** `openapi.yaml:1660-1671` -- The `build` object schema has
  `required: [commit, version, env, deployedAt]` but the implementation makes `build`
  itself optional (it is absent when `--define` flags are not injected). The schema is
  technically correct (when `build` IS present, all four fields are required), but a
  reader could misinterpret the outer `required: [status, legal]` as meaning `build`
  is never present. An `x-description` or `description` on the `build` property
  clarifying it is conditionally present would improve spec clarity.
  FIX (optional): Add `description: Present only when deployed via CI with --define flags.`
  to the `build` property in the schema.

### Security

- No hardcoded secrets found.
- `--define` flag values are validated (SHA hex, semver prefix) before injection.
  Injection surface is CI-controlled inputs only -- no user-controlled data reaches
  the `--define` flags. No injection risk.
- `Cache-Control: no-store` is correctly applied, preventing CDN or proxy caching
  of build identity data.
- The `build` object exposes commit SHA, version, env label, and deploy timestamp.
  This is intentional for CI verification. The data is low-sensitivity (no secrets,
  no internal topology). Acceptable.

### DRY / Complexity

- The "Resolve build metadata" step is duplicated verbatim between
  `deploy-staging.yml:38-47` and `deploy-production.yml:55-64`. This is a known
  tradeoff with GitHub Actions (no reusable step for inline shell without a
  composite action). Acceptable for now given the Helix YAGNI principle -- extracting
  a composite action for 8 lines is overkill. Flag for extraction if the step grows.

---

## Summary

The two ADVISE items are the only ones that need resolution before merge:

1. **`src/index.js`**: Guard all four `BUILD_*` identifiers, not just `BUILD_COMMIT`.
2. **CI workflows**: Replace `\d` with `[0-9]` in the semver validation regex.

Everything else is correct. The design (typeof guard, Cache-Control: no-store,
wrangler --define injection, smoke test retry loop with skip logic) is sound.
The test coverage additions are appropriate and well-targeted.
