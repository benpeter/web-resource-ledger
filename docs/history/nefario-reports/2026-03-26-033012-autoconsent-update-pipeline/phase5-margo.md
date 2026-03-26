# Margo Review: Autoconsent Update Pipeline

## Verdict: ADVISE

Both files are well-proportioned to the problem they solve. The vendor script is 64 lines of straightforward Node with no dependencies beyond `node:fs` and `node:path`. The workflow automates a genuine maintenance burden (tracking upstream releases of a vendored dependency). No frameworks, no abstraction layers, no unnecessary indirection.

Two non-blocking concerns:

---

### 1. Redundant work across three workflow jobs

**What:** The `battery` and `open-pr` jobs each repeat `npm ci`, `npm install @duckduckgo/autoconsent@latest`, and `npm run vendor:autoconsent` -- the same setup already done in `update-and-test`. Three full `npm ci` runs for one dependency bump.

**Why it matters:** This is accidental complexity in the workflow. Each job re-derives the same state from scratch. The `open-pr` job in particular does no testing -- it only needs the committed files.

**Simpler alternative:** Use a workflow artifact to pass the updated workspace (or at minimum `package.json`, `package-lock.json`, `src/vendor/autoconsent-script.js`, `src/consent.js`) from `update-and-test` to downstream jobs. This eliminates two redundant `npm ci` + `npm install` cycles and removes the risk of the three jobs resolving different versions if a publish happens mid-run.

**Severity:** Low. Weekly cadence means the wasted CI minutes are negligible. The version-drift risk is theoretical but real -- if autoconsent publishes twice in one morning, the three jobs could each pick up a different "latest."

---

### 2. Semver validation is too loose

**What:** The version check (`grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'`) uses an unanchored trailing match. It accepts `1.2.3-anything-at-all` and `1.2.3456` equally. This is fine for the guard's purpose (rejecting garbage), but the trailing `+` instead of `$` means it also accepts strings like `1.2.3.4.5`.

**Why it matters:** Cosmetic. The guard exists to catch npm-registry weirdness, not to enforce strict semver. Unlikely to cause a real problem.

**Simpler alternative:** Anchor the end: `'^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'`. Or remove the validation entirely -- if `npm view` returns garbage, the workflow will fail at `npm install` anyway, which is a clearer error signal.

---

### What looks good

- **Vendor script (`scripts/vendor-autoconsent.js`):** Clean, minimal, no dependencies. Two clear guards (package installed, dist file present) with actionable error messages. The version stamp in `src/consent.js` is updated atomically with the vendored file. No abstraction layers, no configuration options, no generalization beyond what is needed. This is exactly right.

- **Workflow structure:** The three-job split (test, battery, PR) with `continue-on-error` on battery is a sound pattern -- battery failures produce information (included in the PR body) without blocking the update. Stale-PR cleanup prevents accumulation. Duplicate-PR detection avoids noise. Pin-by-SHA on Actions is good supply-chain hygiene.

- **No over-engineering signals:** No reusable workflow abstractions, no matrix builds, no caching beyond npm's built-in, no Slack notifications, no auto-merge. The workflow does one thing and stops. YAGNI is respected throughout.
