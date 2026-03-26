# Lucy Review: autoconsent vendor script + update workflow

## Verdict: ADVISE

Two minor findings. Neither blocks merging but both should be addressed.

---

### Finding 1 — COMPLIANCE: catch blocks in `scripts/vendor-autoconsent.js` lack specific error types

**File:** `scripts/vendor-autoconsent.js`, lines 19 and 29

**What:** Both `catch` blocks use bare `catch {}` (no error parameter) and log a generic message via `console.error` before exiting. The CLAUDE.md Engineering Philosophy states: "Every catch must either log the error or handle a specific, named error type." These catches log a *custom* message but discard the original error object, so a developer debugging a failure (e.g., unexpected permission denied vs. file-not-found) loses the root cause.

**Fix:** Capture the error and include it in the log output:

```js
} catch (err) {
  console.error('autoconsent not installed. Run `npm install` first.', err.message);
  process.exit(1);
}
```

**Severity:** Minor. The script is short and the failure modes are narrow, but the convention is explicit.

---

### Finding 2 — CONVENTION: workflow repeats `npm install` + `vendor:autoconsent` in three separate jobs

**File:** `.github/workflows/autoconsent-update.yml`, jobs `update-and-test` (lines 63-67), `battery` (lines 91-92), `open-pr` (lines 122-123)

**What:** Each of the three jobs independently runs `npm install @duckduckgo/autoconsent@latest` and `npm run vendor:autoconsent`. This means the version resolved could theoretically differ between jobs if a new npm publish lands mid-workflow. More practically, it is redundant work that increases CI minutes and violates "Lean and Mean" (minimize moving parts).

**Fix:** Upload the changed files (`package.json`, `package-lock.json`, `src/vendor/autoconsent-script.js`, `src/consent.js`) as an artifact from the `update-and-test` job and download them in subsequent jobs, or use a single job with sequential steps. This also eliminates the (unlikely but real) version-skew risk.

**Severity:** Minor. The workflow is correct as-is; this is a maintainability and correctness-at-the-margin issue.

---

### Positive observations (no action needed)

- **gh CLI body-file pattern**: PR creation at line 169-191 correctly uses `body_file=$(mktemp)` with `--body-file`, complying with `.claude/rules/gh-cli-body-file.md`.
- **File naming**: `vendor-autoconsent.js` follows the existing kebab-case convention in `scripts/` (e.g., `generate-signing-key.js`, `test-battery.js`).
- **npm script registration**: `vendor:autoconsent` is registered in `package.json` (line 28) and referenced consistently by the workflow.
- **Node version**: Workflow uses `node-version-file: '.nvmrc'`, matching the project's `.nvmrc` (Node 22).
- **Actions pinned to SHA**: All `uses:` references pin to full commit SHAs with version comments -- good supply-chain practice.
- **Permissions scoped correctly**: Top-level `permissions: contents: read` with elevated permissions only on the `open-pr` job.
- **Code signature**: `// tva` present at line 1 of the script.
- **Module system**: Script uses ESM (`import`), consistent with the project.
- **Stale PR cleanup**: Workflow closes superseded PRs before opening a new one.
- **Duplicate PR guard**: Checks for existing open PRs before proceeding.
