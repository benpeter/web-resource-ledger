# Test Strategy: UI/UX Fixes Batch (#213)

## Assessment of Existing Test Coverage

The project uses **Vitest** with `@cloudflare/vitest-pool-workers` for integration tests and string/helper assertions for UI tests. The UI test approach is distinctive: UI modules export JS as string constants (`BILLING_JS`, `AUTH_JS`, etc.), and tests either (a) extract pure-logic helpers via `evalFromSource` for real function testing, or (b) assert against the string content for structural/security checks. There is no DOM environment (no jsdom, no happy-dom).

This approach is well-suited for what the codebase needs. The four fixes map to tests as follows:

---

## Fix 1: Low-Contrast Sign In Button (CSS in ui-css.js or design-system.js)

**Existing coverage:** `ui-dashboard.test.js` checks design token presence (`--color-primary`, `--color-text`) and that `.btn--github` exists via HTML output assertions. `ui-billing.test.js` has CSS class presence checks (Partition G).

**New tests needed: None mandatory. One regression guard recommended.**

The current `.btn--github` rule uses `var(--color-primary)` for both `background` and `color: var(--color-primary-text)`. The fix will change the text color or background contrast. This is fundamentally a visual concern, but we can add a string assertion to prevent the contrast regression from recurring.

**Recommended test (in `ui-dashboard.test.js`):**

```js
describe('UI_CSS -- Sign-in button contrast', () => {
  it('btn--github does not use the same token for background and color', () => {
    // Regression: Sign-in button must have distinct foreground/background tokens
    const btnBlock = UI_CSS.slice(UI_CSS.indexOf('.btn--github'));
    const ruleEnd = btnBlock.indexOf('}');
    const rule = btnBlock.slice(0, ruleEnd);
    // Extract background and color values
    const bg = rule.match(/background:\s*([^;]+)/);
    const fg = rule.match(/(?:^|\s)color:\s*([^;]+)/);
    if (bg && fg) {
      expect(bg[1].trim()).not.toBe(fg[1].trim());
    }
  });
});
```

**Effort: Low.** One test, string assertion only. Add it to the existing design-system token section of `ui-dashboard.test.js`.

---

## Fix 2: Duplicate Billing Status Display (DOM in ui-billing.js)

**Existing coverage:** `ui-billing.test.js` tests `billingStatusLabel` thoroughly (Partition A), and checks structural function presence (Partition E). But it does NOT test the DOM rendering logic -- `buildBillingContent`, `buildRefreshRow`, or `buildStatusBanner` are only checked for existence, not behavior.

**The bug:** The billing view shows the status in two places:
1. `buildStatusBanner()` -- conditional banner for `grace_period`/`blocked` (line 198-244)
2. `buildRefreshRow()` -- always shows `Status: {label}` text (line 766)

When `grace_period` or `blocked`, both are visible = duplicate display.

**New tests needed: Yes, one regression guard.**

Since there's no DOM environment, we use the string-assertion pattern already established. The fix will either (a) conditionally suppress the status text in `buildRefreshRow` when a banner is showing, or (b) remove the status text from the refresh row entirely. Either way, we can assert the fix holds.

**Recommended test (in `ui-billing.test.js`):**

```js
describe('BILLING_JS -- duplicate status display guard', () => {
  it('buildRefreshRow does not duplicate status text when status banner is shown', () => {
    // The refresh row must not show "Status: ..." text when buildStatusBanner
    // already renders a prominent banner for grace_period/blocked states.
    // Implementation check: buildRefreshRow should reference billingStatus
    // conditionally, or the status text should be removed from the refresh row.
    //
    // Exact assertion depends on chosen fix approach -- update after implementation.
    // Minimum: billingStatusLabel should not appear in buildRefreshRow,
    // OR buildRefreshRow should contain a conditional guard on billingStatus.
    const refreshRowFn = BILLING_JS.slice(
      BILLING_JS.indexOf('function buildRefreshRow'),
      BILLING_JS.indexOf('function refreshBillingData')
    );
    // After fix, the refresh row should either:
    // (a) not call billingStatusLabel at all, OR
    // (b) conditionally skip it for banner-eligible statuses
    const hasBillingStatusLabel = refreshRowFn.includes('billingStatusLabel');
    const hasConditional = refreshRowFn.includes('grace_period') || refreshRowFn.includes('blocked');
    expect(
      !hasBillingStatusLabel || hasConditional,
      'buildRefreshRow must not unconditionally display billing status (duplicates the status banner)'
    ).toBe(true);
  });
});
```

**Effort: Low.** String assertion. The test is implementation-aware (as are all existing UI tests in this project), which is acceptable given the no-DOM constraint.

---

## Fix 3: Add Docs Link to Authenticated Nav (DOM in ui-auth.js)

**Existing coverage:** `ui-dashboard.test.js` checks for `renderAuthGate`, nav-related markup, and view function presence. No test specifically checks the authenticated nav link list.

**New tests needed: Yes, one structural presence test.**

**Recommended test (in `ui-dashboard.test.js`):**

