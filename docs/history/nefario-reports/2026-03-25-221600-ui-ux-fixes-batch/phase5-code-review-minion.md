# Code Review: ui-ux-fixes-batch (commits 99ad6cb, 93f2ff1)

**Verdict: ADVISE**

The changes are correct and safe to merge. Three findings require attention before
the next phase touches these files. None block this PR.

---

## What Was Done Well

- Contrast improvement is real and meaningful. `#6e6a66` on `#f7f6f5` was 4.97:1
  (barely AA). `#595550` on `#f7f6f5` is 6.85:1 -- well into AA territory and
  approaching AAA (7:1) for normal text. The change is justified and correct.
- The docs link is built entirely with DOM APIs and a hardcoded HTTPS URL. No
  `innerHTML`, no user-controlled input anywhere near `href`. No XSS vector.
- `rel="noopener noreferrer"` is present alongside `target="_blank"`. This matches
  the pattern used by every other external link in the codebase (`ui-detail.js`,
  `ui-tos.js`). One consistency note: `ui-detail.js:313` uses only `noopener`
  without `noreferrer` -- the new link is actually more correct than that outlier.
- `aria-hidden="true"` on the SVG and the `sr-only` span with "(opens in new tab)"
  is the correct WCAG 2.1 pattern for icon-decorated external links. The screen
  reader text placement (after the link text, inside the anchor) is right.
- The `updateNavCurrent` guard (`if (linkPath.startsWith('http')) continue`) is
  minimal, correctly placed, and includes a comment explaining why. No regression
  risk to the hash router.
- The billing dedup removal is clean. The `buildRefreshRow` function previously
  emitted a "Status: X" text node and then the payment section (`buildPaymentSection`)
  would show the same status via `billingStatusLabel`. Removing the redundant label
  from the refresh row is correct.
- The Coralogix alert payload follows the exact JSON structure and enum naming of
  all nine existing alerts. No format deviation.
- `OPERATOR_EMAIL_PLACEHOLDER` is substituted at runtime via `sed` in `upsert_alert`
  (line 466). The new alert uses the same placeholder pattern as all existing alerts.

---

## Findings

### ADVISE-1: `sr-only` is duplicated across `design-system.js/css` and `ui-css.js`

`.sr-only` was already defined in `src/design-system.css` (line 190) and its JS
mirror `src/design-system.js` (line 194), before this commit. The new commit adds
an identical definition to `src/ui/ui-css.js` (line 95-106).

Both stylesheets are always loaded together in the same `<style>` block:

```js
// ui-shell.js lines 26-27
${DESIGN_SYSTEM_CSS}
${UI_CSS}
```

The duplicate is harmless -- the second rule simply overwrites the first -- but it
creates a maintenance hazard: if `sr-only` is ever updated (e.g., to add
`clip-path: inset(50%)` per modern best practice), it must be updated in two places.

The correct fix is to remove `.sr-only` from `ui-css.js` since it is already
authoritative in `design-system.css`. The test that asserts `UI_CSS` contains
`.sr-only` should then be updated to assert `DESIGN_SYSTEM_CSS` contains it
instead.

**Severity: Suggestion** -- harmless today, maintenance debt tomorrow.

---

### ADVISE-2: `email-tokens.js` was not updated to match the new `--color-text-muted` value

`src/email/email-tokens.js:15` still hardcodes `textMuted: '#6e6a66'`. The file
header explicitly says "All values extracted from src/design-system.css -- do not
use CSS var() here" -- which means this file is a deliberate duplicate that must
be kept in sync manually.

The design token commit updated `design-system.css` and `design-system.js` but
missed `email-tokens.js`. Transactional emails will render muted text at the old,
lower-contrast value.

The test suite asserts `UI_CSS.not.toContain('#6e6a66')` but does not check
`email-tokens.js`. This gap is how the miss slipped through.

**File:** `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/curious-singing-ullman/src/email/email-tokens.js` line 15

**Fix:**
```js
textMuted: '#595550',
```

**Severity: Important** -- email rendering is a separate delivery channel with
real users. The contrast regression from `#6e6a66` to `#595550` exists in email
until this is fixed. Not a P0 (the old value still met AA), but it should be
corrected before the token value is considered fully deployed.

