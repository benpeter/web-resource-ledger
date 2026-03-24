# Delegation Plan — Settings & Schedules UI Polish

**Team name**: settings-schedules-polish
**Description**: CSS polish pass to bring settings and schedules views to visual parity with the captures and billing views. Pure CSS additions in `ui-css.js`, plus one cleanup in `ui-billing.js`.

---

## Task 1: Add missing CSS rules and fix existing rules for settings and schedules views

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task: CSS polish for settings and schedules views

    You are working on the WRL web UI. The settings view and schedules form
    have significant CSS gaps -- many class names used in the JS DOM
    construction have no corresponding CSS rules, so elements render with
    browser defaults. Your job is to add the missing CSS rules to
    `src/ui/ui-css.js` so these views match the visual quality of the
    captures and billing views.

    ### Context

    The UI is vanilla JS with CSS defined as a template literal in
    `src/ui/ui-css.js`. Design tokens come from `src/design-system.css`.
    The settings view is built in `src/ui/ui-settings.js` and the schedules
    view in `src/ui/ui-schedules.js`. The billing view
    (`src/ui/ui-billing.js`) is the most recently built view and represents
    the current visual standard.

    ### File to modify

    **`src/ui/ui-css.js`** — this is the ONLY file you modify for CSS changes.

    ### Changes required (in order of where they go in the file)

    #### A. Fix `.settings-section-title` → `.settings-section-heading`

    The class `.settings-section-title` (around line 636-643) is dead CSS --
    it is never used by any JS file. The actual class used everywhere is
    `.settings-section-heading`. Replace the `.settings-section-title` rule
    with a `.settings-section-heading` rule:

    ```css
    .settings-section-heading {
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-4);
    }
    ```

    This matches the `.section h2` pattern from the design system. Note the
    `margin: 0 0 var(--space-4)` — the original `.settings-section-title`
    had `margin-bottom: var(--space-4)` but the heading element may have
    browser-default top margin, so reset it explicitly.

    #### B. Fix `.settings-info-grid` — add `display: grid`

    The existing rule (around line 645-647) only sets
    `grid-template-columns: 8rem 1fr` without `display: grid`, making it
    a no-op. Fix it to:

    ```css
    .settings-info-grid {
      display: grid;
      grid-template-columns: 8rem 1fr;
      gap: var(--space-2) var(--space-4);
    }
    ```

    #### C. Add card padding rules

    Add padding rules for card sections. Both settings and schedules use
    cards without inner padding, so content sits flush against card borders.
    Add these after the `.settings-section` rule block:

    ```css
    .settings-section.card {
      padding: var(--space-4) var(--space-5);
    }

    .schedule-form-section.card {
      padding: var(--space-4) var(--space-5);
    }
    ```

    #### D. Add missing settings element rules

    Add these rules in the "Settings view" section of the CSS. These provide
    layout for elements that currently have no CSS at all:

    ```css
    /* Account info grid children */
    .settings-info-row {
      display: contents;
    }

    .settings-info-label {
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .settings-info-value {
      font-size: var(--text-base);
      color: var(--color-text);
    }

    /* API key rows */
    .settings-key-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) 0;
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .settings-key-row:last-child {
      border-bottom: none;
    }

    .settings-key-info {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
    }

    .settings-key-name {
      font-size: var(--text-base);
      font-weight: var(--weight-medium);
      color: var(--color-text);
    }

    .settings-key-meta {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    .settings-key-scopes {
      display: flex;
      gap: var(--space-1);
      flex-wrap: wrap;
    }

    .settings-key-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    .settings-keys-empty {
      padding: var(--space-4) 0;
      font-size: var(--text-base);
      color: var(--color-text-muted);
    }

    .settings-keys-limit {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    /* Create key section */
    .settings-create-heading {
      font-size: var(--text-base);
      font-weight: var(--weight-medium);
      color: var(--color-text);
      margin-bottom: var(--space-2);
    }

    .settings-create-row {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .settings-new-key-display {
      margin-top: var(--space-4);
      padding: var(--space-4);
      background: var(--color-surface-muted);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }

    .settings-scope-item {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--text-base);
      cursor: pointer;
    }
    ```

    #### E. Add mobile breakpoints for settings

    Add a `@media (max-width: 640px)` block for settings. Place it after
    the settings CSS rules, before the schedules section. Keep it consistent
    with the existing mobile breakpoints for captures and schedules:

    ```css
    @media (max-width: 640px) {
      .settings-info-grid {
        grid-template-columns: 1fr;
      }

      .settings-key-row {
        flex-direction: column;
      }

      .settings-key-actions {
        align-self: flex-start;
      }
    }
    ```

    ### What NOT to do

    - Do NOT modify any JS files
    - Do NOT add new design tokens
    - Do NOT change existing captures, billing, or detail view CSS
    - Do NOT add vendor prefixes beyond what already exists in the file
    - Place new rules logically near existing related rules, not at the
      very end of the file

    ### Success criteria

    1. Every class name used in `ui-settings.js` has a corresponding CSS
       rule in `ui-css.js`
    2. The dead `.settings-section-title` rule is replaced with
       `.settings-section-heading`
    3. `.settings-info-grid` renders as a 2-column grid (has `display: grid`)
    4. Card sections (`.settings-section.card`, `.schedule-form-section.card`)
       have consistent inner padding
    5. Settings view has mobile breakpoints at 640px matching the captures
       and schedules patterns
    6. No CSS regressions in other views

