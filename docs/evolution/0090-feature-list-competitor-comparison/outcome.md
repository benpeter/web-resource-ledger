# Outcome: Feature List and Competitor Comparison (#144)

## What Was Built

### Landing Page (`landing/public/index.html`)

**Feature list section ("What You Get")**: 10 features in two groups:
- Evidence Integrity (5): Full-fidelity capture, Ed25519 signing, RFC 3161 timestamps, eIDAS qualified timestamps, WACZ standard format
- Developer Experience (5): REST API + MCP server, scheduled captures, webhooks, CLI verification tool, public verification

Each feature is heading + description in a responsive grid (1→2→5 columns).
Links to docs comparison page via "See how WRL compares" CTA.

**Summary comparison table ("How WRL Compares")**: 4 competitors (Wayback Machine, PageFreezer, Webrecorder, Manual + Notarization) × 4 feature columns (Crypto Signing, Independent Timestamps, Public Verification, Open Format). Badge system (pass/fail/skip) for visual scanning. Links to full comparison on docs site.

**Navigation**: Added "Features" link between "Use Cases" and "How It Works" (5 content links + Sign in = 6 total, at scannable limit).

**Structured data**: Expanded SoftwareApplication JSON-LD from 8 to 15 feature items, added `applicationSubCategory` and `offers` schema.

**Background alternation fix**: Changed How It Works from `--muted` to `--white` to maintain white/muted/white/muted/white pattern across 5 content sections.

### Docs Site (`site/content/compare.njk`)

New Nunjucks page at `/compare/` with the full 9-competitor × 7-column comparison table:
- Competitors: Wayback Machine, PageFreezer, Hanzo, Page Vault, MirrorWeb, Stillio, Archive-It, Webrecorder, Manual Screenshots + Notarization
- Columns: Cryptographic Signing, Independent Timestamps, Public Verification, API Access, Standard Format, eIDAS Qualified, Open Source
- Per-competitor notes (H3 sections) with nuanced technical context
- Methodology section with "March 2026" verification date and GitHub issue link for corrections
- Cross-link back to landing page summary

Added "Compare" to docs site navigation (after Architecture, before Security & Compliance).

### CSS

**Landing** (`landing/public/css/landing.css`): `.features-grid` responsive grid, `.comparison-table` with mobile card-stack pattern via `data-label` + `::before`, badge styles.

**Docs** (`site/css/docs.css`): `.comparison-table-wrapper` with breakout margin for wide table, same mobile card-stack pattern adapted for docs context. Sync comments note intentional differences between landing and docs implementations.

## Files Changed (5 modified, 1 created)

- `landing/public/index.html` — feature list section, summary comparison table, nav link, JSON-LD expansion, background fix (+320/-6)
- `landing/public/css/landing.css` — feature grid, comparison table, mobile card-stack (+97)
- `site/content/compare.njk` — NEW: full comparison page (217 lines)
- `site/css/docs.css` — comparison table styles with mobile card-stack (+93)
- `site/_data/site.js` — added Compare nav entry (+1)

## Surface Consistency

| Surface | Action |
|---------|--------|
| **OpenAPI spec** | No update needed — no API changes |
| **Docs site** | Updated: new `/compare/` page, nav entry added |
| **Landing page** | Updated: feature list section, summary comparison table |
| **MCP server** | No update needed — no API changes |
| **Legal pages** | No update needed — no new data collection or services |

## Backlog Changes

- Updated #144 entry in Parking Lot / Product Features: marked as DONE (Phase 0090)
- Added [consider] item: Docs site SEO infrastructure (canonical tags, OG tags, BreadcrumbList) — deferred from this phase per decision #6

## Deviations from Plan

1. **aria-hidden on thead**: Initially added per accessibility-minion recommendation in Phase 3.5. Code review caught this was incorrect (`.sr-only` CSS already handles mobile hiding; attribute removed column headers from screen readers on desktop). Fixed in a follow-up commit.

2. **Sync comment wording**: Original comments said "equivalent pattern" between landing and docs CSS. Margo's code review correctly noted this was misleading since the patterns intentionally differ. Updated to "contexts differ intentionally, do not merge."

3. **Feature count**: Expanded from 8 features (initial plan) to 10 after Lucy's Phase 3.5 review caught that CLI verification tool and webhooks were explicitly required by #144 success criteria but missing from the synthesis.
