## Accessibility Review — seo-geo-pass

**Verdict: ADVISE**

---

- [accessibility]: Placing `<h3>` inside `<dt>` is invalid HTML — heading content is forbidden as a descendant of `<dt>` per the HTML living standard — and produces unreliable screen reader behavior.
  SCOPE: `landing/public/index.html` — FAQ section markup, Task 2
  CHANGE: Remove the `<h3>` wrapper from inside each `<dt>`. The `<dt>` element itself carries the question text directly as plain text. The `<dd>` carries the answer. Example corrected markup:

  ```html
  <dl class="faq__list">
    <div class="faq__item">
      <dt>What is Web Resource Ledger?</dt>
      <dd>Web Resource Ledger (WRL) is a web capture API that produces cryptographically signed evidence bundles...</dd>
    </div>
    <!-- ... -->
  </dl>
  ```

  If heading-level navigation to individual FAQ questions is a product requirement, replace the entire `<dl>` pattern with `<section>` + `<h3>` + `<p>` per item instead — this is fully valid and gives screen reader users both heading navigation and coherent semantics:

  ```html
  <section class="faq__item">
    <h3>What is Web Resource Ledger?</h3>
    <p>Web Resource Ledger (WRL) is a web capture API...</p>
  </section>
  ```

  Choose one pattern; do not combine them. The `<dl>` pattern (without `<h3>` inside `<dt>`) is preferred here because it correctly models term/definition semantics for FAQ content and produces clean screen reader announcements.

  WHY: The HTML living standard forbids heading content (`h1`–`h6`) as descendants of `<dt>` (spec: "flow content, but with no heading content"). Browsers handle this violation inconsistently in the accessibility tree: some strip the heading role (users navigating by headings miss the questions entirely), others surface both "heading level 3" and "definition term" as redundant sequential announcements. NVDA + Firefox tested against this pattern surfaces the `<dt>` role correctly but drops the heading-level semantics, breaking heading-based page navigation for screen reader users. This violates WCAG 2.2 SC 1.3.1 Info and Relationships (Level A) — the question/answer relationship and heading structure conveyed visually is not reliably programmatically determinable.
  TASK: Task 2 (Landing page SEO + structured data + FAQ)

---

### Heading Hierarchy Assessment

The proposed FAQ section heading structure is **sound** and requires no changes beyond the `<dt>` fix above:

- `<h2 id="faq-heading">Frequently Asked Questions</h2>` — correct; consistent with all other section headings (`#use-cases-heading`, `#features-heading`, `#pricing-heading`, etc.)
- Individual question headings at `<h3>` — correct level; consistent with existing h3 usage throughout the page
- No heading levels are skipped; the overall h1 > h2 > h3 hierarchy is preserved

### ARIA Attribute Assessment

No additional ARIA attributes are needed for either the `<dl>` or `<section>/<h3>` pattern. The `<section aria-labelledby="faq-heading">` wrapper already present in the plan is correct and sufficient. Do not add `role="list"` or similar — `<dl>` already carries its own implicit role.

### Screen Reader Compatibility

Both corrected patterns (plain-text `<dt>` or `<section>`+`<h3>`) are widely supported across NVDA + Firefox, JAWS + Chrome, and VoiceOver + Safari. The `<dl>` approach announces as "What is Web Resource Ledger, definition term" followed by the answer — clear and unambiguous. The `<section>`+`<h3>` approach supports heading-jump navigation (H key in NVDA/JAWS browse mode), which may be preferable for a long FAQ list.
