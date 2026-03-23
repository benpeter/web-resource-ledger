You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Host Stripe-required legal and policy pages on webresourceledger.com so the
site passes Stripe's business website verification. All pages served as static
HTML under the existing landing site (Cloudflare Workers Static Assets).

## Your Planning Question

We need 4 new HTML pages that share the landing page's header, footer, and design system.
The current site is pure static HTML with no templating or build tools. Plan the implementation:

1. **Page file structure**: Where should the 4 HTML files live within `landing/public/`
   for Cloudflare Workers Static Assets to serve them at `/privacy`, `/refund-policy`,
   `/terms`, `/content-policy`? (Consider: flat files vs directories with index.html)

2. **Prose content layout**: The landing page is structured with hero, cards, pricing grids.
   Legal pages are long-form prose (headings, paragraphs, lists). What CSS is needed for
   a clean "article" layout? Should this go in a new CSS file or extend landing.css?

3. **Shared header/footer**: Each page needs the same header and footer as index.html.
   With no build tools, this means copy-paste of the header/footer markup. Is this acceptable
   for 5 pages total, or should we introduce a minimal approach? (Constraint: no JS frameworks,
   no build tools. Keep it simple.)

4. **Footer restructuring**: The current footer has a single `<nav>` with 6 links (Docs, Web UI,
   API Reference, GitHub, Terms, Content Policy). It needs to become:
   - Product links (Docs, Web UI, API Reference, GitHub)
   - Legal links (Terms, Privacy, Refund Policy, Content Policy)
   - Operator identity: "Gerhard Benjamin Peter · Weidenhäuser Str. 73, 35037 Marburg · bp@ben-peter.com"
   - Copyright line updated

   How should the footer markup and CSS be structured?

5. **Meta tags**: Each legal page needs `<title>`, `<meta name="description">`, `<link rel="canonical">`.
   Any other meta tags needed? (robots, Open Graph are optional for legal pages)

6. **sitemap.xml**: Add the 4 new URLs. What priority and changefreq values?

## Context

Read these files for the current implementation:
- `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvety-sparking-mist/landing/public/index.html`
- `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvety-sparking-mist/landing/public/css/design-system.css`
- `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvety-sparking-mist/landing/public/css/landing.css`
- `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvety-sparking-mist/landing/public/sitemap.xml`
- `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvety-sparking-mist/landing/wrangler.toml`

## Constraints

- Pure HTML + CSS, no JS framework, no build tools
- Must match the landing page's visual style (use design-system.css tokens)
- Pages must be accessible (semantic HTML, focus styles, skip links)
- No JavaScript on legal pages (landing page has zero JS, keep it that way)
- The site uses Cloudflare Workers Static Assets — files in `landing/public/` are served directly

## Instructions

1. Read the files listed above
2. Apply your frontend expertise to the planning questions
3. Identify risks, dependencies, and requirements
4. Return your contribution in this format:

## Domain Plan Contribution: frontend-minion

### Recommendations
<expert recommendations for HTML/CSS architecture>

### Proposed Tasks
<specific tasks for the execution plan — what to create, what to modify>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved, or "None">

5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-pvuyDB/stripe-legal-pages/phase2-frontend-minion.md`
