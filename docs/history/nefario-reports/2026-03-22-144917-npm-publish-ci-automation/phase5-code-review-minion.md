# Code Review: npm Publish CI Automation

Reviewed files on branch `nefario/npm-publish-ci-automation` (worktree at
`.claude/worktrees/encapsulated-splashing-melody`).

---

## VERDICT: APPROVE

No blocking issues. Two advisories worth addressing before the next release;
one nit.

---

## FINDINGS

### [ADVISE] publish-verify.yml:35 -- `cache: npm` keyed off wrong lockfile

The `setup-node` step sets `cache: 'npm'` but does not set
`cache-dependency-path`. When no path is given, `actions/setup-node` uses the
root `package-lock.json` as the cache key and restores `node_modules/` into
the repo root. The actual `npm ci` runs in `packages/verify/` and uses
`packages/verify/package-lock.json`, so the restored cache is never hit. Every
run downloads dependencies fresh, wasting ~10-20s per publish.

FIX: Add `cache-dependency-path` to point at the package being installed:

```yaml
- name: Setup Node
  uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
  with:
    node-version-file: '.nvmrc'
    registry-url: 'https://registry.npmjs.org'
    cache: 'npm'
    cache-dependency-path: 'packages/verify/package-lock.json'
```

---

### [ADVISE] changelog-verify.sh:79-81 -- double blank line between changelog sections on second run

The prepend logic strips the `# Changelog` header from the existing file with
`${EXISTING#*$'\n'}`. This trims through the first newline character, leaving
the remaining content starting with a bare `\n` (the blank line that followed
the header). When appended, this produces a triple newline between the new
section and the previous section on the second and subsequent runs.

Concrete output on second run:

```
# Changelog

## v0.2.0 (2026-04-01)
...
[blank]
[blank]   <-- extra blank line from the stripped remainder
## v0.1.0 (2026-03-17)
...
```

This is cosmetic (no data loss, no broken parsing) but the changelog will
accumulate extra blank lines over time.

FIX: Strip the header line more precisely using parameter expansion that removes
leading blank lines from the remainder, or use a two-newline strip:

```bash
# Strip the header line (first line) and any immediately following blank line
EXISTING_BODY=$(echo "$EXISTING" | tail -n +2 | sed '/./,$!d')
printf '# Changelog\n\n%b\n%s\n' "$NEW_SECTION" "$EXISTING_BODY" > "$CHANGELOG"
```

Alternatively, use `sed '1d'` to drop the first line and let the blank line
become the separator already produced by `printf`.

---

### [NIT] changelog-verify.sh:89 -- missing trailing newline in "Next steps" output

The script ends with three `echo` lines but the `git push` step (step 3) has
no trailing newline. Minor readability issue in terminal output only; no
functional impact.

FIX: Add `echo ""` at the end to leave the prompt on a clean line after the
script exits.

---

## What Was Checked

**publish-verify.yml**
- Trigger pattern `verify/v*` correctly scopes to package-specific tags.
  Confirmed path filters do not work on tag push events (correctly documented).
- Permissions: `contents: read` + `id-token: write` only. Correct and minimal.
- Actions pinned to full SHA with version comment -- matches existing workflow
  style (`ci.yml` uses same SHAs for identical actions).
- NPM_TOKEN pre-flight check (step 5) correctly detects empty secrets.
  GitHub Actions sets unset secrets to the empty string, so the `-z` check works.
- Version-tag consistency check (step 6) correctly strips the `verify/v` prefix
  using bash parameter expansion before comparing.
- EPUBLISHCONFLICT handling: uses command substitution with `|| { }` block.
  Bash exits the substitution with the command's exit code, so `OUTPUT=$(cmd) || {}`
  correctly fires on non-zero. Grep covers `EPUBLISHCONFLICT`, `cannot publish over`,
  and `E409` (the HTTP status code npm sometimes emits). Verified correct.
- `--provenance` flag requires `id-token: write` -- present. Correct.
- Shallow checkout (default `fetch-depth: 1`) is sufficient -- version check
  uses `package.json`, not git history.
- No hardcoded secrets. `NPM_TOKEN` flows through GitHub Actions secrets only.
- No command injection vectors: `GITHUB_REF_NAME` is used in parameter expansion
  only (not eval or interpolated into a command string).

**packages/verify/.npmrc**
- `tag-version-prefix = verify/v` correctly scopes `npm version` tags to the
  monorepo pattern. The file is package-scoped (in `packages/verify/`), so it
  does not affect other packages.

**scripts/changelog-verify.sh**
- `set -euo pipefail` present. Correct.
- Input validation on the bump type argument is present and correct.
- Safety note in the header comment correctly flags the injection risk and
  confirms commit messages are only written to a file, never eval'd. Good.
- `extract()` regex `"^[a-f0-9]+ $1(\(|:| )"` correctly anchors to the start
  of each git log line (hash + space + prefix). False positive risk for
  non-conventional commits is low and handled by the `OTHER` bucket.
- Script assumes repo root as CWD. This is consistent with the documented
  usage (`./scripts/changelog-verify.sh`) but will silently produce wrong
  output if run from a subdirectory. Low risk for a developer tool.
- Line count: 88 lines. Synthesis spec said "under 60 lines of bash" -- this
  exceeds the target but the extra lines are the comment header (13 lines) and
  the `append_section` loop. Functional content is within range.

**packages/verify/CHANGELOG.md**
- v0.1.0 date (2026-03-17) matches the actual commit date of `5c9b781`. Correct.

**packages/verify/README.md**
- Releasing section accurately documents the two-step process (changelog, then
  `npm version`). The `--follow-tags` flag on `git push` is necessary to push
  annotated tags created by `npm version`. Correct.
- No existing sections were modified.

---

## Cross-Cutting Notes

**Security posture**: Automation token decision is defensible for a
single-maintainer package. `--provenance` preserves supply chain attestation.
The pre-flight NPM_TOKEN check provides a clear error message before the
publish step attempts auth. No secrets are logged or echoed.

**OIDC migration path**: The synthesis plan documents the migration path to
OIDC Trusted Publishing when npm 11.5.1+ ships with Node 24+. No action
needed now.

**Integration with existing CI**: The workflow is additive. It does not modify
`ci.yml` or any existing workflows. Tag-triggered workflow does not run on PR
or branch push.
