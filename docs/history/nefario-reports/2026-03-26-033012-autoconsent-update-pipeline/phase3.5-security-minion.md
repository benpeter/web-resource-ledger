# Security Review: autoconsent-update-pipeline

**Verdict: ADVISE**

---

## Assessment

The plan is sound overall. The supply chain decisions are good (SHA-pinned actions, no third-party PR action, reusing existing staging environment secret). Two issues warrant attention before the workflow goes live.

---

## Findings

### MEDIUM: `contents: write` scoped at workflow level, not job level

The plan sets `permissions: contents: write` and `pull-requests: write` at the top-level workflow scope. This means every job -- including `update-and-test` (which runs untrusted npm code during `npm install @duckduckgo/autoconsent@latest`) -- runs with write access to the repository contents.

The `contents: write` permission is only needed in `open-pr` (for `git push`). The `pull-requests: write` permission is only needed in `open-pr` (for `gh pr create` and `gh pr close`).

**Remediation**: Set minimal permissions at the workflow level and grant elevated permissions per-job only where required:

```yaml
# Workflow-level default: read-only
permissions:
  contents: read

jobs:
  update-and-test:
    # No additional permissions needed
    ...

  battery:
    # No additional permissions needed
    ...

  open-pr:
    permissions:
      contents: write       # git push branch
      pull-requests: write  # gh pr create / gh pr close
    ...
```

This limits the blast radius if `npm install` pulls a compromised package that exfiltrates the token or attempts to push to the repo.

---

### LOW: `new_version` and `old_version` job outputs flow into shell without validation

The `open-pr` job interpolates `needs.update-and-test.outputs.new_version` and `needs.update-and-test.outputs.old_version` directly into a bash heredoc and into `git commit -m` and branch name construction. These values come from `npm view @duckduckgo/autoconsent version`, which returns data from the npm registry.

The values are constrained to semver in practice, but if the registry were compromised or the package name hijacked to return a crafted version string, the value could inject content into the PR body or branch name. The git operations are lower risk (branch names have limited injection surface) but the heredoc PR body has no escaping.

**Remediation**: Add a one-line semver validation before using the outputs:

```bash
VERSION="${{ needs.update-and-test.outputs.new_version }}"
OLD="${{ needs.update-and-test.outputs.old_version }}"
# Validate semver format before using in shell/git operations
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
  echo "Unexpected version format: $VERSION" >&2
  exit 1
fi
if ! echo "$OLD" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
  echo "Unexpected old version format: $OLD" >&2
  exit 1
fi
```

This is belt-and-suspenders against a registry compromise scenario and makes the version check in `vendor-autoconsent.js` a defense-in-depth layer rather than the only gate.

---

## What the Plan Gets Right

- SHA-pinning all actions is correct and matches repo convention.
- Rejecting `peter-evans/create-pull-request` (third-party write-access action) is the right call.
- Using the existing `staging` environment secret rather than creating a new repo-level secret avoids secret sprawl.
- `GITHUB_TOKEN` (automatic) rather than a PAT means the token's write scope is bounded to this repo only and expires with the job.
- The battery job using `continue-on-error: true` is correct -- advisory failures should not block the PR.
- The vendor script using `JSON.stringify()` avoids shell escaping at 170KB scale.

---

## Summary

Neither issue blocks execution. The permission scoping fix is the higher-priority item and should be applied in the workflow before it lands. The version validation is defensive hardening that can be added in the same pass with minimal effort.
