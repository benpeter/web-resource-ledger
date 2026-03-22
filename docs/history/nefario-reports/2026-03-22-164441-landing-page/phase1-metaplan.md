# Meta-Plan: WRL Landing Page

## Planning Consultations

### Consultation 1: Landing Page Information Architecture and Content Strategy

- **Agent**: ux-strategy-minion
- **Planning question**: Given that WRL is a web evidence capture API with four distinct use cases (legal evidence, compliance archiving, AI agent web grounding, journalism source preservation), how should we structure the landing page's information hierarchy? Specifically: (1) What is the optimal ordering of sections for a developer-facing evidence infrastructure product -- should pricing come before or after use cases? (2) For the "how it works" 3-step flow, should the steps be technical (API call, signing, verification) or outcome-oriented (capture, prove, trust)? (3) What is the right CTA strategy when the product has both a docs site and a web UI -- which should be primary? (4) The pricing tiers are placeholder -- how should we visually communicate "illustrative" pricing without undermining trust?
- **Context to provide**: The design system (`src/design-system.css`, `docs/style-guide.md`), the existing docs site structure (`site/` directory with 6 guide pages), the web UI at `/ui`, the backlog showing this is a single-operator product building toward SaaS.
- **Why this agent**: Information architecture and user journey decisions for a landing page determine what gets built. Getting the content hierarchy wrong means rework on every downstream task. ux-strategy-minion's cognitive load and journey coherence expertise is critical for a page that must serve multiple audience segments (developers, legal teams, compliance officers, journalists).

### Consultation 2: Deployment Architecture -- Cloudflare Pages vs Workers Static Assets

- **Agent**: iac-minion
- **Planning question**: The docs site is deployed as a Cloudflare Worker with `[assets]` static directory (Workers Static Assets), not Cloudflare Pages. For the landing page at the root domain (`webresourceledger.com`), which deployment approach is best? Options: (1) A separate Cloudflare Pages project with its own deploy workflow, (2) A second Worker with `[assets]` mirroring the docs pattern, (3) A subdirectory of the existing docs site deployed together. Consider: the landing page is a single HTML file with CSS -- no build step needed. The docs site uses 11ty for builds. Custom domain routing (root domain vs `docs.` subdomain). The existing `deploy-docs.yml` workflow as a template. CI/CD integration including Lighthouse checks.
- **Context to provide**: `site/wrangler.toml` (Workers Static Assets pattern), `.github/workflows/deploy-docs.yml` (deploy pipeline with Lighthouse), the landing page being purely static HTML/CSS with no build tool.
- **Why this agent**: Deployment architecture choice cascades into CI/CD design, domain routing, and the workflow file structure. The wrong choice creates operational complexity for a single static file.

### Consultation 3: Landing Page Visual Design and Component Strategy

- **Agent**: ux-design-minion
- **Planning question**: The WRL design system (`src/design-system.css`) was built for application UI (verification pages, admin dashboards). A marketing landing page has different visual needs -- larger typography for hero sections, section backgrounds for visual rhythm, pricing card layouts, icon/illustration treatment for the 3-step flow. (1) Should the landing page CSS extend the existing design system tokens or define its own landing-page-specific layer on top? (2) What component patterns are needed that don't exist in the design system (hero, pricing cards, feature grid, step indicators)? (3) The docs site already has WCAG AA contrast overrides for `--color-text-muted` and `--color-accent` -- should the landing page adopt the same overrides? (4) How should responsive breakpoints work for a marketing page (the design system only has a 640px mobile breakpoint)?
- **Context to provide**: Full `src/design-system.css`, `docs/style-guide.md` (design principles: "institutional trust, precision, restraint"), `site/css/docs.css` (existing WCAG overrides), the logo SVG.
- **Why this agent**: The landing page is the first thing prospective users see. Visual design decisions (hero layout, section spacing, pricing card structure, responsive behavior) directly determine the HTML/CSS structure that will be built.

### Consultation 4: Landing Page Copy and Product Positioning

- **Agent**: product-marketing-minion
- **Planning question**: WRL needs a tagline, one-sentence value proposition, and section copy for four use cases. (1) What is the right positioning angle -- "web evidence infrastructure" vs "cryptographic web capture" vs "trust layer for web content"? Consider that the audience spans developers integrating via API, legal professionals needing court-admissible evidence, compliance teams doing regulatory archiving, and AI agent builders grounding LLM outputs. (2) For each use case section (legal evidence, compliance archiving, AI agent grounding, journalism), what is the one-sentence pitch and the 2-3 bullet points that make it concrete? (3) What pricing tier names and positioning work for a developer tool with a free tier? (4) How should the CTA hierarchy work -- primary CTA text and secondary CTA text?
- **Context to provide**: The product README (for current positioning), the docs site content pages (to avoid duplication), the backlog (to understand where the product is headed).
- **Why this agent**: Landing page copy is the product's first impression. product-marketing-minion's expertise in value propositions, feature messaging, and competitive differentiation is essential for a page that must convert across four distinct use case segments.

### Consultation 5: SEO Foundation for Root Domain