- **Deliverables**: Updated `src/ui/ui-css.js` with all missing CSS rules, fixed grid, card padding, section headings, and mobile breakpoints
- **Success criteria**: All settings/schedules DOM elements have CSS rules; visual consistency with captures/billing views; mobile layout stacks properly at 640px


## Task 2: Remove inline padding from billing view

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Remove inline padding overrides from billing view

    You are working on the WRL web UI. Task 1 added a CSS rule for
    `.settings-section.card` that provides `padding: var(--space-4) var(--space-5)`.
    The billing view (`src/ui/ui-billing.js`) has five instances where it
    creates an inner `<div>` and sets `inner.style.padding = 'var(--space-4) var(--space-5)'`
    inline. Now that the CSS rule provides this padding on the card itself,
    these inner padding divs are redundant and the inline styles cause
    double-padding.

    ### File to modify

    **`src/ui/ui-billing.js`** — this is the ONLY file you modify.

    ### Changes required

    Find all instances of this pattern in the billing section builders:

    ```js
    var inner = document.createElement('div');
    inner.style.padding = 'var(--space-4) var(--space-5)';
    ```

    There are five instances in these functions:
    - `buildPeriodSummary`
    - `buildThresholdSection`
    - `buildPricingSection`
    - `buildEidasSection`
    - `buildPaymentSection`

    For each, remove the `inner.style.padding = ...` line. Keep the `inner`
    div itself — it serves as a content wrapper that the section builders
    append children to before appending `inner` to the section.

    Actually, on reflection: since the `.settings-section.card` now has
    padding, and the `inner` div is just a wrapper with no other styles,
    you should remove the `inner` div entirely and append children directly
    to the `section` element. This eliminates an unnecessary DOM layer.

    For each of the five builder functions:
    1. Remove the `var inner = document.createElement('div');` line
    2. Remove the `inner.style.padding = ...` line
    3. Replace all `inner.appendChild(...)` calls with `section.appendChild(...)`
    4. Remove the final `section.appendChild(inner)` line

    ### What NOT to do

    - Do NOT modify any other JS files
    - Do NOT change any CSS
    - Do NOT change the billing logic, event handlers, or API calls
    - Do NOT change the class names or aria attributes on elements

    ### Success criteria

    1. No `inner.style.padding` lines remain in `ui-billing.js`
    2. No unnecessary inner wrapper divs in the five section builders
    3. Billing view renders identically (padding now comes from CSS)
    4. All event handlers and dynamic behavior still work

- **Deliverables**: Updated `src/ui/ui-billing.js` with inner wrapper divs removed from five section builder functions
- **Success criteria**: No inline padding styles; no unnecessary wrapper divs; billing renders identically; all interactivity preserved

---

## Cross-Cutting Coverage