---

### ADVISE-3: Test I1 uses a 600-character slice that undershoots the full function (non-critical)

`test/ui-billing.test.js` test I1 extracts `buildRefreshRow` from the source and
asserts the removed status label is not present:

```js
const fnBody = BILLING_JS.slice(fnStart, fnStart + 600);
```

The actual `buildRefreshRow` function body is 765 characters. The 600-char slice
does happen to contain the full function body including `return row;` and closes
before the next function, so the assertion is not currently wrong. However, if the
function grows (e.g., a future fix adds another element), the slice will silently
truncate to mid-function. A future contributor could add the status label back past
the 600-char mark and this test would not catch it.

Correct approach: slice from `fnStart` to `fnStart + fnBody.indexOf('\nfunction ', 1)`
to cover exactly one function, or simply search the entire file while excluding
false matches from function name and comment text.

**Severity: Suggestion** -- the test passes correctly today and the function is
unlikely to grow, but the magic constant is fragile.

---

### ADVISE-4: Test "DESIGN_SYSTEM_CSS and AUTH_JS agree on --color-text-muted" is a non-test

The test at `test/ui-dashboard.test.js` line 300:

```js
it('DESIGN_SYSTEM_CSS and AUTH_JS agree on --color-text-muted value', () => {
  expect(DESIGN_SYSTEM_CSS).toContain('#595550');
  expect(AUTH_JS).not.toContain('#6e6a66');
});
```

`AUTH_JS` does not and has never contained either color value. The `AUTH_JS.not.toContain`
assertion is trivially true regardless of the state of the design system -- it would
pass even if the token were rolled back. It reads as a meaningful cross-file sync check
but provides no actual coverage.

The first assertion (`DESIGN_SYSTEM_CSS` contains `#595550`) is valid. The second
could be replaced with a check on `email-tokens.js` or simply removed.

**Severity: Suggestion** -- does not produce false positives, but misleads future
maintainers about what is actually being verified.

---

### ADVISE-5: alerts.md claims notification includes specific log fields -- JSON payload does not configure this

The alerts.md entry states:

> **Notification group fields:** `tenantId`, `name`, `scopes`, `keyHashPrefix` --
> included in the alert notification body so the operator can confirm the key
> matches expected provisioning without logging into Coralogix.

The Coralogix alert JSON payload in `provision-alerts.sh` has no field-level
notification configuration. No `notificationGroupByFields`, no payload filter, and
no `groupBy` structure exists in any of the ten alerts. The notification will
contain whatever Coralogix includes by default in its email body for a
`LOGS_THRESHOLD` alert, which typically includes the triggering log line.

This may be accurate in practice if Coralogix's default email format includes the
full log payload, which would contain those fields. But the documentation is stated
as a guarantee ("included in the alert notification body") when it is actually
dependent on Coralogix's default behavior.

The runbook (`docs/operations/runbooks/new-api-key-created.md`) handles this
correctly -- it tells the operator to query Coralogix directly for those fields.
The documentation in `alerts.md` should be softened to match: "the triggering log
line typically includes `tenantId`, `name`, `scopes`, and `keyHashPrefix`" rather
than stating it as a configured guarantee.

**Severity: Suggestion** -- documentation accuracy issue, not a runtime problem.

---

## Summary Table

| # | File | Severity | Description |
|---|------|----------|-------------|
| 1 | `src/ui/ui-css.js` | Suggestion | `.sr-only` duplicates definition already in `design-system.css` |
| 2 | `src/email/email-tokens.js` | Important | `textMuted` still `#6e6a66`, not updated with token change |
| 3 | `test/ui-billing.test.js` | Suggestion | 600-char slice undershoots function length by 165 chars |
| 4 | `test/ui-dashboard.test.js` | Suggestion | `AUTH_JS.not.toContain('#6e6a66')` is trivially true, not meaningful |
| 5 | `docs/operations/alerts.md` | Suggestion | Notification fields claim overstates configuration guarantee |

The single item worth fixing before closing this batch is **ADVISE-2**
(`email-tokens.js`). Everything else can travel in a follow-up or be accepted as
known tech debt.
