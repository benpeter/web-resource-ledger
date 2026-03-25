# Decisions: UI/UX Fixes Batch (#213)

## 1. Contrast fix target: --color-text-muted, not .btn--github

**Chosen**: Darken `--color-text-muted` from #6e6a66 to #595550
**Over**: Changing `.btn--github` styles (which already pass at 10.5:1)
**Why**: All four specialists independently confirmed the GitHub button is fine. The actual WCAG AA failure is in muted text (tagline, divider, labels) — a single token change fixes all of them simultaneously. New ratio: 6.85:1 against #f7f6f5, 7.39:1 against #ffffff.

## 2. Ghost button border: defer

**Chosen**: Defer border contrast fix to separate issue
**Over**: Adding `--color-border-interactive` token now (frontend-minion suggestion)
**Why**: `--color-border` is used globally across cards, tables, inputs, dividers. Darkening it changes the entire UI's visual weight. Adding a targeted token increases surface area. The text contrast fix is the clear-cut WCAG violation; the border is a perceived-prominence concern. Deferring avoids scope creep in a "small fixes" batch.

## 3. Docs link placement: nav-actions (right) vs nav-links (left)

**Chosen**: `nav-actions` area, before username/sign-out
**Over**: Adding as 6th item in `nav-links` (frontend-minion's initial suggestion)
**Why**: ux-strategy-minion correctly identified that docs is a utility/support action, not a primary workflow destination. Adding to nav-links inflates the primary nav to 6 items for session users, increasing cognitive load. nav-actions placement matches the mental model of help/utility controls near account actions.

## 4. Notification approach: Coralogix alert vs email pipeline

**Chosen**: Coralogix alert rule on existing `admin.key_create` log event (zero code changes)
**Over**: Adding `dispatchNotification()` call with new email template via Resend
**Why**: The log event already contains all needed fields and flows to Coralogix. Building an email pipeline for operator notifications would require ~40 lines of new code, a new template, and would misuse the tenant-facing email infrastructure. YAGNI — the alert rule covers the requirement with zero code.

## 5. Screen reader text: sr-only child span vs aria-label

**Chosen**: `.sr-only` span with "(opens in new tab)" as child of `<a>` element
**Over**: `aria-label="Documentation (opens in new tab)"` on the link
**Why**: ux-strategy-minion advised the span must be a child (not sibling) of the anchor for focus announcement. Using visible "Docs" text plus sr-only span is more robust than aria-label, which would override the visible text for screen readers and create a mismatch.

## 6. External link guard in updateNavCurrent

**Chosen**: Add `startsWith('http')` guard in nav highlight logic
**Over**: Using a different CSS class for the docs link to exclude it from query selector
**Why**: security-minion identified that `updateNavCurrent()` strips leading `#` from all `.nav-link` hrefs. The external URL would be harmlessly ignored, but the guard makes the intent explicit and prevents future bugs if the iterator evolves. One-line fix.
