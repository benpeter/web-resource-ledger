# Domain Plan Contribution: devx-minion

## Planning Question
Should the vendoring script be shell or Node? It must be idempotent, work locally and in CI, and produce the current `export default "..."` format.

## Recommendations

**Use Node (ESM), not shell.** Three reasons:

1. **String escaping is the hard part.** The vendor file wraps ~170KB of JavaScript as a single string literal inside `export default "..."`. This requires escaping backslashes, double quotes, newlines, template literal backticks, and potentially other special chars. Shell (`sed`/`awk`) string escaping at this scale is fragile and hard to debug. Node's `JSON.stringify()` handles all edge cases in one call and is the canonical way to produce a valid JS string literal.

2. **Version extraction from package.json is native.** Node reads JSON without `jq` as a dependency. The script needs to read the installed version from `node_modules/@duckduckgo/autoconsent/package.json` and write it into `src/consent.js`. This is trivial in Node, fiddly in shell.

3. **Consistency with existing scripts.** The project already has Node scripts (`generate-signing-key.js`, `test-battery.js`, `migrate-kv-to-d1.js`). Shell scripts exist too, but the complex transformation scripts are Node. This follows the pattern.

**Script name:** `scripts/vendor-autoconsent.js`

**npm script:** Add `"vendor:autoconsent": "node scripts/vendor-autoconsent.js"` to package.json. This gives a discoverable entry point for both humans (`npm run vendor:autoconsent`) and CI.

**Idempotency approach:** The script always regenerates from source. Running it twice with the same `node_modules` content produces identical output. No state files, no "already up to date" short-circuit that could mask staleness. The GitHub Action handles the "has anything changed" check via `git diff --quiet`.

### Script logic (pseudocode)

```
1. Read node_modules/@duckduckgo/autoconsent/dist/autoconsent.playwright.js
2. Read node_modules/@duckduckgo/autoconsent/package.json -> .version
3. Write src/vendor/autoconsent-script.js:
     // Auto-generated wrapper -- exports autoconsent script as a string
     // Do not edit; regenerate from autoconsent.playwright.js (NOT content.bundle.js)
     export default <JSON.stringify(content)>;
4. Read src/consent.js
5. Replace AUTOCONSENT_VERSION line: `export const AUTOCONSENT_VERSION = '<version>';`
6. Write src/consent.js back
```

Step 5 uses a regex replace on the single line — no AST parsing needed. The pattern is unambiguous (`export const AUTOCONSENT_VERSION = '...'`).

### Error messages

The script should fail loudly with actionable messages:

- Missing `node_modules/@duckduckgo/autoconsent`: "autoconsent not installed. Run `npm install` first."
- Missing `autoconsent.playwright.js` in dist: "autoconsent dist layout changed -- expected dist/autoconsent.playwright.js. Check if the package structure has changed in the new version."
- `AUTOCONSENT_VERSION` line not found in consent.js: "Could not find AUTOCONSENT_VERSION export in src/consent.js. The line format may have changed."

Each error should exit with code 1 so CI treats it as a failure.

### Output

The script should print what it did to stdout (for CI logs and local use):

```
vendored autoconsent 14.63.0 -> src/vendor/autoconsent-script.js (170509 bytes)
updated AUTOCONSENT_VERSION in src/consent.js to 14.63.0
```

No output on `--quiet` flag (for scripting), but default is informative.

## Proposed Tasks

### Task 1: Create `scripts/vendor-autoconsent.js`
**Deliverable:** Node ESM script that reads the autoconsent playwright bundle from node_modules, wraps it as a string export, writes the vendor file, and updates AUTOCONSENT_VERSION in consent.js.

**Requirements:**
- Zero dependencies beyond Node stdlib (`fs`, `path`)
- ESM (`import` syntax, matching project's `"type": "module"`)
- Exits 0 on success, 1 on failure with actionable error messages
- Prints what it did to stdout
- Works from repo root (uses relative paths from `process.cwd()`)

**Acceptance criteria:**
- Running `node scripts/vendor-autoconsent.js` twice produces identical output (idempotent)
- Running it after `npm update @duckduckgo/autoconsent` updates both the vendor file and the version constant
- Running it without node_modules fails with a clear error message

**Dependencies:** None -- this is a standalone script.

### Task 2: Add `vendor:autoconsent` npm script
**Deliverable:** Entry in package.json `scripts` section.

**Dependencies:** Task 1.

### Task 3: Add header comment to vendor file documenting regeneration
**Deliverable:** The two-line header comment is already present in the current file. The script must preserve it exactly (it writes the header as part of generation, not by preserving existing content). Verify the header matches.

**Dependencies:** Task 1.

## Risks and Concerns

1. **Autoconsent dist layout may change.** The script hardcodes the path `dist/autoconsent.playwright.js`. If DuckDuckGo restructures their package, the script breaks. **Mitigation:** The error message explicitly names the expected path and suggests checking for layout changes. The weekly CI run will catch this quickly.

2. **String escaping edge cases.** `JSON.stringify()` handles standard escaping, but if the autoconsent source contains unusual Unicode or raw control characters, the resulting string literal could behave differently when `eval`'d in the browser context. **Mitigation:** This is the same approach the current vendor file already uses. The test suite exercises the actual consent flow, so any escaping issue would surface as a test failure.

3. **AUTOCONSENT_VERSION regex fragility.** If someone reformats the line (adds a type annotation, changes quotes, etc.), the regex won't match. **Mitigation:** The script fails loudly if the pattern isn't found, and the error message tells you exactly what it was looking for.

4. **Large file in git diff.** The vendor file is ~170KB. Every update creates a large diff. This is already the case today. **Mitigation:** Not a new problem. Could consider `.gitattributes` to mark the file as binary for diff purposes, but that's a separate concern.

## Additional Agents Needed

None. This is a straightforward script with well-defined inputs and outputs. The CI/infrastructure side (GitHub Action workflow) is a separate task that will consume this script.
