# Lucy Review — Feature List & Competitor Comparison

## VERDICT: ADVISE

---

## FINDINGS

### [ADVISE] landing/public/index.html:288 — `aria-hidden="true"` on `<thead>` is incorrect

The comparison table `<thead>` carries `aria-hidden="true"`, which hides the column headers from assistive technology. This is problematic: the `data-label` attributes on `<td>` cells replicate column header text only in the mobile card-stack view (via `::before` pseudo-content, which is not announced by all screen readers). On desktop, column-header information is suppressed for AT users entirely.

The `aria-hidden` was likely added to suppress a redundancy concern in mobile view, but the correct solution is to let the table headers stand and allow the mobile card-stack's `data-label` pseudo-content serve as the mobile label — not to silence headers globally.

FIX: Remove `aria-hidden="true"` from `<thead>` in `landing/public/index.html` line 288. The `<caption class="sr-only">` already provides the table summary. Column headers can remain visible to AT — they do not cause duplication problems.

---

### [ADVISE] landing/public/index.html:106–110 — Nav links to external domains missing `rel="noopener noreferrer"`

`<a href="https://docs.webresourceledger.com">Docs</a>` (line 110) opens a cross-origin URL but has no `target="_blank"`, so `rel` is not strictly required. However, the review focus explicitly calls for auditing outbound links missing `rel="noopener noreferrer"` on `target="_blank"`. None of the nav links use `target="_blank"`, so this is a non-issue for the nav. Confirmed clean.

Footer links at lines 437–440 include external URLs (`https://docs.webresourceledger.com`, `https://api.webresourceledger.com/ui`, `https://github.com/benpeter/web-resource-ledger`) — none use `target="_blank"`, so no `rel` attribute is required. Confirmed clean.

No `target="_blank"` links found in any of the five changed files. This check PASSES.

---

### [NIT] landing/public/css/landing.css:533–573 — Mobile card-stack `thead` visually hidden but still technically in flow

The mobile card-stack hides `<thead>` using absolute positioning + clipping (`position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0)`). This is the standard `.sr-only` pattern repurposed — it keeps the content available to AT. The above `aria-hidden="true"` finding makes this moot: if `aria-hidden` is removed, the `<thead>` is correctly available to AT on all viewport sizes.

FIX: No CSS change required. The CSS is correct. The HTML attribute is the issue (see finding above).

---

### [NIT] site/content/compare.njk:17 — `aria-hidden="true"` on `<thead>` also present in docs comparison table

Same pattern as the landing page. The docs comparison table at `site/content/compare.njk` line 17 also uses `aria-hidden="true"` on `<thead>`. The docs table has 8 columns vs. the landing table's 4 — the information loss for AT users is greater here.

FIX: Remove `aria-hidden="true"` from `<thead>` in `site/content/compare.njk` line 17.

---

### [NIT] site/css/docs.css — No JavaScript added, design-system.css not modified

Confirmed. `docs.css` adds only comparison table styles scoped to `.comparison-table-wrapper` and `.comparison-table` classes. It does not touch `design-system.css`. All values use design system tokens (`var(--color-*)`, `var(--space-*)`, `var(--text-*)`, `var(--radius-*)`). One raw color value is used: `--color-text-muted-docs: #5a5650` and `--color-link-docs: #2f6a85` — these are intentional accessible overrides with rationale documented inline. Acceptable.

---

## COMPLIANCE CHECKS

| Check | Result |
|---|---|
| No JavaScript added | PASS — no `<script>` tags beyond existing structured data JSON-LD in `<head>`; no new JS files |
| design-system.css not modified | PASS — not in changed file list; `landing.css` opens with explicit note "do NOT modify design-system.css" |
| HTML semantics | PASS with the `aria-hidden` caveat above |
| CSS uses design system tokens | PASS — all new CSS rules reference `var(--*)` tokens |
| `target="_blank"` links have `rel="noopener noreferrer"` | PASS — no `target="_blank"` present in any changed file |
| No framework dependencies introduced | PASS |
| `CLAUDE.md` YAGNI / KISS | PASS — changes are additive, no speculative features |

---

## SUMMARY

Two files use `aria-hidden="true"` on `<thead>` elements — this suppresses column headers from screen readers while the mobile card-stack fallback (CSS `::before` pseudo-content) is not universally announced. Removing the attribute resolves both instances. All other checks pass.
