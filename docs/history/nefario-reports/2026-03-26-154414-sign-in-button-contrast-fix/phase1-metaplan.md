# Meta-Plan: Sign In Button Contrast Fix

## Task Summary

Fix the "Sign in" button in the landing page header, where dark gray text (#6e6a66) renders on a dark navy background (#2a3444) at ~2.5:1 contrast ratio, well below WCAG AA 4.5:1. The root cause is a CSS specificity conflict: `.site-header nav a` (0,1,1) overrides `.btn--primary` (0,1,0) for the `color` property. The fix must apply across all 7 landing pages sharing this header markup.

## Root Cause Analysis

The specificity chain:
- `landing/public/css/landing.css:167` -- `.site-header nav a` sets `color: var(--color-text-muted)` (specificity 0,1,1)
- `landing/public/css/design-system.css:83` -- `.btn--primary` sets `color: var(--color-primary-text)` (specificity 0,1,0)
- The nav link rule wins. The button text renders as `--color-text-muted` (#6e6a66) instead of `--color-primary-text` (#f8f8fa).

This is a single CSS specificity fix. The scope is narrow: one rule addition or adjustment in `landing.css`, affecting 7 HTML files that all share the same header structure and stylesheet.

## Planning Consultations

### Consultation 1: Accessibility Compliance Verification
- **Agent**: accessibility-minion
- **Planning question**: For the specificity fix (making `.site-header nav a.btn--primary` or similar override), what contrast ratio should we verify against? The button text (#f8f8fa) on primary background (#2a3444) should compute to ~11.5:1 -- is there any reason to test additional states (hover, focus-visible, high-contrast mode)? Are there other WCAG SC besides 1.4.3 we should check for this element?
- **Context to provide**: The color values from design-system.css (:root custom properties), the hover/focus-visible rules from landing.css:177-184, the button's role as a navigation link (`<a>` with `btn` classes)
- **Why this agent**: Ensures the fix achieves genuine WCAG compliance, not just "looks better." Can flag if the hover/focus states also have contrast issues we should fix while we're here.

### Consultation 2: CSS Fix Approach
- **Agent**: frontend-minion
- **Planning question**: What is the cleanest way to resolve this specificity conflict? Options include: (a) `.site-header nav a.btn--primary { color: var(--color-primary-text); }` in landing.css, (b) adding `.btn--primary` to the existing `.site-header nav a` rule with an exclusion, (c) reordering the CSS, (d) using `:where()` to lower the nav link specificity. Which approach follows the existing landing.css patterns and introduces the least risk of side effects?
- **Context to provide**: The full `.site-header nav a` rule block (landing.css:167-184), the `.btn--primary` rule (design-system.css:83-86), the `.btn--sm` rule (landing.css:93), and the HTML structure of the nav element
- **Why this agent**: CSS specificity decisions have cascading consequences. The frontend-minion knows which approach is idiomatic for this codebase and least likely to break other nav link styling.

### Cross-Cutting Checklist

- **Testing**: EXCLUDE. This is a CSS-only fix. No executable code changes. Visual verification is sufficient per project CLAUDE.local.md: "For UI-only changes (CSS, HTML, copy), visual verification is sufficient."
- **Security**: EXCLUDE. No attack surface, no auth changes, no user input handling. Pure visual styling fix.
- **Usability -- Strategy**: EXCLUDE with justification. This is a narrowly-scoped bug fix restoring intended behavior (button text matching its design-system-defined color). There is no journey design decision, cognitive load question, or simplification audit needed. The "what" and "why" are already determined by the existing design system.
- **Usability -- Design**: Include via accessibility-minion (Consultation 1 above). ux-design-minion is excluded because the visual design is already defined by the design system -- we are restoring it, not changing it.
- **Documentation**: EXCLUDE. A one-line CSS specificity fix does not warrant architecture docs or user-facing documentation updates. The fix will be documented in the commit message and evolution log (per project requirements).
- **Observability**: EXCLUDE. No runtime components, APIs, or services affected. Pure static CSS.

### Notable Exclusions

- **ux-strategy-minion**: Normally ALWAYS included, but this fix restores existing design-system-defined behavior -- there is no design decision to evaluate. The button should look like every other `.btn--primary` on the site.
- **test-minion**: Project instructions (CLAUDE.local.md) explicitly state visual verification is sufficient for CSS-only changes. No tests to write or run.
- **software-docs-minion**: Single-line CSS fix with no architectural, API, or documentation surface changes.

### Anticipated Approval Gates

None. This fix is:
- **Easy to reverse**: Single CSS rule addition, purely additive
- **Low blast radius**: 0 downstream tasks depend on it
- **Unambiguous**: The button should display its design-system colors; there is one correct answer

Per the gate classification matrix: easy to reverse + low blast radius = NO GATE.

### Rationale

Only two specialists are needed for planning because:
1. The root cause is already diagnosed (CSS specificity conflict with known selectors and values)
2. The fix scope is narrow (one rule in one CSS file, affecting only the visual rendering of one element type)
3. The accessibility-minion validates that the fix meets WCAG rather than just "looking right"
4. The frontend-minion ensures the CSS approach is clean and side-effect-free

Every other specialist domain is either not touched by this change or would add planning overhead without improving the plan for what is fundamentally a one-line CSS fix.

### Scope

**In scope**: Fix the specificity conflict so `.btn--primary` text color wins over `.site-header nav a` color for the Sign in button. Verify against WCAG AA 4.5:1. All 7 landing pages benefit automatically since they share the same CSS.

**Out of scope**: Redesigning the button, changing other nav link styles, modifying the design system tokens, addressing any other accessibility issues on the landing pages, running the test suite.

## External Skill Integration

### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | Infrastructure operations | NOT RELEVANT -- operational procedures for tenant management, secrets, deploys. No relation to CSS styling. |

### Precedence Decisions

No precedence conflicts. The only discovered skill (ops-runbook) is in a completely different domain from this task.
