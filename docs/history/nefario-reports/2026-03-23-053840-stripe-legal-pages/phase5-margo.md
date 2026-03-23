# Margo Review: Stripe Legal Pages

## VERDICT: ADVISE

The implementation is proportional to the task. Static HTML, vanilla CSS, no JS,
no build tools, no dependencies. This is exactly the right approach for legal
pages. Two non-blocking concerns worth noting.

## Findings

### 1. Header/footer duplication across 6 files (ADVISE -- watch, don't fix now)

**What**: The header (~14 lines) and footer (~30 lines) are copy-pasted
identically across `index.html`, `404.html`, `privacy.html`, `terms.html`,
`refund-policy.html`, and `content-policy.html`. The comment
`<!-- Shared header: update in all pages -->` acknowledges the problem.

**Why this is accidental complexity**: Any change to navigation, footer links,
or operator details requires editing 6 files. The comment itself is a maintenance
instruction that will be forgotten. With 6 pages this is manageable; at 10+ it
becomes a real maintenance liability.

**Why I'm not blocking**: At 6 pages for a static site with no build tools, the
duplication cost is low. Introducing a templating system or SSI for this would be
over-engineering right now. The YAGNI test says: don't add infrastructure to
solve a problem that 30 seconds of find-and-replace handles today.

**Simpler alternative if it grows**: If the site gains more pages, a single-file
shell script that assembles pages from `_header.html` + `{page-body}.html` +
`_footer.html` would eliminate the duplication without adding a dependency. No
templating engine needed.

### 2. CSS article prose styles partially overlap design-system.css table styles (ADVISE -- minor)

**What**: `landing.css` section 14 defines `.article table`, `.article th`,
`.article td` styles that are nearly identical to the `.table`, `.table th`,
`.table td` styles already in `design-system.css`. The only differences are
`font-size: var(--text-sm)` vs `var(--text-base)` and the article-scoped
context.

**Why this matters**: Two parallel table styling paths. If table styling changes,
someone might update one and miss the other.

**Why I'm not blocking**: The article scope justifies slightly different sizing
for dense legal tables vs. application data tables. The overlap is ~12 lines,
not a maintenance crisis.

**Simpler alternative**: The privacy page tables could use `class="table"` from
the design system and add a single override rule `.article .table { font-size:
var(--text-sm); }` -- 1 rule instead of 6. But this is cosmetic.

## What's done well

- **Zero dependencies**: No JS, no build tools, no framework. Static HTML
  served from a CDN. This is exactly right.
- **Proportional CSS**: ~100 lines of article prose CSS for 4 legal pages.
  Reuses design system tokens throughout. No new custom properties invented.
- **No scope creep**: Task was "add Stripe-required legal pages." The output is
  exactly 4 legal pages + footer updates + sitemap entries. Nothing extra.
- **No premature optimization**: No lazy loading, no code splitting, no
  preconnect hints, no analytics. Just HTML and CSS.
- **Content is substantive**: The legal pages reflect actual WRL implementation
  details (specific data stored, specific processors, specific retention
  periods) rather than generic boilerplate. This is essential complexity --
  the content had to be this detailed to be useful.

## Complexity Budget

| Item | Column | Cost |
|------|--------|------|
| New dependency | -- | 0 |
| New service | -- | 0 |
| New abstraction layer | -- | 0 |
| New technology | -- | 0 |
| **Total** | | **0** |

This is a zero-cost addition to the complexity budget. Static files on an
existing static site.
