# Meta-Plan: Landing Page Legal Claims and Section Ordering

## Task Summary

Evaluate and optimize the placement of legal/compliance claims (FRE 901(b)(9), FRE 902(14), eIDAS Art. 41(2)) and the "How It Works" section on the WRL landing page. Currently, legal claims are buried in a Use Cases card, and "How It Works" sits directly below the hero. The question is whether reordering these sections would improve trust-building and conversion.

## Planning Consultations

### Consultation 1: Content Hierarchy and Trust Signaling Strategy
- **Agent**: ux-strategy-minion
- **Planning question**: For a product whose primary value proposition is legal/evidentiary trust, what is the optimal information hierarchy? Specifically: (a) Should legal standard references (FRE 901/902, eIDAS) appear as trust signals in or near the hero, or does front-loading legalese create cognitive overload that undermines the "simple and approachable" first impression? (b) Should "How It Works" (a process explanation) sit between the hero and the value propositions (use cases), or does it delay the emotional payoff of seeing concrete use cases? Consider the two primary audience segments: technical integrators (developers, DevOps) and decision-makers (legal counsel, compliance officers).
- **Context to provide**: Current index.html section order (Hero > How It Works > Use Cases > Pricing), the legal claims content currently in the Legal Evidence use case card, hero tagline text.
- **Why this agent**: UX strategy owns information architecture, cognitive load assessment, and user journey coherence. This is fundamentally a question about what information to surface when and to whom.

### Consultation 2: Trust Badge and Visual Hierarchy Patterns
- **Agent**: ux-design-minion
- **Planning question**: If we decide to surface legal claims higher on the page, what are effective visual patterns for presenting compliance/legal references without making them feel like a wall of legal text? Consider: trust badges/shields, compact reference strips, expandable details, or inline callouts in the hero or a dedicated trust section. What patterns work for B2B SaaS landing pages where compliance credentials are a key differentiator?
- **Context to provide**: Current landing page HTML structure, CSS design system (design-system.css and landing.css), the specific claims (FRE 901(b)(9), FRE 902(14), eIDAS Art. 41(2)).
- **Why this agent**: UX design owns visual hierarchy, component design, and interaction patterns. If claims move up, the visual treatment matters as much as the position.

### Consultation 3: Product Positioning Impact
- **Agent**: product-marketing-minion
- **Planning question**: WRL targets both US (FRE) and EU (eIDAS) legal frameworks. From a positioning perspective: (a) Do legal standard references strengthen or weaken the hero's first impression for each audience segment? (b) Is there a risk that leading with legal jargon narrows the perceived audience (scares off the "journalism" and "AI agent" segments)? (c) Should the landing page lead with the technical mechanism (How It Works) or the outcomes (Use Cases) to maximize perceived value across all four use case segments?
- **Context to provide**: The four use case segments (Legal Evidence, Compliance Archiving, AI Agent Grounding, Journalism), current hero copy, current section order.
- **Why this agent**: Product marketing owns positioning, messaging hierarchy, and audience segmentation. This task is fundamentally about which message hits first for which audience.

## Cross-Cutting Checklist

- **Testing**: No -- this task is HTML/CSS section reordering. No executable logic changes. Visual verification via Lighthouse is sufficient (and explicitly in success criteria).
- **Security**: No -- no new attack surface, no auth changes, no user input handling. Pure content reordering.
- **Usability -- Strategy**: ALWAYS include -- see Consultation 1 above. This is the core question.
- **Usability -- Design**: Include -- see Consultation 2 above. If claims move, visual treatment is critical.
- **Documentation**: No for planning. If changes are made, the evolution log captures decisions. No user-facing docs or API surface changes.
- **Observability**: No -- no runtime components, no services, no APIs affected.

## Notable Exclusions

- **accessibility-minion**: The success criteria already require Lighthouse accessibility checks. Section reordering does not introduce new a11y patterns -- existing semantic HTML (sections, headings, landmarks) remains intact. Will be included in Phase 3.5 architecture review if the plan involves new UI components.
- **frontend-minion**: No framework code, no build tooling, no state management. This is vanilla HTML/CSS editing. If the execution plan involves new CSS components (e.g., trust badges), frontend-minion may be added at synthesis.
- **seo-minion**: Scope explicitly excludes SEO metadata. Section reordering within the same page does not affect crawlability or structured data. The existing schema.org markup already lists FRE support in featureList.

## Anticipated Approval Gates

1. **Section ordering decision** (MUST gate): The decision on where legal claims go and whether "How It Works" moves is hard to reverse once implemented (it shapes the entire page flow) and all implementation tasks depend on it. This is the key decision point -- ux-strategy, ux-design, and product-marketing should converge on a recommendation before any HTML is touched.

## Rationale

This task sits at the intersection of three domains: information architecture (ux-strategy), visual design (ux-design), and messaging hierarchy (product-marketing). The technical implementation is straightforward HTML/CSS reordering, but the *decision* of what to move where requires domain expertise from all three perspectives. Each agent brings a different lens: ux-strategy on cognitive load and user journeys, ux-design on visual treatment options, and product-marketing on audience segmentation and positioning.

## Scope

- **In scope**: Hero banner content augmentation (trust signals), legal/compliance claims placement, "How It Works" section position relative to Use Cases, decision documentation.
- **Out of scope**: Copy rewrites (wording changes beyond moving existing text), new sections, mobile-specific layout changes, SEO metadata, pricing section changes.

## External Skill Integration

### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | .claude/skills/ops-runbook/ | LEAF | Infrastructure operations | Not relevant -- skip |

### Precedence Decisions

No external skills overlap with the task domain. No precedence decisions needed.
