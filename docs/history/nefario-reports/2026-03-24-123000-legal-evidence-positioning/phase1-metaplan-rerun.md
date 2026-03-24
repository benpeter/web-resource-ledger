# Meta-Plan: R42 Legal-Evidence Positioning (Landing + Docs)

## Task Analysis

This task is a **content and positioning** exercise: rewriting landing page copy, creating a new docs guide page, and adding a competitor comparison table -- all with precise legal-rule references. There is no new code, no API changes, no infrastructure work. The deliverables are:

1. Updated `landing/public/index.html` -- hero/feature section with FRE 901/902 and eIDAS references
2. New `site/content/legal-evidence.md` -- dedicated admissibility guide page
3. Updated `site/_data/site.js` -- navigation entry for the new page
4. Competitor comparison content (within the docs page or as a section)

The critical constraint is **accuracy**: every legal citation must reference an actual rule/article, no overclaiming, and R41 (certification documents, FRE 902(13)) is NOT shipped so those claims must be framed as future capability.

The revised team replaces frontend-minion with gru. This is a sound trade: the landing page changes are HTML text replacements that don't require frontend architecture expertise, while gru brings legal-technical accuracy validation that is the core risk of this task. gru will produce a claims matrix mapping each WRL capability to the specific FRE/eIDAS provisions it can credibly invoke -- this becomes the source of truth that product-marketing-minion and user-docs-minion write from.

## Planning Consultations

### Consultation 1: Legal Claims Accuracy Matrix
- **Agent**: gru
- **Planning question**: Given WRL's current capabilities (Ed25519 signatures, RFC 3161 timestamps from DigiCert, eIDAS-qualified RFC 3161 timestamps via a qualified TSA, WACZ bundles with individual artifact hashes, independent verification via CLI and REST API, public verification URLs, key rotation with historical key archive), produce a claims matrix that maps each capability to the specific FRE and eIDAS provisions it supports. For each mapping, classify the claim strength as STRONG (directly satisfies the rule's requirements), SUPPORTIVE (contributes to but does not alone satisfy the rule), or FUTURE (requires capabilities not yet shipped). Specific questions: (a) Does Ed25519 + RFC 3161 satisfy FRE 901(b)(9) "process or system" authentication, or does it merely support it? (b) What is the correct framing for 902(14) (certified records of a regularly conducted activity) given WRL is an automated system, not a business keeping records of its own activities -- does this rule apply to WRL captures at all, or only to the capturing organization's use of WRL? (c) With R41 (certification document) not shipped, can 902(13) be referenced at all, or must it be entirely deferred? (d) For eIDAS Article 41(2), what is the precise legal effect WRL can claim for captures with qualified timestamps -- is "presumption of accuracy of the date and time" the correct framing? (e) Are there any claims the current landing page implicitly makes (e.g., "web evidence you can prove") that risk overclaiming given the actual legal standard for admissibility?
- **Context to provide**: Current landing page (`landing/public/index.html`), verification.md trust model documentation (`site/content/verification.md`), positioning.md (`docs/product-management/positioning.md`), the constraint that R40 (eIDAS) is DONE and R41 (certification document) is NOT shipped
- **Why this agent**: gru evaluates technology and standards with analytical rigor. The core risk of R42 is legal overclaiming -- making FRE/eIDAS assertions that WRL's technical capabilities don't actually support. gru's claims matrix becomes the authoritative input that constrains what the other agents can write. No other agent on this team has the mandate to validate legal-rule references against technical capabilities.

### Consultation 2: Product Messaging and Legal Framing
- **Agent**: product-marketing-minion
- **Planning question**: How should the legal-evidence positioning be structured across the landing page and docs to serve two distinct audiences -- (1) legal professionals evaluating WRL for litigation/compliance, and (2) technical users who need to understand the evidence chain? Specifically: what is the right balance between legal-rule specificity on the landing page (which risks alienating non-legal users) vs. keeping it accessible? Should the FRE/eIDAS references appear in the hero, in a dedicated use-case card, or in a separate "Evidence Standards" section? How should R41 (certification document, not shipped) be handled -- omit 902(13) entirely from the landing page, or include a "coming soon" mention? The competitor comparison needs an "integrity approach" column -- what framing positions WRL's open-standard approach (WACZ + Ed25519 + RFC 3161) against proprietary formats without sounding dismissive of competitors? Note: gru will produce a claims matrix that defines what can and cannot be claimed -- your messaging recommendations should assume that matrix as the accuracy boundary, not attempt to independently validate legal references.
- **Context to provide**: Current landing page HTML (`landing/public/index.html` -- especially the hero at line 101-113 and the Legal Evidence use-case card at lines 155-158), existing positioning doc (`docs/product-management/positioning.md`), R42 issue spec with success criteria, the constraint that R40 (eIDAS) is shipped but R41 (certification document) is not
- **Why this agent**: Product-marketing-minion owns positioning, messaging hierarchy, and audience segmentation. The core challenge is translating cryptographic capabilities into precise legal value propositions without overclaiming -- that is messaging craft. This agent determines where content goes and how it is framed; gru determines what content is factually defensible.

