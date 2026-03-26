# Process

## TL;DR

Single-agent implementation of a docs site navigation restructure. Flat nav
replaced with 3-section hierarchy (Guides, Reference, Security & Compliance)
via data model, template, and CSS changes. No JavaScript, no new dependencies.
Build verified clean. Schedules page added to nav as a discovered gap.

## Approach

This phase was executed directly (no multi-agent orchestration) because the
scope was well-defined: a template/CSS change with no backend implications.

### Investigation

Read the existing nav data model (`site/_data/site.js`), the base layout
template (`site/_includes/layouts/base.njk`), and the docs CSS
(`site/css/docs.css`). The nav was a flat array of `{title, url}` objects
iterated once for desktop and once for mobile (inside a `<details>` element).

Noticed `schedules.md` existed as content but was absent from the nav array --
likely a gap from the phase that added scheduled captures.

### Implementation sequence

1. Restructured the data model first -- flat array to array of section objects
2. Updated the Nunjucks template to nest the iteration (section > children)
3. Added CSS for section headings (uppercase label style) and adjusted link
   indent/size to create visual hierarchy
4. Added Schedules to the Guides section and to `llms.txt`
5. Built the site to verify no rendering errors

### What went right

Straightforward change with no complications. The existing template structure
(separate desktop and mobile nav blocks) made it easy to update both
independently while keeping the same pattern.

### What could have gone wrong (but didn't)

The `llms.txt` and `sitemap.njk` templates could have been iterating over
`site.nav`, which would have broken with the new structure. Verified both:
sitemap uses `collections.all` (Eleventy's own page collection), and `llms.txt`
has hardcoded entries. Only the base layout template uses `site.nav`.