- **Testing**: Not included. This is a pure CSS visual polish task. The project has no visual regression testing infrastructure. The existing JS unit tests (via `evalFromSource` pattern) test logic, not DOM styling. CSS changes cannot break these tests. Phase 6 post-execution will run the existing test suite to confirm no regressions.
- **Security**: Not included. No new attack surface, no auth changes, no user input handling changes. Only CSS additions and DOM simplification.
- **Usability -- Strategy**: Not included for execution. This task IS the usability fix — it aligns settings/schedules views to the established visual patterns. The scope is purely visual alignment, not new features or changed flows. ux-strategy-minion was consulted in planning phase (determined the scope was correct).
- **Usability -- Design**: Not included. No new UI components or interaction patterns. All CSS additions follow the existing design system tokens and patterns already established by the captures and billing views.
- **Documentation**: Not included. CSS polish does not change any API surface, architecture, or user-facing behavior. No docs update needed.
- **Observability**: Not included. No runtime components, no APIs, no background processes affected.

## Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: None.
  - ux-design-minion: Not selected — no new UI components or interaction patterns; changes align to existing patterns
  - accessibility-minion: Not selected — no HTML structure changes; CSS additions use existing semantic patterns (grid, flex) that do not affect accessibility tree
  - sitespeed-minion: Not selected — CSS additions are trivial in size; no new assets, no loading strategy changes
  - observability-minion: Not selected — no runtime components involved
  - user-docs-minion: Not selected — no user-visible behavior changes

## Decisions

- **Consolidation of 7 tasks into 2**
  Chosen: Two execution tasks (CSS additions in one batch, billing cleanup as follow-up)
  Over: Seven separate tasks as proposed by frontend-minion (one per CSS concern)
  Why: All CSS changes target the same file (`ui-css.js`) with no conflicting concerns. Splitting into 7 tasks creates unnecessary overhead with zero parallelism benefit. The billing cleanup is a separate file and depends on Task 1, so it remains a distinct task.

- **Remove billing inner wrapper divs entirely vs. just removing inline padding**
  Chosen: Remove the inner `<div>` wrapper entirely from billing section builders
  Over: Only removing the `inner.style.padding` line while keeping the wrapper div
  Why: Once the card has CSS padding, the inner div serves no purpose — it has no class, no other styles, and no semantic role. Removing it simplifies the DOM and eliminates a layer that could confuse future maintainers.

- **Exclude formatPeriod investigation**
  Chosen: Exclude from this plan
  Over: Including it as a quick-fix task alongside CSS work
  Why: Verified that `formatPeriod()` is defined in `ui-settings.js` which is concatenated before `ui-billing.js` in `ui-shell.js` (line 54 vs line 57). The function is always available when billing calls it. There is no runtime bug. The specialist flagged this as a risk based on the possibility of load-order changes, but the current architecture (string concatenation in shell) makes the order deterministic.

## Risks and Mitigations

1. **Double padding on billing cards after Task 1, before Task 2**: Between Task 1 and Task 2, billing card sections will have both CSS padding (from `.settings-section.card`) and inner div padding (from inline styles). The inline style wins due to CSS specificity (it applies to the inner div, not the card), so the visual result is the inner div has padding inside an already-padded card. Task 2 must run immediately after Task 1. Mitigation: Task 2 is blocked by Task 1 and should execute sequentially.

2. **No visual regression testing**: The project lacks automated visual testing. CSS changes could introduce subtle visual issues. Mitigation: The CSS additions use only existing design system tokens and follow patterns already established in the codebase. Manual verification is recommended after execution.

## Execution Order

```
Task 1: CSS rules (ui-css.js)          -- no dependencies, runs first
  |
  v
Task 2: Billing cleanup (ui-billing.js) -- blocked by Task 1
```

No approval gates. Both tasks are LOW blast radius (additive CSS, single-file cleanup) and EASY to reverse (revert the CSS additions or re-add the inner divs).

## Verification Steps

After all tasks complete:
1. Run existing test suite to confirm no regressions
2. Verify that `ui-css.js` contains no `.settings-section-title` rule (dead CSS removed)
3. Verify that `ui-css.js` `.settings-info-grid` rule includes `display: grid`
4. Verify that `ui-billing.js` contains no `inner.style.padding` assignments
5. Grep for all class names used in `ui-settings.js` and confirm each has a CSS rule in `ui-css.js`