### Consultation 3: Legal Evidence Guide Structure
- **Agent**: user-docs-minion
- **Planning question**: What should the structure and information architecture of the new "Legal Evidence" docs page look like? The page needs to cover: FRE 901/902 authentication mapping, eIDAS Article 41(2) qualified timestamps, WRL vs. traditional screenshots+affidavits comparison, competitor integrity comparison, and a disclaimer. How should this be organized -- single long page with anchor sections, or split across sub-pages? What is the right reading order for a lawyer evaluating WRL for the first time vs. a developer who wants to understand what legal standards the evidence supports? Should the competitor comparison be a section within the guide or a standalone page? How should the "not legal advice" disclaimer be positioned so it is visible but does not undermine confidence? Note: the existing verification.md (`site/content/verification.md`) already covers the trust model (Ed25519, RFC 3161, WACZ structure) in detail -- the new page should reference it rather than duplicate it. Also note: product-marketing-minion will recommend where on the landing page the legal content lives; your focus is the docs site IA and the guide page itself.
- **Context to provide**: Existing docs site structure (`site/content/` pages, `site/_data/site.js` nav), current verification.md (which has the trust model details), positioning.md competitive landscape, 11ty layout system (`site/eleventy.config.js`)
- **Why this agent**: User-docs-minion designs information architecture for end users. The "Legal Evidence" guide serves a non-technical audience (lawyers, compliance officers) which requires different writing patterns than the existing developer-facing docs. This agent owns the docs-site structure; product-marketing-minion owns the landing page.

### Consultation 4: Journey Coherence Across Audiences
- **Agent**: ux-strategy-minion
- **Planning question**: The current landing page serves four use-case audiences equally (legal, compliance, AI, journalism). R42 adds significant depth to the legal vertical -- FRE rule references, admissibility guides, competitor comparisons. How should this be balanced against the other use cases so the landing page does not become a "legal product" page? Should the legal depth live entirely on the docs site with only a teaser on the landing page, or does the landing page need enough legal specificity to convert a lawyer who lands there? How does a legal professional's evaluation journey differ from a developer's -- does the legal user go landing page -> docs guide -> verification page, or do they skip the landing page entirely and arrive at the docs via search? If the latter, how should the docs guide be structured to work as a standalone entry point? The competitor comparison table adds a new content type to the docs -- does it belong in the evidence guide, or as a separate "Compare" page that other use cases could also reference?
- **Context to provide**: Full landing page (`landing/public/index.html` -- all four use-case cards at lines 153-175), docs site navigation (`site/_data/site.js`), the fact that the landing page is at webresourceledger.com and docs are at docs.webresourceledger.com (separate domains)
- **Why this agent**: ux-strategy-minion reviews WHAT is built and WHY, ensuring features serve real user jobs-to-be-done. The core tension here is between deepening one vertical (legal) without alienating the other three. This is a journey coherence question -- how do different user segments navigate from awareness to evaluation to adoption, and does the new legal content help or hinder each journey?

### Cross-Cutting Checklist

- **Testing**: EXCLUDE from planning. This task produces only static HTML and markdown content. No executable code, no configuration changes. Phase 6 (post-execution test) will verify the 11ty build still works, which is sufficient.
- **Security**: EXCLUDE from planning. No new attack surface, no auth changes, no user input handling. The only security-adjacent concern is accuracy of legal claims, which is covered by gru's claims matrix -- a content accuracy concern, not a security concern.
- **Usability -- Strategy**: INCLUDE (Consultation 4 above). The legal-evidence positioning fundamentally changes how two distinct user segments (legal professionals and developers) experience the product's value proposition. UX-strategy should weigh in on journey coherence and whether the landing page should fork its messaging or unify it.
- **Usability -- Design**: EXCLUDE from planning. No new UI components or interaction patterns are being created. The landing page already has card/section patterns; the new content slots into existing patterns. Accessibility-minion review happens in Phase 3.5 for any HTML changes.
- **Documentation**: INCLUDE (Consultation 3 above via user-docs-minion). Software-docs-minion is not needed -- this task creates user-facing content, not architecture documentation.
- **Observability**: EXCLUDE. No runtime components, no services, no metrics. Pure static content changes.

