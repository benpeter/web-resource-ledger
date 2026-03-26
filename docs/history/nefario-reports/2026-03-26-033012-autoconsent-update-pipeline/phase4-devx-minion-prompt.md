Create a Node ESM script `scripts/vendor-autoconsent.js` that regenerates the vendored autoconsent files. This script must be idempotent, work both locally and in CI, and use zero external dependencies.

## What to do

1. **Read the autoconsent playwright bundle**: Read `node_modules/@duckduckgo/autoconsent/dist/autoconsent.playwright.js` and wrap it as a JS string export using `JSON.stringify()`.

2. **Write `src/vendor/autoconsent-script.js`**: Output format:
   ```js
   // Auto-generated wrapper -- exports autoconsent script as a string
   // Do not edit; regenerate from autoconsent.playwright.js (NOT content.bundle.js)
   export default <JSON.stringify(content)>;
   ```

3. **Update `AUTOCONSENT_VERSION` in `src/consent.js`**: Find `export const AUTOCONSENT_VERSION = '...';` and replace version with installed version from `node_modules/@duckduckgo/autoconsent/package.json`.

## Error handling
Fail loudly with exit code 1:
- Missing node_modules/@duckduckgo/autoconsent: "autoconsent not installed. Run `npm install` first."
- Missing dist/autoconsent.playwright.js: "autoconsent dist layout changed -- expected dist/autoconsent.playwright.js"
- AUTOCONSENT_VERSION line not found: "Could not find AUTOCONSENT_VERSION export in src/consent.js"

## Output
Print to stdout:
```
vendored autoconsent X.Y.Z -> src/vendor/autoconsent-script.js (NNNNN bytes)
updated AUTOCONSENT_VERSION in src/consent.js to X.Y.Z
```

## npm script
Add `"vendor:autoconsent": "node scripts/vendor-autoconsent.js"` to `package.json` scripts.

## What NOT to do
- Do not add any npm dependencies
- Do not add CLI argument parsing
- Do not touch `src/vendor/autoconsent.playwright.js`
- Do not modify any test files
- Must be Node ESM (.js with import syntax, project uses "type": "module")

## Verification
After creating the script, run it once to confirm it produces identical output to the current vendor file. Use `git diff --stat` to verify no unintended changes.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/streamed-munching-dragon
