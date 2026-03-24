## Task: Remove inline padding overrides from billing view

Task 1 added a CSS rule for `.settings-section.card` that provides
`padding: var(--space-4) var(--space-5)`. The billing view has five instances
where it creates an inner wrapper div with inline padding. Now that the CSS
rule provides padding on the card itself, these are redundant.

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
3. All event handlers and dynamic behavior still work
4. Billing view renders identically (padding now comes from CSS)

When you finish your task, report:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
