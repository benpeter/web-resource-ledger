## Security Review: npm Publish CI Automation

**Verdict: ADVISE**

The plan is substantially sound. The synthesis correctly incorporated prior security feedback: SHA-pinned actions, minimal permissions (`contents: read` + `id-token: write`), version-tag consistency check, and EPUBLISHCONFLICT handling. The OIDC vs automation token conflict resolution is reasoned and acceptable for a single-maintainer project at this scale. The following advisories are ordered by severity.

---

- [security]: The npm publish log is written to `/tmp/npm-publish.log` with `tee`; if npm emits the NODE_AUTH_TOKEN value in a verbose error, it will land in that file and potentially in the Actions log as well.
  SCOPE: `.github/workflows/publish-verify.yml` -- publish step
  CHANGE: Append a sed mask to the tee pipeline to redact any token that appears in npm output:
  ```bash
  npm publish --provenance --access public 2>&1 \
    | sed 's|//registry.npmjs.org/:_authToken=[^[:space:]]*|//registry.npmjs.org/:_authToken=***|g' \
    | tee /tmp/npm-publish.log
  ```
  Alternatively, keep stderr separate (`2>/tmp/npm-publish-err.log`) and only tee stdout, so auth error details are captured locally but not streamed to the Actions log.
  WHY: `npm publish` with a bad or expiring token sometimes echoes the token value in its diagnostic output. The tee'd file content appears verbatim in the Actions log, which may be world-readable on a public repo.
  TASK: Task 1

- [security]: `runs-on: ubuntu-latest` resolves to a moving target runner image; a runner image update can silently change toolchain behavior between publishes.
  SCOPE: `.github/workflows/publish-verify.yml` -- job-level `runs-on`
  CHANGE: Pin to a specific ubuntu version: `runs-on: ubuntu-24.04`. GitHub-hosted runners with explicit version labels are still rotated but upgrades appear in GitHub's changelog rather than silently affecting the workflow.
  WHY: `ubuntu-latest` is a supply chain input. When GitHub rotates the label (e.g., latest switches from 22.04 to 24.04), the runner environment changes without any diff in the workflow file. Pinning makes upgrades explicit and auditable.
  TASK: Task 1

- [security]: No pre-flight check verifies that `NPM_TOKEN` is present before attempting publish; a missing secret produces an opaque npm auth error rather than a clear diagnostic.
  SCOPE: `.github/workflows/publish-verify.yml` -- publish step
  CHANGE: Add an explicit check step immediately before publish:
  ```yaml
  - name: Verify NPM_TOKEN is set
    run: |
      if [ -z "$NODE_AUTH_TOKEN" ]; then
        echo "::error::NPM_TOKEN secret is not configured. See packages/verify/README.md#Releasing."
        exit 1
      fi
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
  ```
  WHY: Without the check, a missing secret produces a cryptic npm authentication failure that looks like a registry problem rather than a misconfigured secret. Fast, clear failure diagnosis is the correct behavior per the project's "fail loudly" principle.
  TASK: Task 1

- [security]: The `packages/verify/.npmrc` committed to the repo is not explicitly excluded from the published package, relying solely on the `files` whitelist in `package.json`.
  SCOPE: `packages/verify/.npmrc` (Task 2) + `packages/verify/package.json` `files` field
  CHANGE: Add a `packages/verify/.npmignore` containing `.npmrc` as a belt-and-suspenders guard. The current `files` array (`bin/`, `lib/`, `certs/`, `README.md`, `LICENSE`) already excludes it, so no tokens are at risk today -- but an explicit `.npmignore` entry prevents accidental publication if the `files` list is ever broadened carelessly.
  WHY: Defense in depth. If a future developer adds a wildcard or directory to `files`, the `.npmignore` entry provides a second line of defense against accidentally shipping the `.npmrc` (which could contain a token if a developer misconfigures their local environment).
  TASK: Task 2

- [security]: The changelog script passes `git log --oneline` commit messages through sed/grep pipelines without sanitizing shell metacharacters in commit message content.
  SCOPE: `scripts/changelog-verify.sh` (Task 2)
  CHANGE: Ensure the script never passes commit message content through `eval`, `bash -c`, or unquoted command substitution. Use `printf '%s\n'` rather than bare `echo` for lines containing commit message content. The current design (writing to CHANGELOG.md) is safe -- this is a forward-looking constraint to document in the script's header comment.
  WHY: Commit messages in a PR workflow are attacker-influenced. While the script runs locally (not in CI), establishing the safe pattern prevents a future refactor from introducing command injection. This is LOW severity given current usage but worth stating once.
  TASK: Task 2

---

### Not blocking, but confirm at token provisioning time

The plan correctly defers NPM_TOKEN storage to 1Password (Risks item 2). When provisioning, confirm the token is created as a **granular access token** scoped exclusively to `@w-r-l/verify` with **publish** permission only -- not a legacy auth token, not an org-wide token. Record the token's scope in the 1Password item's notes field to prevent future ambiguity about what access it carries.

The `--provenance` flag is correctly included and requires `id-token: write`. This links each published version to a specific commit and workflow run via Sigstore, providing an audit trail. No change needed here.
