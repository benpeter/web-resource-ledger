# Outcome: Segment-Targeted FAQ Expansion

## What changed

### `landing/public/index.html`

- **FAQ section** (lines 637-695): Restructured from `<dl>`/`<dt>`/`<dd>` to
  `<details>`/`<summary>`/`<p>`. Expanded from 4 to 12 questions covering
  legal/e-discovery, OSINT/investigations, compliance, and brand protection.
  All items collapsed by default. BEM class names preserved.

- **FAQPage JSON-LD** (lines 156-260): Expanded from 4 to 12 entries. Plain
  text answers (40-80 words each). Question names match visible summary text
  exactly.

- **Meta description** (line 7): Changed from generic product description to
  segment-targeted: "Forensic web capture with Ed25519 signatures and RFC 3161
  timestamps. Defensible evidence bundles with chain of custody anyone can
  verify."

### `landing/public/css/landing.css`

- Modified `.faq__question`: Added `list-style: none`, `cursor: pointer`,
  `display: flex`, `align-items: baseline`, `justify-content: space-between`,
  `gap`. Changed margin to 0 (answer handles top spacing).
- Modified `.faq__answer`: Added `padding-top: var(--space-3)`.
- Added: `::-webkit-details-marker { display: none }` to remove default
  disclosure triangle.
- Added: `::after` pseudo-element with `+`/`-` indicator for expand/collapse.
- Added: `focus-visible` keyboard focus ring.

### `landing/public/sitemap.xml`

- Updated index page `<lastmod>` from 2026-03-23 to 2026-03-27.

## 12 Questions (final order)

1. Why is a screenshot not enough for digital evidence? (reworded)
2. Is web capture evidence admissible in court? (reworded, hedging fixed)
3. Can I verify a capture without an account? (unchanged)
4. What is forensic web capture? (NEW -- OSINT/forensics)
5. What is chain of custody for digital evidence? (NEW -- legal/forensics)
6. What is defensible web collection? (NEW -- legal/e-discovery)
7. How do I preserve website evidence for litigation? (NEW -- legal)
8. How do OSINT investigators preserve web evidence? (NEW -- OSINT)
9. How do I archive web pages for regulatory compliance? (NEW -- compliance)
10. How do I document online trademark infringement? (NEW -- brand)
11. What is an audit trail for web content? (NEW -- compliance/GRC)
12. Can I self-host WRL? (unchanged)

## Key correctness properties

- No TSA provider names (Sectigo/AlfaSign/DigiCert) appear anywhere
- FRE 902(14) uses "provides the technical foundation" (overclaim fixed)
- SWGDE uses "aligns with best practices" (not "compliant" or "certified")
- Chain of custody scoped to capture-through-signing only
- Every legally-relevant answer includes counsel hedging
- Zero JavaScript added; zero dependencies added

## Surface consistency

| Surface | Action |
|---------|--------|
| **OpenAPI spec** | No update needed -- no API changes |
| **Docs site** | No update needed -- FAQ links to existing docs pages; all link targets verified as adequate |
| **Landing page** | Updated (this PR) |
| **MCP server** | No update needed -- no API changes |
| **Legal pages** | No update needed -- no new data collection or processing |

## Deferred work (added to parking lot)

- DMCA takedown question: deferred until supporting docs page exists
- Sectigo-to-AlfaSign docs updates: whitepaper, subprocessors, DPA still
  reference Sectigo (FAQ avoids naming any TSA provider)
- FAQ/JSON-LD drift prevention CI check: HTML comment added as manual
  safeguard; automated lint deferred
- Title tag change: broader implications warrant separate evaluation
- Docs anchor verification: would require docs site build + link checker;
  FAQ uses page-level links to avoid fragility

## Backlog changes

- No existing backlog items completed by this phase (issue #255 was not in
  the backlog -- it's a GTM research deliverable)
- Added to parking lot: DMCA takedown FAQ question, FAQ/JSON-LD drift CI
  check, title tag evaluation
- No items removed or tier-changed
