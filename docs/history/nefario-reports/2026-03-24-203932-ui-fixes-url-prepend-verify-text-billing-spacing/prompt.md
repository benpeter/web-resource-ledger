Batch of three small UI fixes shipped as a single phase.

## Fix 1 — Auto-prepend https:// (#179)

The captures UI URL input field automatically prepends `https://` when a user enters a bare hostname (e.g., `example.com` → `https://example.com`). Entries that already have `http://` or `https://` are left unchanged. Partial schemes like `htt://` are not "fixed".

## Fix 2 — Verify page German text (#180)

All eIDAS references on the verify page use "Article" instead of the German abbreviation "Art." (e.g., "Article 42" not "Art. 42"). Check both the verify page HTML template (`src/verify-page.js`) and the `@w-r-l/verify` CLI formatter (`packages/verify/lib/format.js`).

## Fix 3 — Billing page spacing (#183)

Add visible spacing between numeric count values and their unit labels on the billing page (e.g., "14 Captures" not "14Captures"). CSS or template fix.

## Success criteria

- Entering `example.com` in capture URL field submits `https://example.com`
- Entering `https://example.com` or `http://example.com` is unchanged
- All "Art." references on verify page replaced with "Article"
- Billing page shows space between numbers and units
- No regressions on other pages
- Existing tests pass; add/update tests for URL prepend logic

## Scope

- **In**: UI URL input normalization, verify page text, billing page CSS
- **Out**: API-level URL normalization, i18n infrastructure, billing logic changes

Closes #179, closes #180, closes #183
