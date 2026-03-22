# Accessibility Review -- phase3.5

**Verdict: ADVISE**

The plan demonstrates solid accessibility intent: semantic HTML landmarks are specified, skip-to-content is baked into Task 1, heading hierarchy is enforced, `aria-label` on nav is explicit, and there is a dedicated Task 5 audit pass. The known `--color-text-muted` contrast fix is correctly handled with a docs-local override. Three gaps remain that should be addressed before or during execution.

---

- [accessibility]: The `.badge--skip` class (used for OPTIONS method badge and auth indicators) applies `--color-text-muted` (#6e6a66) on `--color-surface-muted` (#f3f2f0) at a contrast ratio of approximately 3.3:1, failing WCAG 2.2 SC 1.4.3 (AA) for normal-weight text.
  SCOPE: `site/css/docs.css` -- `.method-badge` variant for OPTIONS/muted; any badge using `.badge--skip` from the design system
  CHANGE: Define a `--color-text-muted-docs` override (the plan already defines #5a5650 for body text) and apply it to the muted badge text as well. Alternatively, use `--color-text` (#1e2a36) for badge text in the muted variant -- it easily passes. Add this to the Task 5 audit checklist explicitly: "verify `.badge--skip` and OPTIONS method badge contrast."
  WHY: The plan documents the muted text contrast fix for body copy but does not extend it to badge components that use the same failing token. Task 5's audit checklist (line 496-498) checks method badges generally but does not call out the muted variant specifically. This will be missed.
  TASK: Task 1 (CSS definition), Task 5 (audit verification)

- [accessibility]: The link color `--color-accent` (#3d7c9a) on `--color-bg` (#f7f6f5) achieves approximately 4.1:1 contrast ratio, which fails WCAG 2.2 SC 1.4.3 (AA) requirement of 4.5:1 for normal-weight body text links.
  SCOPE: `site/css/docs.css` -- `.docs-prose a` and sidebar link states; any inline link rendered against the page background
  CHANGE: In `docs.css`, override the link color for prose content: define `--color-link-docs: #2f6a85` (darkening the accent by ~15%) which achieves approximately 5.2:1 on #f7f6f5. Task 5 must verify this explicitly. Add "link colors on --color-bg" to the Task 5 audit checklist -- the current checklist (line 498) says "Verify link colors pass WCAG AA on both --color-bg and --color-surface" but does not specify what value to use, so frontend-minion may check the design system token and incorrectly conclude it passes without measuring.
  WHY: The plan's Task 5 success criteria require all color combinations to meet WCAG AA, and this combination does not. The design system token is the wrong starting value for docs body text contrast. The plan does not flag this as a known issue (unlike the `--color-text-muted` issue which is explicitly called out), creating a risk that Task 5 will validate the wrong token value.
  TASK: Task 1 (CSS foundation -- link color should be set correctly from the start), Task 5 (audit)

- [accessibility]: The copy-to-clipboard button added in Task 5 announces no success feedback to screen reader users. The button has `aria-label="Copy code to clipboard"` but the plan does not specify how state change ("Copied!") is communicated after activation.
  SCOPE: Task 5 -- the ~15-line clipboard JS snippet in `site/_includes/layouts/base.njk`
  CHANGE: After successful copy, either (a) temporarily update the button's `aria-label` to "Copied to clipboard" and restore it after 2 seconds, or (b) inject a visually hidden `aria-live="polite"` region and set its text to "Copied" on success. Option (a) is simpler for a 15-line script. Add this requirement to the Task 5 prompt: "After clipboard write resolves, update aria-label to 'Copied to clipboard' for 2000ms, then restore original label."
  WHY: WCAG 2.2 SC 4.1.3 (AA) requires status messages to be programmatically determinable without receiving focus. A screen reader user activating the copy button receives no confirmation the action succeeded. The current prompt specifies `aria-label` on the button but is silent on state feedback, which frontend-minion will likely omit.
  TASK: Task 5

---

None of these are blockers -- the plan can proceed. The contrast issues should be fixed in Task 1 with the correct token values rather than discovered and patched in Task 5.
