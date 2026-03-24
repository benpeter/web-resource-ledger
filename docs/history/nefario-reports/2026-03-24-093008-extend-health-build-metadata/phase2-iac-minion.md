# IAC Minion -- Build Metadata via wrangler --define

## Summary

Build metadata (commit SHA, version, deploy timestamp, environment) should be
injected at deploy time using the `command:` input of `cloudflare/wrangler-action@v3.14.1`
with `--define` flags. The `[define]` stanza in `wrangler.toml` is not suitable
because (a) these values are dynamic per deploy, not static config, and (b)
`define` is a non-inheritable key in wrangler -- it would need to be duplicated
in `[env.staging]` and still could not contain runtime-computed values.

---

## Question (a): command: override vs [define] stanza

**Recommendation: Use `command:` with `--define` flags. Do NOT use `[define]` in wrangler.toml.**

### Evidence

1. **`[define]` is non-inheritable.** Cloudflare docs classify it as a
   non-inheritable key, meaning `[env.staging]` does NOT inherit from the
   top-level `[define]`. You would need to duplicate the stanza in both
   top-level and `[env.staging]`. This is fragile.

2. **Values are dynamic.** Commit SHA, deploy timestamp, and version are
   computed at deploy time. They cannot be hardcoded in `wrangler.toml`.
   While you could reference environment variables in the toml via some
   workaround, wrangler's `[define]` performs literal text substitution --
   it does not expand environment variables from the shell.

3. **`--define` CLI flag overrides `[define]` config.** Per Cloudflare docs,
   if both are present, the CLI flag wins. Using CLI flags keeps the
   dynamic injection explicit and traceable in the workflow.

### How `wrangler-action` builds the deploy command

From reading the action source at the pinned SHA (`da0e0dfe`), the
`wranglerCommands` function works as follows:

```
1. If `command:` input is empty, push "deploy" as the default command.
2. For each command:
   a. If `environment` is set AND command does NOT already contain "--env",
      append `--env <environment>` to the args.
   b. If `vars` is set AND command starts with "deploy"/"publish"
      AND does not contain "--var", append --var flags.
3. Execute: `<packageManager> wrangler <command> <args>`
```

This means:
- Setting `command: "deploy --define ..."` is safe. The action will still
  auto-append `--env staging` because the command won't contain `--env`
  (unless we put it there ourselves).
- The `environment: staging` input continues to work as before.

### Proposed workflow change (staging)

```yaml
- uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    environment: staging
    command: >-
      deploy
      --define BUILD_SHA:"'${{ github.sha }}'"
      --define BUILD_VERSION:"'${{ steps.version.outputs.version }}'"
      --define BUILD_TIMESTAMP:"'${{ steps.timestamp.outputs.timestamp }}'"
      --define BUILD_ENV:"'staging'"
```

Key syntax detail: `--define BUILD_SHA:"'abc123'"` produces the replacement
`'abc123'` which is a string literal in JS. The outer quotes are for YAML,
the inner single quotes become part of the substituted value. Without the
inner quotes, the identifier would be replaced with a bare token that
JS would interpret as an undefined variable name.

### Proposed workflow change (production)

```yaml
- uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    command: >-
      deploy
      --define BUILD_SHA:"'${{ steps.meta.outputs.sha }}'"
      --define BUILD_VERSION:"'${{ steps.version.outputs.version }}'"
      --define BUILD_TIMESTAMP:"'${{ steps.timestamp.outputs.timestamp }}'"
      --define BUILD_ENV:"'production'"
```

No `environment:` key needed -- production is the top-level config, matching
current behavior.

---

## Question (b): Resolving $GITHUB_SHA in production triggers

**Problem:** The production workflow is triggered by `workflow_run` (after
staging succeeds) or `workflow_dispatch` (manual/rollback). The checkout step
already handles ref resolution correctly:

```yaml
ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}
```

But `github.sha` in a `workflow_run` trigger is the HEAD of the *default
branch at trigger time*, not the commit that triggered staging. The checkout
ref expression already accounts for this via the `||` chain.

