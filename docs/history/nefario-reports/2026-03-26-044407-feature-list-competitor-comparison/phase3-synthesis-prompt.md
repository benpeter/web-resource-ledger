MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Feature list and competitor comparison table for WRL landing page and docs site (#144).

Success criteria:
- Landing site has feature list section with core capabilities + developer/technical benefits
- Comparison table covers 9+ competitors with 7+ columns
- Factually accurate competitor rows
- Responsive on mobile
- Landing page (summary) + docs site (full version with notes)
- Pure HTML + CSS, no JS framework, match design-system.css

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0ldPyr/feature-list-competitor-comparison/phase2-product-marketing-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0ldPyr/feature-list-competitor-comparison/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0ldPyr/feature-list-competitor-comparison/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0ldPyr/feature-list-competitor-comparison/phase2-seo-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0ldPyr/feature-list-competitor-comparison/phase2-software-docs-minion.md

## Key consensus across specialists:

1. product-marketing-minion: WRL's unique differentiator is Ed25519+RFC3161+public verification enabled by default. Feature list as "Evidence Integrity" (4 items) + "Developer Experience" (4 items). Landing gets 4x4 summary table, docs gets full 7x10 matrix. 3 competitor claims need verification.
2. ux-strategy-minion: Place Features after Use Cases, Compare after How It Works. ~200 words total on landing. Full table on docs only. Add "Features" to nav, not "Compare". Word budget is critical.
3. frontend-minion: Card-stack pattern for mobile responsive. Landing 5-column summary, docs full 8-column. Docs page must be .njk for data-label attributes. No design-system.css changes needed. Docs content column too narrow (42rem) -- needs breakout wrapper.
4. seo-minion: Expand SoftwareApplication featureList. Docs has zero SEO infrastructure. Self-canonicalize both pages. Docs template SEO improvements are out of scope for this task.
5. software-docs-minion: Single page at /compare/, nav position 11 (after Architecture, before Security), label "Compare".

## External Skills Context

No external skills detected.

## Instructions

1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt

Key decisions to resolve:
- Landing comparison format: pm says 4x4, frontend says 5-column, ux says 3-4 columns. Pick one.
- Docs SEO improvements: seo-minion wants template-level fixes. This is scope creep -- defer to backlog or include?
- Section ordering: ux-strategy says Features after Use Cases, Compare after How It Works. Validate against product-marketing's messaging strategy.
- Nav links: ux says add "Features" but not "Compare". Confirm.
- Word budget: ux says ~200 words max on landing for both new sections combined. Ensure tasks respect this.

6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0ldPyr/feature-list-competitor-comparison/phase3-synthesis.md