- **Agent**: seo-minion
- **Planning question**: The landing page will be the root domain (`webresourceledger.com`). (1) What structured data (schema.org) should be on the page -- SoftwareApplication, WebAPI, Organization, or a combination? (2) What meta tags are essential for a developer tool landing page (beyond basic title/description)? (3) Should the page include JSON-LD for pricing (Offer schema)? (4) How should the page relate to the docs subdomain from a canonical/sitemap perspective? (5) Any Open Graph / Twitter Card considerations for when the page is shared?
- **Context to provide**: The domain structure (root for landing, `docs.` for documentation), that this is a B2B developer tool, the four use case segments.
- **Why this agent**: The root domain landing page is the SEO anchor for the entire product. Getting structured data, meta tags, and cross-subdomain relationships right from the start avoids technical SEO debt.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning -- NO. The deliverable is a single static HTML/CSS page. Testing is limited to Lighthouse assertions (already patterned in `deploy-docs.yml`) and link checking. test-minion's expertise is not needed for planning; the iac-minion consultation covers CI integration with Lighthouse. Test execution will be handled in Phase 6 post-execution.
- **Security**: Include security-minion for planning -- NO. A static HTML page with no forms, no JavaScript, no user input, and no API calls creates no meaningful attack surface. The deployment uses the same Cloudflare infrastructure already reviewed. Security review will occur in Phase 3.5 architecture review (mandatory).
- **Usability -- Strategy**: ALWAYS include -- Consultation 1 (ux-strategy-minion) covers information architecture, content hierarchy, CTA strategy, and cognitive load for multi-audience landing page design.
- **Usability -- Design**: Include ux-design-minion for planning -- YES. Consultation 3 covers visual design decisions, component strategy, responsive breakpoints, and accessibility contrast requirements. Include accessibility-minion for planning -- NO. The existing design system already has WCAG AA contrast work documented in `docs.css`. Accessibility audit will be mandatory in Phase 3.5 review.
- **Documentation**: ALWAYS include -- NO dedicated planning consultation needed. The landing page IS the documentation (marketing tier). software-docs-minion's input is not needed for planning because the task explicitly says "must not duplicate content from the docs site; link to it instead." The docs site already exists. Documentation updates (if any) will be handled in Phase 8 post-execution.
- **Observability**: Include observability-minion for planning -- NO. A static page with no server-side logic, no API calls, and no tracking (explicitly out of scope) has no observability requirements. sitespeed-minion -- NO for planning. Performance budget is simple (<1s on 3G, Lighthouse >= 95) and enforceable via CI Lighthouse. The iac-minion consultation covers CI integration.

### Notable Exclusions

- **frontend-minion**: The landing page is plain HTML/CSS with no JavaScript, no component state, no build tooling. frontend-minion's React/TypeScript/build-tool expertise is not relevant. ux-design-minion covers the CSS/responsive aspects.
- **accessibility-minion**: The design system already has WCAG AA contrast overrides documented in `site/css/docs.css`. The landing page will use the same tokens. accessibility-minion is mandatory in Phase 3.5 architecture review, but does not need to contribute to planning for a semantic HTML page with an established design system.
- **edge-minion**: CDN and caching is handled automatically by Cloudflare Pages/Workers Static Assets. No custom caching strategy is needed for a single static page.

### Anticipated Approval Gates

1. **Landing page content and information architecture** (from ux-strategy-minion + product-marketing-minion synthesis): The copy, section ordering, CTA strategy, and pricing tier presentation. This is hard to reverse (copy and positioning propagate into the HTML structure) and has high blast radius (every downstream task depends on knowing what content to build). **MUST gate.**

2. **Deployment architecture decision** (from iac-minion): Whether to use Cloudflare Pages, Workers Static Assets, or integrate with the docs site. This determines the directory structure, wrangler.toml, workflow file, and domain routing. Hard to reverse once built. **MUST gate.**

### Rationale

This task is primarily a marketing and design challenge that happens to be deployed as infrastructure. The five planning consultations cover:

- **What to say** (product-marketing-minion): Copy, positioning, value propositions
- **How to organize it** (ux-strategy-minion): Information hierarchy, CTA strategy, audience segmentation
- **How it looks** (ux-design-minion): Visual design, component patterns, responsive behavior
- **Where to deploy it** (iac-minion): Infrastructure choice, CI/CD, domain routing
- **How to be found** (seo-minion): Structured data, meta tags, discoverability

The task is deliberately scoped as a single static HTML/CSS page with no JavaScript, which keeps the execution relatively simple once the content and design decisions are made. The complexity is in the planning -- getting the messaging, visual hierarchy, and deployment right -- not in the implementation.

### Scope

**In scope**: Single-page static HTML/CSS landing page at `webresourceledger.com` root domain. Sections: hero (tagline + CTA), how-it-works (3-step flow), use cases (4 segments), pricing (placeholder tiers), footer (links). Cloudflare deployment with CI/CD. Custom domain with HTTPS. Responsive design. Lighthouse performance >= 95, accessibility >= 90.

**Out of scope**: Blog, changelog, interactive demos, signup form, analytics/tracking, JavaScript frameworks, build tools, any server-side logic.

### External Skill Integration

No external skills detected in project. No project-local skills found in `.claude/skills/` or `.skills/`. User-global skills at `~/.claude/skills/` are all despicable-agents framework skills (nefario, despicable-prompter) or unrelated personal skills (transcribe, tro, daily-recap, etc.) -- none relevant to this task domain.
