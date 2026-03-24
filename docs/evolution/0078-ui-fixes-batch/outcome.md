# Outcome — 0078 UI Fixes Batch

## What was built

Three small UI fixes shipped together:

1. **URL auto-prepend** (#179): `safeUrl()` in `src/ui/ui-submit.js` now tries prepending `https://` when the URL constructor throws and the input contains no `://`. Error message updated to reflect that bare hostnames are accepted.

2. **Verify page text** (#180): "eIDAS Art. 41" → "eIDAS Article 41" in `src/verify-page.js` line 344.

3. **Billing page spacing** (#183): Added `display: block` to `.billing-stat-value` and `.billing-stat-label` in `src/ui/ui-css.js`, enabling the existing `margin-top` to create visible spacing between number and label.

## Files changed

| File | Change |
|------|--------|
| `src/ui/ui-submit.js` | safeUrl() expanded with https:// prepend fallback; error message updated |
| `src/verify-page.js` | "Art. 41" → "Article 41" |
| `src/ui/ui-css.js` | display: block on billing stat value and label spans |
| `test/ui-submit.test.js` | New file, 11 test cases for safeUrl() URL normalization |
| `test/verify-page.test.js` | Regression assertion: no "Art." in verify page HTML |
| `test/ui-billing.test.js` | Regression assertions: display: block on billing stat spans |

## Test results

- 1444 tests pass (56 files), 2 skipped (pre-existing)
- 14 new tests added (11 safeUrl, 1 verify page, 2 billing CSS)
- No regressions

## Surprises

- `example.com:8080` (bare hostname with port) returns null from safeUrl() because the URL constructor parses `example.com:` as a scheme without throwing, so the prepend path is never reached. Documented as a known edge case in the test suite (A11). Not worth fixing — users who know about ports will include the scheme.

- The `://` guard also means protocol-relative URLs (`//example.com`) get prepended to `https://example.com/` — a reasonable and documented behavior.

## Backlog changes

No backlog changes. All three issues (#179, #180, #183) resolved. No new items deferred.
