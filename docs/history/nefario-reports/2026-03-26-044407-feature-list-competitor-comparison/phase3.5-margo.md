# Margo Review: Feature List and Competitor Comparison

## Verdict: ADVISE

The plan is well-scoped for what it delivers. Two HTML/CSS sections on the landing page, one new page on the docs site, one evolution log entry -- three tasks, proportional to the work. No frameworks, no JavaScript, no new dependencies. The conflict resolutions are sound (lightweight list over cards, single compare page over separate features + compare, deferred SEO infrastructure). Good discipline shown throughout.

Three items to watch:

### 1. Card-stack CSS is duplicated across landing.css and docs.css

The mobile card-stack pattern (lines 148-188 in Task 1, lines 476-533 in Task 2) is ~40 lines of nearly identical CSS written twice. This is accidental complexity from the separation of landing.css and docs.css.

**Simpler alternative**: Extract the card-stack pattern into a shared `.comparison-table` block in `design-system.css`, or accept the duplication consciously and add a comment like `/* Duplicated in docs.css -- sync changes */` in both files. The plan says "do NOT modify design-system.css" which is fine -- but then acknowledge the duplication with a sync comment so the next person does not drift them apart.

**Severity**: Non-blocking. 40 lines of CSS duplication across two files is manageable. Just make it visible.

### 2. The .njk justification is thin -- check whether Eleventy Markdown can produce data-label attributes

The plan says `.njk` is required because "Markdown tables cannot produce custom HTML attributes." This is true for pure Markdown, but Eleventy processes Markdown files through Nunjucks by default, and raw HTML inside `.md` files passes through unchanged. The comparison table is hand-written HTML (not generated from Markdown table syntax), so it could live in a `.md` file with an HTML block just as easily.

**Why it matters**: `.md` files are the docs site's convention. Using `.njk` for one page is a precedent. If the HTML-in-Markdown approach works (it should -- `api-reference.njk` exists as precedent for `.njk`, but so does every other page as precedent for `.md`), the simpler choice is to stay with the convention.

**Severity**: Non-blocking. Either format works. The `.njk` choice is defensible given `api-reference.njk` precedent. Just noting that the stated reason ("Markdown cannot produce data-label") does not hold when the table is raw HTML inside the Markdown file.

### 3. Structured data additions in Task 2 touch a Task 1 file

Task 2 modifies `landing/public/index.html` (structured data update to `featureList` and adding `applicationSubCategory` + `offers`). Task 1 also modifies `landing/public/index.html` (adding sections and nav). These run in parallel. This creates a merge conflict risk.

**Simpler alternative**: Move the structured data update into Task 1's prompt since it is already modifying that file. Task 2 then only touches docs site files. This eliminates the parallel-write hazard entirely.

**Severity**: Non-blocking but worth fixing before execution. Parallel writes to the same file are a predictable source of rework.

---

**Summary**: The plan is proportional to the problem. Three tasks for three deliverables, no unnecessary abstractions, no scope creep. The card-stack-in-two-places duplication and the parallel file edit are minor coordination issues, not architectural concerns. Ship it.
