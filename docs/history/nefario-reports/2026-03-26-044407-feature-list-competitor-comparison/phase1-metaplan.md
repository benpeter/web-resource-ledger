# Meta-Plan: Feature List and Competitor Comparison Table

## Planning Consultations

### Consultation 1: Competitor Research and Factual Accuracy

- **Agent**: product-marketing-minion
- **Planning question**: For the comparison table covering Wayback Machine, PageFreezer, Hanzo, Page Vault, MirrorWeb, Stillio, Archive-It, Webrecorder, and manual screenshots + notarization -- what is each competitor's actual approach to: integrity/tamper-evidence, cryptographic signing, independent timestamps, public verification, API access, standard format support (WACZ), and eIDAS compliance? What are WRL's genuine differentiators vs. areas where competitors match or exceed WRL? How should we frame the comparison to be factually honest while highlighting WRL's strengths?
- **Context to provide**: WRL's capabilities (Ed25519 signing, RFC 3161 timestamps, WACZ bundles, public verification URLs, eIDAS-qualified timestamps, REST API, MCP server). The success criteria requiring no strawmanning.
- **Why this agent**: product-marketing-minion specializes in competitive differentiation and feature messaging. The comparison table's credibility depends on accurate competitor characterization -- getting this wrong undermines trust. This agent can research each competitor and propose the column structure that best highlights genuine differentiation.

### Consultation 2: Feature List Content and Developer Messaging

- **Agent**: product-marketing-minion
- **Planning question**: How should the feature list be structured to serve both non-technical ("what does this do for me?") and developer ("what can I build with this?") audiences? What feature categories and copy approach will convert "what is this?" visitors into "I need this" users? Specifically: should the developer subsection use a different visual treatment than the main feature list, and what level of technical detail belongs on the landing page vs. the docs site?
- **Context to provide**: Current landing page structure (Hero, Use Cases, How It Works, Pricing), target audience mix (legal professionals, compliance officers, developers, AI agent builders).
- **Why this agent**: Same agent, second question. Feature messaging strategy -- what to emphasize, what order, what vocabulary -- is core product-marketing work.

**Note**: Consultations 1 and 2 are both for product-marketing-minion. They can be combined into a single consultation prompt if the skill runner prefers.

### Consultation 3: Information Architecture and Placement

- **Agent**: ux-strategy-minion
- **Planning question**: Where should the feature list and comparison table be placed in the landing page flow relative to existing sections (Hero > Use Cases > How It Works > Pricing)? The task specifies a summary version on the landing page and a full version on the docs site -- what content should live on each, and how should users flow between them? What is the cognitive load risk of adding two new content-heavy sections to a currently concise landing page?
- **Context to provide**: Current landing page HTML structure (4 sections, clean flow), docs site navigation (15 entries already). The landing page is currently ~310 lines of HTML with a tight narrative arc.
- **Why this agent**: ux-strategy-minion evaluates journey coherence and cognitive load. Adding two substantial sections (feature list + comparison table) to a concise landing page risks overwhelming visitors. This agent can recommend the right content split between landing and docs.

### Consultation 4: Responsive Table Design

- **Agent**: frontend-minion
- **Planning question**: The comparison table has 7+ columns and 9+ competitor rows. What CSS-only patterns (no JS frameworks) work for making a data-dense comparison table responsive on mobile while remaining scannable? Should the landing page summary use a different layout pattern (e.g., cards, stacked rows) than the full docs-site table? What existing design-system.css components (`.table`, `.card`, `.badge`) can be reused vs. what new CSS is needed?
- **Context to provide**: design-system.css (has `.table` and `.badge` components), landing.css (responsive breakpoints at 640px, 768px, 1024px), docs.css. Constraint: pure HTML + CSS only.
- **Why this agent**: frontend-minion knows responsive CSS patterns for data-dense tables. A 7x10 comparison table that breaks on mobile defeats the purpose. This is the hardest implementation challenge in the task.

### Consultation 5: Landing Page SEO Impact

- **Agent**: seo-minion
- **Planning question**: The landing page already has SoftwareApplication structured data with a `featureList` array. How should the new feature list section and comparison table be reflected in structured data? Should the comparison table get its own schema.org markup (e.g., `ItemList` with `ListItem` for competitors)? Are there SEO considerations for the landing-page-summary vs. docs-site-full split (canonical URLs, duplicate content)?
- **Context to provide**: Existing structured data in index.html (Organization + SoftwareApplication schemas), docs site at docs.webresourceledger.com (separate subdomain).
- **Why this agent**: seo-minion ensures the new content is discoverable and properly structured for search engines. The dual-site split (landing summary + docs full) needs careful handling to avoid duplicate content issues.

