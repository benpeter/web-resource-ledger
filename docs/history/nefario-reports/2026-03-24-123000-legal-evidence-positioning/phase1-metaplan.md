# Meta-Plan: R42 Legal-Evidence Positioning (Landing + Docs)

## Task Analysis

This task is fundamentally a **content and positioning** exercise: rewriting landing page copy, creating a new docs guide page, and adding a competitor comparison table -- all with precise legal-rule references. There is no new code, no API changes, no infrastructure work. The deliverables are:

1. Updated `landing/public/index.html` -- hero/feature section with FRE 901/902 and eIDAS references
2. New `site/content/legal-evidence.md` -- dedicated admissibility guide page
3. Updated `site/_data/site.js` -- navigation entry for the new page
4. Competitor comparison content (within the docs page or as a section)

The critical constraint is **accuracy**: every legal citation must reference an actual rule/article, no overclaiming, and R41 (certification documents, FRE 902(13)) is NOT shipped so those claims must be framed as future capability.

## Planning Consultations

### Consultation 1: Product Messaging and Legal Framing
- **Agent**: product-marketing-minion
- **Planning question**: How should the legal-evidence positioning be structured across the landing page and docs to serve two distinct audiences -- (1) legal professionals evaluating WRL for litigation/compliance, and (2) technical users who need to understand the evidence chain? Specifically: what's the right balance between legal-rule specificity on the landing page (which risks alienating non-legal users) vs. keeping it accessible? Should the FRE/eIDAS references appear in the hero, in a dedicated use-case card, or in a separate "Evidence Standards" section? How should R41 (certification document, not shipped) be handled -- omit 902(13) entirely, or mention it as a roadmap item?
- **Context to provide**: Current landing page HTML (`landing/public/index.html`), existing positioning doc (`docs/product-management/positioning.md`), R42 issue spec with success criteria, the constraint that R40 (eIDAS) is shipped but R41 (certification document) is not
- **Why this agent**: Product-marketing-minion owns positioning, messaging hierarchy, and audience segmentation. The core challenge here is translating technical cryptographic capabilities into precise legal value propositions without overclaiming -- that's messaging craft.

### Consultation 2: Legal Evidence Guide Structure
- **Agent**: user-docs-minion
- **Planning question**: What should the structure and information architecture of the new "Legal Evidence" docs page look like? The page needs to cover: FRE 901/902 authentication mapping, eIDAS Article 41(2) qualified timestamps, WRL vs. traditional screenshots+affidavits comparison, competitor integrity comparison, and a disclaimer. How should this be organized -- single long page or split into sub-pages? What's the right reading order for a lawyer who's evaluating WRL for the first time? Should the competitor comparison be a separate page or a section within the guide? How should the "not legal advice" disclaimer be positioned so it's visible but doesn't undermine confidence?
- **Context to provide**: Existing docs site structure (`site/content/` pages, `site/_data/site.js` nav), current verification.md (which has the trust model details), positioning.md competitive landscape, 11ty layout system
- **Why this agent**: User-docs-minion designs information architecture for end users. The "Legal Evidence" guide serves a non-technical audience (lawyers, compliance officers) which requires different writing patterns than the existing developer-facing docs.

### Consultation 3: Landing Page UX Integration
- **Agent**: frontend-minion
- **Planning question**: How should the legal-evidence positioning be integrated into the existing landing page HTML/CSS without a visual redesign? Options include: (a) updating the existing "Legal Evidence" use-case card, (b) adding a new dedicated section between use-cases and pricing, (c) adding subtle FRE/eIDAS badges to the hero. The landing page is static HTML with a design system CSS -- what's the lightest-touch approach that adds evidence-grade specificity without disrupting the existing visual flow? Should the competitor comparison live on the landing page or only on the docs site?
- **Context to provide**: Full `landing/public/index.html`, `landing/public/css/landing.css` structure, design-system.css tokens
- **Why this agent**: Frontend-minion can assess the structural options for integrating new content into existing HTML/CSS without breaking the design system or requiring significant new CSS.

### Cross-Cutting Checklist

