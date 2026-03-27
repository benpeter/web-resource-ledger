Expand the landing page FAQ section from the current 4 generic questions to 10-12 segment-targeted questions that match the exact search terms used by WRL's key market segments: legal/e-discovery, OSINT/investigations, compliance, and brand protection. Add corresponding FAQPage JSON-LD structured data so answers surface in Google rich results and AI-generated overviews.

Source: GitHub issue #255

## Scope

### In scope

- New FAQ questions targeting segment search terms from the Language Gap analysis:
  - Legal/e-discovery: "Are screenshots admissible in court?", "How to preserve website evidence for litigation", "What is defensible web capture?", "What is chain of custody for digital evidence?"
  - OSINT/investigations: "What is forensic web capture?", "How do OSINT investigators preserve web evidence?"
  - Compliance: "How to archive web pages for regulatory compliance?", "What is an audit trail for web content?"
  - Brand protection: "How to document online trademark infringement?", "How to collect evidence for DMCA takedowns?"
- Update FAQPage JSON-LD in `<head>` to include all new questions (must match visible FAQ content exactly)
- Maintain existing 4 FAQ questions -- expand, don't replace
- Accordion/disclosure pattern (optional) -- if 10+ items make the section too long, consider `<details>`/`<summary>` for progressive disclosure
- CSS updates in `landing.css` as needed for the expanded section
- Responsive and accessible -- keyboard-navigable, semantic HTML, screen reader friendly

### Out of scope

- Changes to other landing page sections
- FAQ on the docs site
- Blog posts or long-form content
- A/B testing infrastructure
- Analytics tracking for FAQ interactions
- Changing the nav

## Acceptance Criteria

- FAQ section contains 10-12 questions spanning legal, OSINT, compliance, and brand protection segments
- Each question uses natural search language (buyer terminology, not internal product terminology)
- FAQPage JSON-LD includes all visible FAQ questions and passes Google Rich Results Test
- Visible FAQ content and JSON-LD content match exactly (no drift)
- FAQ section is responsive across mobile/tablet/desktop breakpoints
- FAQ answers are concise (2-4 sentences), factually accurate, and link to relevant docs pages where appropriate
- Lighthouse SEO score is not degraded
- Existing 4 FAQ questions are preserved (may be reworded to better match search terms)
