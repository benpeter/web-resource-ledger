# SEO Minion Review — Feature List and Competitor Comparison

**Verdict: ADVISE**

The plan is well-constructed and the execution prompts are specific. The structured data update is correct and the decision to defer template-level docs SEO is reasonable. Three items need attention before or during implementation.

---

## Issue 1: Compare page has no self-canonical — inconsistency creates soft duplicate risk (Medium)

The plan explicitly defers canonical tags on the docs site (decision: "defer all except self-canonical on the compare page itself") but then the Task 2 prompt omits any canonical tag from `compare.njk`. The frontmatter only has `title` and `description`.

The landing page links to `https://docs.webresourceledger.com/compare/` and the compare page itself has no canonical. If the docs framework generates both `/compare/` and `/compare/index.html` paths (common in Eleventy), or if the page is accessible with and without trailing slash, Google will see two URLs with identical content and no signal about which is preferred.

**Fix**: Confirm whether the `layouts/doc.njk` template injects a self-canonical automatically. If it does not (which the zero-result grep on `canonical` in the docs templates confirms), add a self-canonical to the `compare.njk` frontmatter, or add a note to the Task 2 prompt instructing the agent to check whether the layout handles it.

Check the doc layout:
```
site/layouts/doc.njk  (or wherever layouts live)
```

If no self-canonical is emitted, add to the compare.njk frontmatter:
```yaml
canonical: "https://docs.webresourceledger.com/compare/"
```
and pass it through to `<link rel="canonical">` in the layout for this page only.

---

## Issue 2: SoftwareApplication `offers` schema — `price: "0"` is correct but needs `priceValidUntil` or `availability` to be eligible for rich results (Low)

The plan adds:
```json
"offers": {
  "@type": "Offer",
  "price": "0",
  "priceCurrency": "EUR",
  "description": "Free tier: 200 captures/month"
}
```

For SoftwareApplication, Google's rich results spec requires `offers` to include `availability` when `price` is "0" to distinguish free from unavailable. Without it, the Offer is technically valid schema but may not produce a rich result. Also, `description` is not a standard property on `Offer` — use `name` instead (or omit; the featureList conveys the tier detail).

**Fix** (minimal, does not require schema refactoring):
```json
"offers": {
  "@type": "Offer",
  "price": "0",
  "priceCurrency": "EUR",
  "availability": "https://schema.org/InStock",
  "name": "Free tier: 200 captures/month"
}
```

---

## Issue 3: Cross-link from docs compare page back to landing is missing (Low)

The landing summary table links forward to docs (`/compare/`). The docs compare page has no reciprocal link back to `webresourceledger.com` for users who arrive via search on the docs page and want to sign up or see pricing. This is not a duplicate content concern — it is a user journey gap that also affects internal link equity between the two domains.

The plan's scope explicitly includes "links between the two" but only one direction is implemented (landing → docs). A brief sentence in the docs page lead paragraph or a CTA at the bottom of the compare page is sufficient: "Ready to try WRL? See pricing at webresourceledger.com."

This is editorial and can be added to the Task 2 prompt without changing the page structure.

---

## What is explicitly approved

- Deferring docs site template-level SEO (canonical, OG, BreadcrumbList, TechArticle) is correct. Doing it on one page without the others would be inconsistent and confusing to Google. The backlog item approach is right.
- The `featureList` expansion is accurate and well-matched to the visible page content. No schema drift.
- Adding `applicationSubCategory: "Web Evidence"` is valid and useful for entity disambiguation.
- The landing page canonical (`https://webresourceledger.com/`) already exists and is self-referencing. The new sections do not affect it.
- The landing and docs pages are on different origins (`webresourceledger.com` vs `docs.webresourceledger.com`), so there is no duplicate content relationship between the summary table and the full table. No canonical cross-linking needed between them.
- The `<meta name="description">` on the compare page frontmatter is concise, includes the core keyword ("feature comparison"), and is within the 150–160 character target. No changes needed.

---

## Summary of required actions before merge

| Issue | Severity | Action |
|---|---|---|
| Self-canonical on compare page | Medium | Verify doc.njk layout emits canonical; if not, add to frontmatter and thread it through |
| `offers` schema `availability` + `name` | Low | Update in Task 2 prompt (it modifies landing index.html structured data) |
| Reverse cross-link (docs → landing) | Low | Add one CTA sentence to Task 2 prompt |

None of these require blocking the task. The agent executing Task 2 can handle all three within the existing file set. Adding them to the Task 2 prompt before dispatch is sufficient.