## Cross-Cutting Checklist

- **Testing**: Exclude from planning. This task produces static HTML/CSS content only -- no code logic, no API changes, no infrastructure. Visual verification is sufficient per CLAUDE.md ("For UI-only changes, visual verification is sufficient").
- **Security**: Exclude from planning. No user input handling, no auth changes, no new attack surface. Pure static content addition.
- **Usability -- Strategy**: ALWAYS include -- covered by Consultation 3 (ux-strategy-minion). Planning question addresses page flow, cognitive load, and content split between landing and docs.
- **Usability -- Design**: Include in execution but not planning. ux-design-minion should review the final visual treatment of the feature list and comparison table (visual hierarchy, spacing, color usage for badges). No planning question needed -- the design review happens against concrete HTML/CSS.
- **Documentation**: ALWAYS include -- the docs site IS the deliverable. software-docs-minion should advise during planning on where the full comparison page fits in the docs site navigation and whether it warrants its own section or lives under an existing page. Planning question: "Given the current docs nav (15 items across Getting Started, Auth, Verification, Legal Evidence, etc.), where should a detailed features/comparison page live? Should it be a top-level nav item or nested? What title?"
- **Observability**: Exclude from planning. No runtime components, no APIs, no background processes.

### Consultation 6: Docs Site Navigation Placement

- **Agent**: software-docs-minion
- **Planning question**: The docs site nav has 15 entries. Where should the full comparison/features page live? Should it be a single page combining features + comparison, or two separate pages? What title and position in the nav? Should it link back to the landing page summary, and vice versa?
- **Context to provide**: Current nav structure from site/_data/site.js, existing page topics.
- **Why this agent**: software-docs-minion owns documentation architecture. The docs nav is already long -- adding content needs to be intentional about placement.

## Notable Exclusions

- **accessibility-minion**: The comparison table is the main a11y risk (complex table semantics, mobile overflow). However, frontend-minion can handle WCAG table markup as part of implementation. Accessibility review is better suited for Phase 3.5 architecture review against the concrete plan rather than planning consultation.
- **data-minion**: No database or data modeling involved -- competitor data is static content, not stored or queried.
- **ai-modeling-minion**: No prompt engineering or agent architecture changes. The MCP server is mentioned as a feature but not being modified.

## Anticipated Approval Gates

1. **Content strategy gate** (MUST): Where to place feature list and comparison table on landing page, what content goes on landing vs. docs, comparison table column structure. This is hard to reverse (restructuring HTML sections after implementation is significant rework) and has high blast radius (every subsequent task depends on these decisions).

2. **Competitor characterization gate** (MUST): The factual accuracy of each competitor row before it goes into HTML. Getting competitor claims wrong is reputationally damaging and hard to reverse once published. This is the highest-risk deliverable in the plan.

No other gates anticipated. CSS implementation and docs-site integration are straightforward and reversible.

## Rationale

This task is primarily a **content + design** challenge, not a technical one. The hardest parts are:

1. **Factual accuracy** of competitor comparisons (product-marketing-minion)
2. **Information architecture** -- where to put two dense new sections without breaking the landing page's narrative flow (ux-strategy-minion)
3. **Responsive design** for a data-dense comparison table on mobile (frontend-minion)
4. **SEO** -- structured data and duplicate content handling across two sites (seo-minion)
5. **Docs navigation** -- fitting a new page into an already-long nav (software-docs-minion)

The implementation itself is straightforward HTML/CSS using existing design-system components. The planning phase is about getting the content and placement decisions right before writing markup.

## Scope

**In scope**:
- Feature list section for landing page (core capabilities + developer subsection)
- Comparison table for landing page (summary version)
- Full comparison page for docs site (detailed version with notes)
- CSS for responsive table rendering on mobile
- Updates to landing page nav and docs site nav
- Structured data updates for SEO
- Links between landing summary and docs full version

**Out of scope**:
- Changes to existing landing page sections (Hero, Use Cases, How It Works, Pricing)
- Changes to the WRL product itself (API, MCP server, etc.)
- New JavaScript functionality
- Changes to design-system.css (extend via landing.css / docs.css only)
- Blog post or marketing copy beyond the landing/docs pages

## External Skill Integration

No external skills detected in project. The ops-runbook skill in `.claude/skills/` is not relevant to this content/design task.
