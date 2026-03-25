You are fixing three UI issues and adding regression tests in the WRL dashboard. All changes are in the worktree at `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/curious-singing-ullman`.

## Fix A: Low-contrast muted text (#211)

The real contrast problem is `--color-text-muted` (#6e6a66), used for `.auth-tagline`, `.login-divider-text`, `.login-apikey-label`, and many labels throughout the app. The `.btn--github` button itself has 10.5:1 contrast and is fine.

**What to do:**
1. In `src/design-system.css` (line 7), change `--color-text-muted` from `#6e6a66` to `#595550`.
   - This gives ~6.85:1 against `--color-bg` (#f7f6f5) and ~7.39:1 against `--color-surface` (#ffffff) — solid WCAG AA pass.
2. Apply the same change in `src/design-system.js` (line 11) — this is the JS export of the same CSS. Both files must stay in sync.
3. Do NOT change `--color-border` or add `--color-border-interactive` — the ghost button border concern is deferred.
4. Do NOT change `.btn--github` styles — they already pass.

**Files to modify:** `src/design-system.css`, `src/design-system.js`

## Fix B: Duplicate billing status display (#190)

The billing view shows status in two places: `buildRefreshRow()` always renders "Status: Active/Free/etc." text, AND `buildPaymentSection()`/`buildStatusBanner()` renders status-specific UI (badges, banners). This creates redundancy.

**What to do:**
1. In `src/ui/ui-billing.js`, in the `buildRefreshRow()` function (~line 758-770), remove the `leftEl` span that renders `"Status: " + billingStatusLabel(usageData.billingStatus)`. The refresh row should contain only the refresh button.
2. Do NOT remove the `billingAnnounce()` call in `refreshBillingData()` — screen reader users still need the aria-live status announcements.
3. Do NOT add "Last updated" timestamp — keep it simple.

**Files to modify:** `src/ui/ui-billing.js`

## Fix C: Add docs link to authenticated nav (#210)

Add a documentation link to the nav bar for all authenticated users (both session and API-key auth).

**What to do:**
1. In `src/ui/ui-auth.js`, in the `renderAppShell()` function, add a docs link in the `navActions` div (right side of nav bar, BEFORE the username/sign-out controls). Do NOT add it to the `navLinks` group (left side) — docs is a utility action, not a primary workflow destination.
2. The link should:
   - Use text "Docs" (not "Documentation")
   - Point to `https://docs.webresourceledger.com`
   - Use `target="_blank"` and `rel="noopener noreferrer"`
   - Include a small inline SVG external-link icon (12x12, `aria-hidden="true"`, `fill="currentColor"`) after the text
   - Include screen reader text "(opens in new tab)" via a visually-hidden span — **this span MUST be a child of the `<a>` element**, not a sibling. Screen readers only announce descendant content of the focused element.
   - Use class `nav-link nav-link--external` for consistent styling
3. Add this link for BOTH auth paths (session and apikey). Both code paths build `navActions` — add the docs link in both.
4. In `src/ui/ui-css.js`, add minimal CSS for `.nav-link--external` icon spacing (small gap between text and icon, vertical alignment). Add `.sr-only` utility class if not already present (for the screen reader text).

**IMPORTANT — external link guard:** In `src/ui/ui-shell.js`, the `updateNavCurrent()` function iterates all `.nav-link` elements and strips the leading `#` from each `href` to compare against the current route. The new docs link will carry an `https://` URL, not a hash route. Add a guard in `updateNavCurrent`: if the link's href starts with `http`, skip it (e.g., `if (linkPath.startsWith('http')) continue;`). This prevents the nav highlight logic from mishandling external URLs.

**Files to modify:** `src/ui/ui-auth.js`, `src/ui/ui-css.js`, `src/ui/ui-shell.js`

## Regression Tests

Add the following regression tests to protect these fixes. Follow the existing project test patterns (string assertions on exported JS constants, no DOM environment).

### Test 1: Billing dedup guard (in `test/ui-billing.test.js`)
Assert that `BILLING_JS` does NOT contain `'Status: '` within the `buildRefreshRow` function body. This catches any revert of the dedup fix.

### Test 2: Design token sync check (in `test/ui-dashboard.test.js`)
Assert that both `DESIGN_SYSTEM_CSS` and `DESIGN_SYSTEM_JS` (or whatever the exported constants are named) contain the exact hex value `#595550` for `--color-text-muted`. This ensures the two files stay in sync.

### Test 3: Docs link structural coverage (in `test/ui-dashboard.test.js`)
Assert that `AUTH_JS` contains `docs.webresourceledger.com` and `opens in new tab`. This verifies the docs link is present with the accessibility text.

**Important:** Read the existing test files first to understand the exact constant names and assertion patterns used in this project. Match the existing style exactly.

## What NOT to do
- Do not touch `src/admin.js` or any backend files
- Do not add new dependencies or frameworks
- Do not restructure the nav or add a footer
- Do not change the ghost button border (`--color-border`)

## Verification
- Run `npm test` and confirm all existing tests pass (including your new ones).
- The contrast ratio of the new `--color-text-muted` value must be >= 4.5:1 against both #f7f6f5 and #ffffff.