**Recommendation:** Add a step that resolves the *actual deployed SHA* after
checkout, rather than trusting the context variables directly for the
`--define` value:

```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
  with:
    ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}

- name: Resolve build metadata
  id: meta
  run: |
    echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
    echo "short_sha=$(git rev-parse --short HEAD)" >> "$GITHUB_OUTPUT"
    echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"
```

This is the most reliable approach because:
1. `git rev-parse HEAD` reflects the *actually checked out* commit, regardless
   of which trigger path was taken.
2. For tag-based rollback (`inputs.ref` = `v0.2.0`), it resolves the tag
   to its commit SHA, not the tag name.
3. It works identically for `workflow_run` and `workflow_dispatch`.

For staging, `${{ github.sha }}` is already correct (trigger is `push` to
`main`), but using the same `git rev-parse HEAD` pattern keeps both
workflows consistent and future-proof.

---

## Question (c): Adding --define to staging without breaking environment pass-through

**Current staging deploy step:**
```yaml
- uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    environment: staging
```

**What happens when you add `command:`:** The action source shows that if
`commands` array is empty (no `command:` input), it pushes `"deploy"` as
the default. When `command:` IS provided, it uses that value instead.

The `environment:` input is processed independently -- on line 37277 of
the action source:
```js
if (environment && !command.includes("--env")) {
    args.push("--env", environment);
}
```

So setting `command: "deploy --define ..."` while keeping `environment: staging`
works perfectly. The action will execute:
```
npx wrangler deploy --define BUILD_SHA:'abc' --define ... --env staging
```

The `--env staging` is auto-appended because the command string does not
contain `--env`.

**No breaking change.** The `environment: staging` pass-through is preserved.

---

## Proposed Implementation Tasks

### Task 1: Add build metadata steps to deploy-staging.yml

Add two steps before the wrangler-action step:

```yaml
- name: Read version
  id: version
  run: echo "version=$(jq -r .version package.json)" >> "$GITHUB_OUTPUT"

- name: Build timestamp
  id: timestamp
  run: echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"
```

Then modify the wrangler-action step to include `command:` with `--define` flags.

### Task 2: Add build metadata steps to deploy-production.yml

Add a `Resolve build metadata` step after checkout (as shown in Question b)
that outputs sha, version, and timestamp. Modify the wrangler-action step
to include `command:` with `--define` flags.

### Task 3: Consume BUILD_* globals in handleHealth

