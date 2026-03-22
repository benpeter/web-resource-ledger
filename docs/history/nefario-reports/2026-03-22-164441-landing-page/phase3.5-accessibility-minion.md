## Accessibility Review — WRL Landing Page

**Verdict: ADVISE**

The plan's accessibility foundations are solid (heading hierarchy, landmark structure, skip link presence, `aria-labelledby`, motion preferences, touch target baseline). Two issues need to be addressed in Task 1's implementation to reach WCAG 2.2 AA conformance. Neither is a reason to block the plan structure, but both must be explicitly added to Task 1's requirements.

---

### Issue 1: Skip link is permanently hidden — WCAG 2.4.1 Bypass Blocks (Level A)

The plan specifies:
```html
<a class="sr-only skip-link" href="#content">Skip to content</a>
```

The design system's `.sr-only` clips the element to a 1x1px box at all times, including when focused. A skip link that is never visually revealed on focus is not a skip link — it is absent from the visual interface entirely. WCAG 2.4.1 requires a mechanism to bypass repeating content. Screen reader users can use it from the accessibility tree, but keyboard-only users who are not using a screen reader receive no benefit.

**Required fix in Task 1:** Add a `:focus` (or `:focus-visible`) override in landing.css that reveals the skip link when focused:

```css
.skip-link:focus,
.skip-link:focus-visible {
  position: fixed;
  top: var(--space-4);
  left: var(--space-4);
  z-index: 9999;
  width: auto;
  height: auto;
  padding: var(--space-2) var(--space-4);
  clip: auto;
  overflow: visible;
  white-space: normal;
  background: var(--color-surface);
  color: var(--color-primary);
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-md);
  font-weight: var(--weight-medium);
}
```

Add this requirement to Task 1's success criteria: "Skip link is visually revealed on keyboard focus."

---

### Issue 2: Focus indicator invisible on dark surfaces — WCAG 2.4.13 Focus Appearance (Level AA) and 2.4.7 Focus Visible (Level AA)

The design system defines:
```css
.btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
```

`--color-primary` is #2a3444. The hero section and footer both use #2a3444 as their background. An outline of the same color as the background is invisible — zero contrast. Any button that appears on the hero (the two CTAs) or footer will have an invisible focus ring.

WCAG 2.4.13 requires focus indicators to have a minimum 3:1 contrast ratio against both the focused component and the adjacent color. WCAG 2.4.7 requires focus to be visible at all.

**Required fix in Task 1:** In landing.css, override focus-visible for buttons on dark surfaces:

```css
/* Dark surface sections */
.hero .btn:focus-visible,
footer .btn:focus-visible {
  outline-color: var(--color-primary-text); /* #f8f8fa -- high contrast on dark bg */
  outline-offset: 3px;
}
```

Also address plain `<a>` elements in the nav and footer, which inherit browser default focus styles but may be suppressed. Ensure nav links and footer links have an explicit focus-visible style that is visible on whatever surface they sit on.

Specifically: the sticky header on a white/light background can use `--color-primary` focus outlines, but the footer links on the dark background need `--color-primary-text` or equivalent.

Add to Task 1's success criteria: "All interactive elements have visible focus indicators that meet 3:1 contrast against their immediate background."

---

### Issue 3: Nav and footer link touch targets — WCAG 2.5.8 Target Size (Level AA)

The plan correctly notes that `.btn` meets 44x44px minimum. However, the nav anchor links ("How It Works", "Use Cases", "Pricing", "Docs") and footer links (Docs, API Reference, GitHub, Terms, Content Policy) are plain `<a>` elements, not buttons. Their default rendered touch target is typically the text height alone (16–18px).

WCAG 2.5.8 requires a minimum 24x24 CSS pixel target size. 44x44 is the WCAG 2.1 mobile guidance and still best practice. These links need sufficient padding to meet the minimum.

**Required addition to Task 1 prompt:** Instruct frontend-minion to apply minimum `padding-block: 0.5rem` (8px top+bottom) and `padding-inline: 0.5rem` to nav and footer links so the tap/click target extends beyond the text bounds. Combined with typical line height this reaches the 24px threshold. For desktop nav, this also improves pointer usability.

---

### What is correct — do not change

- `@media (prefers-reduced-motion: no-preference)` wrapping for `scroll-behavior: smooth` — correct
- `scroll-margin-top` on sections to clear the sticky header — correct, needed for anchor navigation
- Single `<h1>`, sequential `<h2>`/`<h3>`, no skipped levels — correct
- `aria-labelledby` on each section — correct
- `<ol>` for ordered steps with `aria-hidden="true"` on decorative step numbers — correct
- Nav elements with distinct `aria-label` values — correct
- Logo as decorative (`aria-hidden="true"`, `alt=""`) — correct for a logo adjacent to text wordmark; confirm wordmark text is in the DOM, not just in the SVG
- `lang="en"` on `<html>` — correct (satisfies WCAG 3.1.1)
- Lighthouse accessibility >= 90 target — achievable with the fixes above
- Color contrast on light sections: `--color-text` (#1e2a36) on white passes well above 4.5:1; `--color-text-muted` (#6e6a66) on white is approximately 5:1, passes AA

---

### Summary of required additions to Task 1

1. Add skip link `:focus` reveal styles to landing.css
2. Override focus indicator color for buttons and links on dark (hero/footer) backgrounds
3. Add explicit touch-target padding to nav and footer `<a>` elements
4. Add to success criteria: "Skip link visually revealed on keyboard focus" and "All interactive elements have visible focus indicators on their respective backgrounds"
