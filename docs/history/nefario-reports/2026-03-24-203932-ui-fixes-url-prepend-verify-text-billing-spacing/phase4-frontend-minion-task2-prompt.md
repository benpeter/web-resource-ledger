Create test/ui-submit.test.js with unit tests for the safeUrl() function in src/ui/ui-submit.js, plus regression assertions for Fix 2 and Fix 3 in existing test files.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/iridescent-purring-lagoon

## Part A: New test file for safeUrl()

### Pattern to follow

This project uses an evalFromSource() pattern to extract functions from JS string constants. See test/ui-billing.test.js for the exact pattern -- copy the evalFromSource helper from there and adapt it. Import SUBMIT_VIEW_JS from "../src/ui/ui-submit.js" and extract the safeUrl function.

### Test cases

Write a single describe("safeUrl -- URL normalization") block with these cases:

1. safeUrl("https://example.com") returns "https://example.com/" -- full https URL unchanged
2. safeUrl("http://example.com") returns "http://example.com/" -- full http URL unchanged
3. safeUrl("example.com") returns "https://example.com/" -- bare hostname gets https prepended
4. safeUrl("example.com/page?q=1") returns "https://example.com/page?q=1" -- bare hostname with path
5. safeUrl("htt://example.com") returns null -- has "://" so we don't "fix" it
6. safeUrl("ftp://example.com") returns null -- wrong scheme
7. safeUrl("javascript:alert(1)") returns null -- dangerous scheme
8. safeUrl("") returns null -- empty string
9. safeUrl("not a url at all") returns null -- gibberish (even with prepend, spaces make it invalid)
10. safeUrl("//example.com") returns "https://example.com/" -- protocol-relative URL gets https prepended (no "://" present)
11. safeUrl("example.com:8080") returns null -- bare hostname with port: first parse succeeds with "example.com:" as scheme, protocol check rejects it; prepend not attempted because "://" is absent... actually test what the actual behavior is and document it

For case 11 (example.com:8080): run the actual safeUrl function to determine the real behavior, then write the test to match. The test documents the behavior, whatever it is.

Use the naming convention from ui-billing.test.js: prefix test names with a partition letter and number (e.g., A1:, A2:, etc.).

### Constraints
- Import SUBMIT_VIEW_JS from "../src/ui/ui-submit.js"
- File: test/ui-submit.test.js
- Use vitest (describe, it, expect)
- No DOM, no fetch, no document -- pure function tests only

## Part B: Regression assertions for Fix 2 and Fix 3

### verify-page.test.js

Add a test assertion that the verify page HTML does NOT contain "Art." (the German abbreviation). Find the existing test file test/verify-page.test.js, look at how it imports and generates HTML, and add a test like:

```js
it('uses "Article" not "Art." for eIDAS references', () => {
  // generate the HTML however the existing tests do
  expect(html).not.toContain('Art. 41');
  expect(html).toContain('Article 41');
});
```

### ui-billing.test.js

Add a test assertion that the billing CSS contains "display: block" for the billing stat spans. Look at test/ui-billing.test.js and add:

```js
it('billing stat value and label are display: block', () => {
  // import UI_CSS however existing tests do
  expect(css).toContain('display: block');
  // or more specific assertions
});
```

## Verification

After creating/modifying all test files, run the tests to make sure they pass:
```
npx vitest run test/ui-submit.test.js
npx vitest run test/verify-page.test.js
npx vitest run test/ui-billing.test.js
```

When you finish, report:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
- Whether all tests pass