- **Testing**: EXCLUDE from planning. This task produces only static HTML and markdown content. No executable code, no configuration changes. Phase 6 (post-execution test) will verify the 11ty build still works, which is sufficient.
- **Security**: EXCLUDE from planning. No new attack surface, no auth changes, no user input handling. The only security-adjacent concern is accuracy of legal claims, which is a content review concern, not a security concern.
- **Usability -- Strategy**: INCLUDE. The legal-evidence positioning fundamentally changes how two distinct user segments (legal professionals and developers) experience the product's value proposition. UX-strategy should weigh in on whether the landing page should fork its messaging or unify it, and how the new docs page fits the existing user journey.
  - **Planning question for ux-strategy-minion**: The current landing page serves four use-case audiences equally (legal, compliance, AI, journalism). R42 adds significant depth to the legal vertical -- FRE rule references, admissibility guides, competitor comparisons. How should this be balanced against the other use cases so the landing page doesn't become a "legal product" page? Should the legal depth live entirely on the docs site with only a teaser on the landing page? How does a lawyer's evaluation journey differ from a developer's, and should the docs IA reflect this with a separate "legal" section?
- **Usability -- Design**: EXCLUDE from planning. No new UI components or interaction patterns are being created. The landing page already has card/section patterns; the new content slots into existing patterns. Accessibility-minion review happens in Phase 3.5 for any HTML changes.
- **Documentation**: INCLUDE (covered by Consultation 2 above via user-docs-minion). Software-docs-minion is not needed -- this task creates user-facing content, not architecture documentation.
- **Observability**: EXCLUDE. No runtime components, no services, no metrics. Pure static content changes.

### Notable Exclusions

- **security-minion**: No attack surface changes. Legal accuracy review is a content concern, not a security concern. Phase 3.5 mandatory review will still run.
- **seo-minion**: The new docs page and updated landing page would benefit from SEO review (structured data for legal FAQ, meta descriptions), but this can be handled as a Phase 3.5 discretionary reviewer rather than a planning consultant. The SEO impact is secondary to content accuracy.
- **software-docs-minion**: The new page is user-facing legal guidance, not architecture or API documentation. user-docs-minion is the right specialist.

### Anticipated Approval Gates

1. **Landing page copy with legal references** (MUST gate): The exact FRE/eIDAS claims on the landing page are hard to reverse once published (they establish the product's public legal positioning) and downstream docs content depends on the framing choices made here. Multiple valid approaches exist (hero vs. section vs. cards). High blast radius -- the docs guide page mirrors whatever framing the landing page establishes.

2. **Legal Evidence guide page structure** (OPTIONAL gate, recommend YES): The information architecture of the guide page determines what legal claims WRL makes in its documentation. The R41 framing (shipped vs. future) and the "not legal advice" disclaimer placement are judgment calls where the user should weigh in.

### Rationale

This task is content-heavy with minimal technical complexity. The challenge is **messaging precision**: translating cryptographic capabilities (Ed25519, RFC 3161, eIDAS qualified timestamps) into specific legal-rule references (FRE 901, 902, eIDAS Art. 41) without overclaiming. The four consultants cover the key perspectives:

- **product-marketing-minion**: Messaging hierarchy and audience segmentation (core challenge)
- **user-docs-minion**: Information architecture for a non-technical audience
- **frontend-minion**: Structural integration into existing HTML/CSS
- **ux-strategy-minion**: Journey coherence across legal and developer audiences

The budget ($30) and scope (no new code) mean this is a focused copywriting task. The risk is in accuracy, not complexity.

### Scope

**In scope**:
- Updated landing page HTML with precise FRE 901/902 and eIDAS Article 41(2) references
- New docs guide page (`site/content/legal-evidence.md`) covering admissibility, WRL-vs-screenshots comparison, eIDAS, competitor integrity approaches, disclaimer
- Updated docs navigation (`site/_data/site.js`)
- Competitor comparison content (integrity approach column)
- R41 (certification document) noted as future capability, not current feature

**Out of scope**:
- Attorney review or formal legal counsel
- Jurisdiction-specific guides beyond US federal + EU
- Marketing campaigns, blog posts, social media
- Visual redesign of landing page
- New CSS components or design system changes
- SEO optimization (can follow separately)

### External Skill Integration

No external skills detected in project (`.claude/skills/` and `.skills/` directories are empty or absent in the working directory). User-global skills at `~/.claude/skills/` are all despicable-agents agents or unrelated utilities (calendar, transcribe, etc.) -- none are relevant to this task's domain.