In `src/index.js`, reference the build-time constants as global identifiers.
These are replaced at build time by esbuild (wrangler's bundler), so they
don't need to be declared -- they're literally substituted in the source.

```js
function handleHealth() {
  return jsonResponse({
    status: 'ok',
    build: {
      sha: typeof BUILD_SHA !== 'undefined' ? BUILD_SHA : null,
      version: typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : null,
      deployedAt: typeof BUILD_TIMESTAMP !== 'undefined' ? BUILD_TIMESTAMP : null,
      environment: typeof BUILD_ENV !== 'undefined' ? BUILD_ENV : null,
    },
    legal: {
      terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
      policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
    },
  });
}
```

**Important:** Use `typeof X !== 'undefined'` guards. During local `wrangler dev`
(where no `--define` flags are passed), the globals won't exist. Without the
guard, the handler would throw a ReferenceError. The `typeof` check is safe
because `typeof` on an undeclared identifier returns `'undefined'` without
throwing.

### Task 4: Add [define] fallback in wrangler.toml for local dev

For `wrangler dev` to work without errors, add a `[define]` stanza with
safe defaults:

```toml
[define]
BUILD_SHA = "'local'"
BUILD_VERSION = "'dev'"
BUILD_TIMESTAMP = "'0'"
BUILD_ENV = "'development'"
```

And mirror in `[env.staging]` (since define is non-inheritable):

```toml
[env.staging.define]
BUILD_SHA = "'local'"
BUILD_VERSION = "'dev'"
BUILD_TIMESTAMP = "'0'"
BUILD_ENV = "'staging-local'"
```

**These are overridden at deploy time** by the `--define` CLI flags (CLI
takes precedence over config file).

**Alternative approach:** Skip the wrangler.toml defaults entirely and rely
on the `typeof` guards in code. This is simpler and avoids the
non-inheritable duplication problem. The `typeof` guards handle the missing
globals gracefully -- the build object fields will be `null` during local dev.

**Recommendation:** Skip the wrangler.toml `[define]` stanza. Use `typeof`
guards only. Fewer moving parts, no duplication problem, and `null` fields
in local dev are a clear signal that build metadata isn't injected.

### Task 5: Update smoke test to verify build metadata

Extend the health check in `scripts/smoke-test.sh` to validate the new
`build` object is present after deploy:

```bash
# After existing health check passes:
BUILD_SHA=$(echo "$HEALTH_BODY" | jq -r '.build.sha // empty' 2>/dev/null)
if [ -n "$BUILD_SHA" ] && [ "$BUILD_SHA" != "null" ]; then
  pass "/health includes build.sha ($BUILD_SHA)"
else
  fail "/health missing build.sha"
fi
```

This validates that the deploy pipeline correctly injected build metadata.

---

## Risks and Mitigations

### Risk 1: YAML quoting of --define values

The `--define` syntax requires careful quoting: the value must be a valid JS
expression. For string values, this means `--define KEY:"'value'"`. YAML
multi-line scalars (`>-`) help avoid escaping issues, but if the commit SHA
or timestamp contains unexpected characters, the define could break.

**Mitigation:** Commit SHAs are hex-only (`[0-9a-f]`). Timestamps use
`[0-9T:-Z]`. Version strings use `[0-9.]`. None of these require special
escaping. The single-quotes inside the define value protect the string.

### Risk 2: Stale metadata after wrangler deploy failure + retry

If the timestamp step runs, then deploy fails, then a manual retry happens,
the timestamp will be re-computed (GitHub Actions re-runs all steps in a job).
The SHA and version will remain correct since they come from the checked-out
code.

**Mitigation:** None needed. This is expected behavior.

### Risk 3: Build metadata exposes internal information

Commit SHA and deploy timestamp are mildly sensitive (reveal deploy cadence,
exact code version). The health endpoint is public and unauthenticated.

**Mitigation:** This is standard practice for services (see: any `/health`
or `/version` endpoint). The SHA is already public in the GitHub repo. The
version is in `package.json`. If paranoia is warranted, expose only
`short_sha` (7 chars) instead of the full 40-char SHA, but this is
unnecessary for a public repo.

### Risk 4: Local dev breaks without --define

If the handler references `BUILD_SHA` without a guard, `wrangler dev` will
throw ReferenceError because the global isn't defined.

**Mitigation:** Use `typeof BUILD_SHA !== 'undefined'` guards (Task 3) OR
add `[define]` defaults to wrangler.toml (Task 4). Recommendation is
typeof guards only.

### Risk 5: Non-inheritable [define] drift

If someone adds `[define]` to wrangler.toml later for a different purpose,
they must remember to duplicate it in `[env.staging]`. This is a known
wrangler limitation for non-inheritable keys.

**Mitigation:** Since we're recommending against using `[define]` in
wrangler.toml (relying on CLI flags only), this risk is eliminated.

---

## Dependencies

- **No new dependencies.** `--define` is a built-in wrangler feature.
  `jq` and `date` are available on `ubuntu-latest` runners.
- **No changes to wrangler.toml required** (if using typeof guards).
- **No changes to secrets or environment variables.**
- **Wrangler version 4.73.0** (current) fully supports `--define`.

## Verification

After deploy, the pipeline can verify build metadata was injected correctly:

```bash
curl -s https://wrl-staging.benpeter.workers.dev/health | jq '.build'
# Expected:
# {
#   "sha": "43f8b68...",
#   "version": "0.1.0",
#   "deployedAt": "2026-03-24T...",
#   "environment": "staging"
# }
```

This can be added to the existing smoke test (Task 5) for automated
verification on every deploy.
