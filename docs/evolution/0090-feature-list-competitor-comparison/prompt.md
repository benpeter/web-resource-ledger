Feature list and competitor comparison table (#144)

**Outcome**: Prospective users can see at a glance how WRL compares to alternative web capture and archival approaches, making the value proposition concrete. A dedicated feature list and competition comparison table on the public site converts "what is this?" visitors into "I need this" users by showing WRL's cryptographic integrity advantage over every competitor. The feature list also highlights technical/developer capabilities (API, MCP server, Ed25519 signatures, WACZ format) so developer-minded visitors see that WRL is programmable and interoperable.

**Success criteria**:
- Landing site has a feature list section showing WRL's core capabilities (capture, signing, timestamps, verification, WACZ, MCP, scheduled captures)
- Feature list includes a technical/developer benefits subsection covering: REST API, MCP server, Ed25519 signatures, WACZ standard format, CLI verification tool, webhooks — with links to relevant docs pages
- Comparison table covers at least: Wayback Machine, PageFreezer, Hanzo, Page Vault, MirrorWeb, Stillio, Archive-It, Webrecorder, manual screenshots + notarization
- Table columns include: integrity approach, cryptographic signing, independent timestamps, public verification, API access, standard format (WACZ), eIDAS support
- Each competitor row is factually accurate (no strawmanning - cite what they actually provide)
- Table renders well on mobile (responsive)
- Hosted on both landing page (summary version) and docs site (full version with detailed notes)

**Scope**:
- In: Feature list section on landing page (including developer/technical benefits), full comparison table on docs site, summary comparison on landing page, links between the two
- Out: Blog posts about competitors, SEO landing pages per competitor, pricing comparison

**Constraints**:
- Pure HTML + CSS, no JS framework (consistent with existing landing page and docs site)
- Must match existing design system (design-system.css)