```js
it('authenticated nav includes a docs link', async () => {
  // AUTH_JS builds the nav with links for captures, schedules, billing, etc.
  // After fix, it must also include a link to docs.
  expect(AUTH_JS).toContain('docs');
  // The link should point to the docs subdomain
  expect(AUTH_JS).toMatch(/docs\.webresourceledger\.com/);
});
```

**Effort: Trivial.** Two string assertions. Follows the exact pattern of existing nav tests.

---

## Fix 4: Operator Notification on Admin Key Creation (Backend in admin.js)

**Existing coverage:** `admin-keys.test.js` is comprehensive -- 30+ integration tests covering POST/GET/DELETE, auth, validation, lifecycle, cross-tenant isolation, scope enforcement. The POST tests verify the response shape (201, key format, keyHash, warning, fields). But there is NO assertion that any notification is dispatched on key creation.

**New test needed: Yes, this is the most important new test.**

The existing `dispatchNotification` pattern is used throughout the codebase (billing, capture failures, approaching limits). The admin key creation handler currently does NOT call `dispatchNotification`. The fix will add a `ctx.waitUntil(dispatchNotification(...))` call.

**Approach options:**

1. **String assertion on NOTIFICATION_TYPES** -- verify that `NOTIFICATION_TYPES` in `db.js` includes a new admin key creation type (e.g., `admin_key_created`). Trivial but shallow.

2. **Integration test asserting notification dispatch** -- After POST /v1/admin/keys succeeds, verify the notification was queued. This is harder because `dispatchNotification` is async (`ctx.waitUntil`) and depends on notification preferences, email queue, etc.

3. **Integration test asserting the notification type exists in DB schema** -- After the fix adds a new notification type, verify the column exists in the notification_preferences table.

**Recommended: Option 1 + a behavioral integration test.**

```js
// In admin-keys.test.js, within POST describe block:
it('response includes notification field confirming operator was notified', async () => {
  const res = await adminPost(VALID_CREATE_BODY);
  expect(res.status).toBe(201);
  // After fix, the response or logs should indicate notification dispatch.
  // Exact assertion depends on implementation -- if dispatchNotification is
  // called via ctx.waitUntil, we can't directly observe it from the response.
  // But we CAN verify the notification_sent table has an entry after the request.
});
```

**Important caveat:** The `dispatchNotification` function is fire-and-forget via `ctx.waitUntil`. In the miniflare test environment, `waitUntil` promises may or may not complete before the test checks. The existing test suite does NOT test notification dispatch for any endpoint -- it tests only the HTTP response shape.

**Pragmatic recommendation:** Add a **structural test** that the admin module imports/references `dispatchNotification`, plus a **NOTIFICATION_TYPES test** that the new type exists. Do NOT attempt to test the async notification delivery in the integration test -- that would be the first test of its kind in the suite and would require solving the `waitUntil` timing problem.

```js
// Structural: admin.js references dispatchNotification
import { readFileSync } from 'node:fs';

it('admin.js imports dispatchNotification', () => {
  // Verify the admin module has been wired up to send notifications
  const adminSource = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
  expect(adminSource).toContain('dispatchNotification');
});
```

**Effort: Medium.** One new file read + assertion. The NOTIFICATION_TYPES check may need a new test file or addition to an existing one. Total: 2-3 new test cases.

---

## Summary: Test Plan

| Fix | Test File | New Tests | Type | Effort |
|-----|-----------|-----------|------|--------|
| 1. Sign-in contrast | `ui-dashboard.test.js` | 1 regression guard | String assertion | Low |
| 2. Duplicate billing status | `ui-billing.test.js` | 1 regression guard | String assertion | Low |
| 3. Docs nav link | `ui-dashboard.test.js` | 1 presence check | String assertion | Trivial |
| 4. Admin notification | `admin-keys.test.js` | 2 structural checks | Source read + string | Medium |

**Total: 5 new test cases across 3 existing files. No new test files needed.**

---

## Risks

1. **Fix 4 notification test timing.** If the implementer tries to assert notification delivery (checking the notification_sent DB table after POST), they will hit `waitUntil` timing issues. The structural test approach avoids this. If true behavioral coverage is desired later, it should be a dedicated effort with a `waitUntil` flush helper.

2. **Fix 2 assertion fragility.** The duplicate-status test uses function boundary slicing (`indexOf('function buildRefreshRow')`). If the function is renamed or restructured, the test breaks. This is consistent with the existing test patterns (Partition E, G) but worth noting.

3. **Fix 4 NOTIFICATION_TYPES addition.** Adding a new notification type (`admin_key_created`) requires a DB migration (new column in notification_preferences). The test should verify the type exists in the `NOTIFICATION_TYPES` array, but the migration itself is outside test scope. If the implementer skips the migration, the notification will fail at runtime even though the structural test passes. The evolution log should flag this dependency.

4. **No visual regression testing.** Fix 1 (contrast) and Fix 3 (docs link) are best verified visually. The string assertions confirm the code changed correctly but cannot verify the rendered appearance. The project has Playwright E2E (`test:e2e`), but writing E2E tests for these would be overkill given the testing pyramid -- manual verification during PR review is sufficient for CSS and nav link additions.
