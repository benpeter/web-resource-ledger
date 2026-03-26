## Domain Plan Contribution: software-docs-minion

### Recommendations

**Single page, not two.** A "Features" page separate from "Comparison" creates a maintenance burden and forces the reader to cross-reference. The comparison table already implies feature coverage. One page titled **"Compare"** (nav label) / **"How WRL Compares"** (H1) keeps it tight. The table IS the feature list -- each row is a capability, each column is a product.

**Nav position: between Architecture and Security & Compliance (position 11).** Reasoning:

- The first 9 items (Getting Started through API Reference) are task-oriented: they help developers integrate. A comparison page does not belong in this sequence -- it interrupts the "do things" flow.
- Architecture (position 10) shifts the docs from "how to use" to "how it works / why trust it." A comparison page fits naturally after Architecture and before Security & Compliance, because all three serve the **evaluator** persona rather than the integrator persona.
- Placing it at the very top (position 2 or 3) is tempting for marketing but wrong for docs. Developers who land on docs.webresourceledger.com want to integrate first. Evaluators who want the comparison will scan the nav -- position 11 is visible without scrolling in a 17-item nav.

**URL: `/compare/`** -- short, linkable, unambiguous. Not `/comparison/` (longer for no reason) or `/vs/` (too cute).

**Title/label guidance:**
- Nav label: `Compare` (one word, scans fast in sidebar)
- Page H1: `How WRL Compares` (gives context when landing from search)
- `<title>` / description: `How WRL compares to Wayback Machine, Archive.today, Conifer, and other web archiving tools` (SEO-facing, names competitors for search intent)

**Content structure for the page itself:**

1. **Lead paragraph** (2-3 sentences) -- what this page covers, who it is for, when it was last verified
2. **Comparison table** -- the full matrix. Keep column headers short. Use checkmarks / x / partial indicators, not prose. Link footnote numbers to the notes section.
3. **Notes by competitor** -- one H2 per competitor with 3-5 sentences explaining nuances the table cannot capture (e.g., "Archive.today captures are not downloadable as WARC/WACZ" or "Conifer requires self-hosting for API access"). Each note should link to the competitor's website or docs for verifiability.
4. **Methodology note** -- brief footer explaining how data was gathered and when it was last checked. This is critical for credibility: "All claims verified against public documentation and direct testing as of [date]. If something has changed, open an issue."

**Do NOT include:**
- Pricing comparison (changes constantly, becomes stale immediately, and WRL pricing is not yet public)
- Subjective quality judgments ("better," "best") -- let the feature matrix speak
- Screenshots of competitor UIs (copyright concerns, staleness)

### Proposed Tasks

1. **Create `site/content/compare.md`** with frontmatter (`layout: layouts/doc.njk`, title, description) and the full content structure described above. The comparison data itself should come from whatever research the content-producing agent has done.

2. **Add nav entry in `site/_data/site.js`** at position 11 (after Architecture, before Security & Compliance):
   ```js
   { title: "Compare", url: "/compare/" },
   ```

3. **Add a "last verified" date** in the page frontmatter or as visible text near the table. This is the single most important maintenance signal -- without it, readers cannot judge trustworthiness.

4. **Cross-link from Getting Started** -- add one sentence near the top of the Getting Started page: "Not sure if WRL is the right tool? See [how WRL compares](/compare/) to other web archiving approaches." This catches evaluators who land on the docs homepage.

### Risks and Concerns

- **Staleness is the primary risk.** Competitor feature matrices go stale within months. The methodology note and last-verified date mitigate perception but not reality. Consider a quarterly review reminder (backlog item, not a docs concern).

- **Table width on mobile.** A 7+ column comparison table will overflow on mobile viewports. The implementing agent should verify that the docs site's CSS handles horizontal scroll for wide tables, or use a responsive pattern (e.g., cards on mobile). Check the existing `doc.njk` layout and CSS for table handling before assuming it works.

- **Accuracy liability.** Every claim about a competitor is a potential source of dispute. Stick to verifiable, factual statements (supports X: yes/no) rather than qualitative judgments. Link to sources where possible.

- **SEO cannibalization.** The landing page (webresourceledger.com) likely also positions WRL against alternatives. Ensure the docs comparison page and the landing page serve different intents: landing page = quick positioning for buyers, docs page = detailed technical comparison for evaluators. Duplicate content between the two will hurt both.

### Additional Agents Needed

- **frontend-minion**: To verify/implement responsive table CSS in the docs layout. A 10-column table needs explicit overflow handling.
- **seo-minion** (if one exists): To ensure the comparison page meta description and title tag are optimized for "web archiving comparison" / "wayback machine alternative" search queries, and to check for content overlap with the landing page.
