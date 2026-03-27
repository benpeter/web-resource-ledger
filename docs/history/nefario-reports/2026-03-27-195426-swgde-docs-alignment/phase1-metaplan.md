# Meta-Plan: SWGDE Compliance Documentation Alignment

## Task Summary

Map WRL's existing capabilities to SWGDE's "Best Practices for Acquiring Online Content" (21-F-001, Version 1.1, March 2024) through documentation only. Create a new SWGDE compliance mapping page, update three existing docs pages (legal-evidence.md, verification.md, architecture.md) with cross-references, and integrate SWGDE-specific terminology for SEO value.

## Planning Consultations

### Consultation 1: SWGDE Standard Mapping Strategy

- **Agent**: software-docs-minion
- **Planning question**: Given WRL's existing docs structure (legal-evidence.md covering FRE 901/902 and eIDAS, verification.md covering 5-check model, architecture.md covering capture pipeline), how should the new `swgde-compliance.md` be structured to walk through SWGDE 21-F-001 sections 3.1, 3.4, 4.1, 4.2, 4.3, 7.2, 7.3, 7.5, 8.1.1, and 9 -- and where should cross-references into existing pages go vs. where should content be self-contained? The page must honestly distinguish areas where WRL's automated approach differs from SWGDE's manual-examiner model. Should the page use a section-by-section walkthrough format or a capability-mapping-table format?
- **Context to provide**: Full content of legal-evidence.md, verification.md, architecture.md, security whitepaper sections 1-5. The docs site navigation structure (site/_data/site.js). The SWGDE standard itself (21-F-001 v1.1).
- **Why this agent**: software-docs-minion owns architecture and compliance documentation structure. Deciding how to integrate a new compliance standard into an existing docs ecosystem -- where to cross-reference vs. duplicate, how to structure mapping pages -- is their core domain.

### Consultation 2: Legal & Evidence Positioning

- **Agent**: user-docs-minion
- **Planning question**: The target audience for the SWGDE compliance page includes digital forensics examiners and attorneys evaluating WRL for evidence preservation. SWGDE's model assumes a human examiner using manual tools -- WRL is fully automated. How should the documentation handle this fundamental difference? Specifically: (1) What tone should the "honest gaps" sections use -- should they frame automated vs. manual as a limitation, an alternative approach, or both? (2) The existing legal-evidence.md already has a "WRL vs. traditional evidence preservation" comparison table and an "evidence foundation checklist" -- should the SWGDE cross-reference be a new section within legal-evidence.md or a lightweight pointer to the new page? (3) How should the page handle SWGDE concepts that have no direct WRL equivalent (e.g., "examiner qualification" in section 3.1)?
- **Context to provide**: Full legal-evidence.md content, SWGDE 21-F-001 sections 3.1, 3.4, 4.1, 8.1.1.
- **Why this agent**: user-docs-minion specializes in writing for non-developer audiences (forensics examiners, attorneys). The positioning of automated-vs-manual is a user communication challenge, not an architecture one.

### Consultation 3: SEO Terminology Integration

- **Agent**: seo-minion
- **Planning question**: The task asks to integrate SWGDE-specific terminology ("forensically sound", "collection documentation", "tool validation", "content volatility") naturally into the new and updated pages. What is the SEO strategy for this? Specifically: (1) Which SWGDE terms have meaningful search volume or competitive opportunity in the digital forensics / legal evidence space? (2) Should the new swgde-compliance.md target a specific keyword cluster (e.g., "SWGDE compliant web capture" or "forensically sound web archiving")? (3) For the updates to existing pages (legal-evidence.md, verification.md, architecture.md), should SWGDE terms be integrated into existing copy or only in new sections/paragraphs? (4) What structured data (schema.org) should the new page carry?
- **Context to provide**: Current page descriptions/titles from frontmatter, site._data/site.js navigation, the existing base.njk template's JSON-LD and meta tag patterns.
- **Why this agent**: seo-minion determines which terms to target, where to place them for maximum indexing value, and what structured data supports the page. SWGDE is a niche term -- the SEO strategy determines whether this page captures forensics professionals searching for standards compliance.

### Consultation 4: Navigation & Information Architecture