### Notable Exclusions

- **frontend-minion**: Removed from team. The landing page changes are HTML text content updates within existing section/card patterns, not structural HTML/CSS work. The agents writing the content (product-marketing-minion, user-docs-minion) can place it directly in the existing markup. No new CSS components or layout changes are needed.
- **security-minion**: No attack surface changes. Legal accuracy review is a content concern handled by gru, not a security concern. Phase 3.5 mandatory review will still run.
- **seo-minion**: The new docs page and updated landing page would benefit from SEO review (structured data for legal FAQ, meta descriptions), but this can be handled as a Phase 3.5 discretionary reviewer rather than a planning consultant. The SEO impact is secondary to content accuracy.

### Anticipated Approval Gates

1. **Claims matrix** (MUST gate): gru's mapping of WRL capabilities to FRE/eIDAS provisions is the accuracy foundation for all downstream copy. If a claim is wrongly classified (e.g., STRONG when it should be SUPPORTIVE), the error propagates into both the landing page and docs guide. Hard to reverse once published. Multiple valid interpretations exist for several rules (especially 902(14) applicability). This gate must resolve before product-marketing-minion or user-docs-minion write final copy.

2. **Landing page copy with legal references** (MUST gate): The exact FRE/eIDAS claims on the landing page are hard to reverse once published (they establish the product's public legal positioning) and downstream docs content depends on the framing choices made here. Multiple valid approaches exist (hero vs. section vs. cards). High blast radius -- the docs guide page mirrors whatever framing the landing page establishes.

3. **Legal Evidence guide page structure** (OPTIONAL gate, recommend YES): The information architecture of the guide page determines what legal claims WRL makes in its documentation. The R41 framing (shipped vs. future) and the "not legal advice" disclaimer placement are judgment calls where the user should weigh in.

### Rationale

This task is content-heavy with minimal technical complexity. The challenge is **messaging precision**: translating cryptographic capabilities (Ed25519, RFC 3161, eIDAS qualified timestamps) into specific legal-rule references (FRE 901, 902, eIDAS Art. 41) without overclaiming. The four consultants cover the key perspectives:

- **gru**: Legal-technical accuracy validation and claims matrix (core risk mitigation)
- **product-marketing-minion**: Messaging hierarchy and audience segmentation
- **user-docs-minion**: Information architecture for a non-technical audience
- **ux-strategy-minion**: Journey coherence across legal and developer audiences

The key change from the original team is replacing frontend-minion with gru. This shifts the team's center of gravity from "where does content go in the HTML" (a trivial question given the existing page structure) to "what content is factually defensible" (the actual hard problem). gru's claims matrix becomes the upstream dependency that constrains all downstream copy, adding an approval gate but eliminating the risk of publishing inaccurate legal claims.

### Scope

**In scope**:
- Updated landing page HTML with precise FRE 901/902 and eIDAS Article 41(2) references
- New docs guide page (`site/content/legal-evidence.md`) covering admissibility, WRL-vs-screenshots comparison, eIDAS, competitor integrity approaches, disclaimer
- Updated docs navigation (`site/_data/site.js`)
- Competitor comparison content (integrity approach column)
- R41 (certification document) noted as future capability, not current feature
- Claims matrix mapping WRL capabilities to legal provisions (gru deliverable, used as input to copy)

**Out of scope**:
- Attorney review or formal legal counsel
- Jurisdiction-specific guides beyond US federal + EU
- Marketing campaigns, blog posts, social media
- Visual redesign of landing page
- New CSS components or design system changes
- SEO optimization (can follow separately)

### External Skill Integration

No external skills detected in project (`.claude/skills/` and `.skills/` directories are empty or absent in the working directory). User-global skills at `~/.claude/skills/` are all despicable-agents agents or unrelated utilities (calendar, transcribe, etc.) -- none are relevant to this task's domain.