- **Agent**: ux-strategy-minion
- **Planning question**: The docs site currently has three nav sections: Guides (Getting Started, Authentication, Verification, Legal Evidence, Batch Captures, Schedules), Reference (API Reference, Limits, Webhooks, MCP Server, Architecture, Compare, How It Was Built), and Security & Compliance (Overview, Whitepaper, DPA, Subprocessors, Incident Response, Data Retention). Where should the new SWGDE compliance page live in this navigation? Options: (1) Under "Security & Compliance" alongside the whitepaper and DPA; (2) Under "Guides" next to "Legal Evidence" since it extends the legal framework coverage; (3) As a new top-level section ("Standards & Compliance"). What is the right user journey -- does a forensics examiner evaluating WRL start at Legal Evidence and discover SWGDE, or search for SWGDE directly?
- **Context to provide**: Full site._data/site.js navigation, the existing page titles and descriptions.
- **Why this agent**: ux-strategy-minion determines information architecture and user journey coherence. Placing a compliance mapping page in the wrong nav section means the target audience never finds it.

### Cross-Cutting Checklist

- **Testing**: EXCLUDE from planning. This is documentation-only -- no code, no tests, no runtime changes. The docs site build (Eleventy) will catch broken links or template errors during Phase 6 if tests exist.
- **Security**: EXCLUDE from planning. No code changes, no new attack surface, no secrets, no auth changes. The content itself discusses security properties but doesn't create any.
- **Usability -- Strategy**: INCLUDED as Consultation 4 (ux-strategy-minion). Navigation placement and user journey for forensics examiner audience.
- **Usability -- Design**: EXCLUDE from planning. No new UI components, no visual design changes. The page uses the existing doc.njk layout.
- **Documentation**: INCLUDED as Consultations 1 and 2 (software-docs-minion and user-docs-minion). This IS the documentation task.
- **Observability**: EXCLUDE from planning. No runtime components, no services, no logging changes.

### Notable Exclusions

- **security-minion**: The SWGDE standard discusses security properties (hashing, configuration, contamination prevention), but WRL's security posture is not being changed -- only documented. The security whitepaper already covers these properties. Phase 3.5 mandatory review will still catch any security-sensitive claims in the documentation.
- **frontend-minion**: No UI components, no CSS changes, no interactive elements. The page uses existing Eleventy templates and Markdown rendering.
- **product-marketing-minion**: While positioning WRL against a forensics standard has marketing implications, the task is explicitly scoped to documentation with honest gap identification -- not marketing positioning. The vault docs (source of truth for positioning per CLAUDE.local.md) should be consulted during execution but don't need a planning consultation.

### Anticipated Approval Gates

1. **SWGDE compliance page structure and content** (software-docs-minion + user-docs-minion output): Hard to reverse (establishes the framing of how WRL maps to SWGDE), high blast radius (the three page updates depend on how the main page structures the mapping). MUST gate. This is the core deliverable and the framing decisions (how to handle automated-vs-manual gaps, what to claim, what to disclaim) will propagate into all cross-references.

2. **Navigation placement** (ux-strategy-minion recommendation): Easy to reverse (one line in site.js), but determines discoverability. NO gate -- fold into the execution plan approval.

### Rationale

This task is documentation-centric with a domain-specific audience (digital forensics examiners, attorneys). The four consultations cover:

- **Structure** (software-docs-minion): How to organize a compliance mapping page within an existing docs ecosystem with significant legal content.
- **Audience communication** (user-docs-minion): How to frame automated-vs-manual differences honestly for a forensics audience.
- **Discoverability** (seo-minion): Whether SWGDE terminology has SEO value and how to capture it.
- **Navigation** (ux-strategy-minion): Where the new page lives in the user journey.

The remaining specialists (security, test, observability, frontend, etc.) have no planning-phase value for a documentation-only task. They will participate in Phase 3.5 architecture review as mandatory reviewers where applicable.

### Scope

**In scope:**
- New file: `site/content/swgde-compliance.md` -- compliance mapping page
- Update: `site/content/legal-evidence.md` -- SWGDE cross-reference section
- Update: `site/content/verification.md` -- SWGDE cross-references for hash-related sections
- Update: `site/content/architecture.md` -- SWGDE cross-references for pipeline/contamination sections
- Update: `site/_data/site.js` -- navigation entry for new page
- SWGDE sections to map: 3.1, 3.4, 4.1, 4.2, 4.3, 7.2, 7.3, 7.5, 8.1.1, 9
- SEO: Natural integration of SWGDE terminology
- Evolution log entry for the phase

**Out of scope:**
- Code changes (no runtime, API, or pipeline changes)
- Claiming SWGDE certification (SWGDE does not certify products)
- Other SWGDE documents (only 21-F-001)
- Gap remediation (document gaps honestly, don't implement fixes)
- Landing page changes
- Security whitepaper updates

### External Skill Integration

#### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | WRL operations | Not relevant -- operational procedures, not documentation authoring |

#### Precedence Decisions

No external skills overlap with the specialists needed for this task. The ops-runbook skill is operational and has no bearing on documentation authoring.
