## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### 1. Section Placement: Features after Use Cases, Comparison after How It Works

The current narrative arc is: **Why this matters** (Use Cases) > **How it works** (mechanism) > **What it costs** (Pricing). This maps to the classic JTBD decision journey: understand the job, understand the solution, evaluate the price.

Features and comparison serve different functions in this arc:

- **Feature list** answers "what exactly do I get?" -- this is a *performance features* question (Kano) that naturally follows "why would I care?" (Use Cases). Place it between Use Cases and How It Works.
- **Comparison table** answers "why this over alternatives?" -- this is a *switching cost* evaluation that only matters after the visitor understands both what WRL does and how. Place it between How It Works and Pricing.

Proposed flow: **Hero > Use Cases > Features > How It Works > Compare > Pricing**

Rationale: Pricing must remain the final section before conversion. It is the natural terminus -- the visitor has all the information they need and the CTA follows. Moving pricing away from the bottom would break the conversion funnel.

#### 2. Content Density: Landing Gets Summaries, Docs Gets Depth

**Landing page principle: signal, not data.** The current page works because every section can be scanned in under 10 seconds. Adding a 7x9 table would violate this. Hick's Law tells us that 63 cells of comparison data will increase decision time, not reduce it.

**Feature list on landing:** 6-8 items maximum, grouped into 2 clear categories (e.g., "Evidence Integrity" and "Developer Experience"). Each item: a short heading + one sentence. No icons, no elaborate cards. Match the density of the existing Use Cases cards. Link to a full features page on docs.

**Comparison table on landing:** Do NOT put the full 7-column, 9-row table on the landing page. Instead, use a **"highlight comparison"** format:
- Show WRL vs. the 2-3 most recognizable competitors (not all 9)
- Show only the 3-4 most differentiating columns (the ones where WRL wins clearly)
- Use checkmarks/crosses for boolean features, short text for non-boolean
- End with a clear link: "See full comparison with 9 services" pointing to docs

This applies progressive disclosure correctly: the landing summary creates enough differentiation to sustain interest, while the full table is available for visitors in deep evaluation mode.

**Docs site:** Host the complete feature list and the full 9-competitor, 7-column comparison table. These pages serve the bottom-of-funnel evaluator who has already decided this category is relevant and is now comparing options systematically. This audience expects and benefits from data density.

#### 3. Landing Summary Formats

**Feature list format:** A simple two-column grid of feature items (heading + one line of body text). No cards with borders -- cards create visual weight and the page already uses cards for Use Cases. Use a lightweight list or definition-list pattern instead. This creates visual contrast between sections and prevents card fatigue.

**Comparison summary format:** A condensed table with 3-4 columns and 3-4 rows. Keep cells tight: checkmark, cross, or a 2-3 word descriptor. The table header row should be visually distinct. Include a footnote-style link to the full comparison.

Avoid: carousel/tabs for comparison (hidden content doesn't compare), feature cards with icons (icon-shopping adds cognitive load without aiding comprehension), animated reveals (the page has none currently -- introducing them would break consistency).

#### 4. Navigation: Add Features, Skip Compare

The header nav currently has 5 items. Nielsen's research and Hick's Law both suggest keeping primary navigation to 5-7 items. Adding both new sections would push to 7, which is the upper bound.

Recommendation:
- **Add "Features" to nav** -- it is a primary decision factor and visitors actively look for it. Place it after "Use Cases": `Use Cases | Features | How It Works | Pricing | Docs | Sign in`
- **Do NOT add "Compare" to nav** -- comparison is a secondary evaluation step, not a primary navigation target. Visitors who want it will scroll to it naturally (it sits between How It Works and Pricing). Adding it to nav would create 7 items plus the Sign in button, pushing into crowded territory.

On the docs site, the comparison page should appear in the docs sidebar navigation where data-dense reference content belongs.

#### 5. Cognitive Load Management

The current page has approximately 4 decision units (sections). Adding 2 more increases cognitive load by 50%. Mitigation strategies:

**Visual rhythm:** Alternate background treatments (white/muted) as the page already does. Features should get the muted background (matching How It Works' current treatment), and Compare should get white. This maintains the visual breathing pattern.

**Section headers do the heavy lifting:** Each section header should be scannable and self-sufficient. A visitor scrolling fast should get the gist from headers alone: "Built for teams who need proof" > [features header] > "How It Works" > [compare header] > "Pricing". The headers for Features and Compare need to be as strong as the existing ones.

**Word budget:** The landing page currently has roughly 450 words of body content (excluding nav/footer). Adding features and comparison summaries should not exceed 200 additional words combined. That means: ~8 feature items at ~15 words each (120 words) + comparison intro + table labels (~80 words). The full content lives on docs.

**Clear exit ramps:** Both new sections must have a prominent "See full [features/comparison] on docs" link. This serves two purposes: (a) progressive disclosure for deep evaluators, and (b) a clear signal to casual scanners that "you've seen enough, scroll on."

### Proposed Tasks

1. **Determine landing feature list content** -- Select 6-8 features, grouped into 2 categories. Write heading + one-sentence description for each. Constraint: ~120 words total.

2. **Determine landing comparison subset** -- Select 3-4 competitors and 3-4 columns for the landing summary table. Criteria: competitors visitors will recognize, columns where WRL differentiates clearly.

3. **Write full feature list for docs site** -- Complete feature inventory with descriptions, organized by category. This is the canonical reference that the landing page links to.

4. **Write full comparison table for docs site** -- All 9 competitors, all 7 columns, with methodology notes explaining how each cell was determined (transparency builds trust in comparison claims).

5. **Implement landing page HTML/CSS for both sections** -- Features section between Use Cases and How It Works. Comparison summary between How It Works and Pricing. Maintain existing visual rhythm (alternating white/muted backgrounds).

6. **Update header navigation** -- Add "Features" link between "Use Cases" and "How It Works". Do not add "Compare" to nav.

7. **Cross-link between landing and docs** -- Each landing summary section links to its full docs counterpart. Docs pages link back to landing for visitors arriving directly.

### Risks and Concerns

**Risk: Scope creep into marketing copy.** Feature lists and comparison tables are inherently marketing artifacts. The current landing page succeeds because it reads as honest and technical, not salesy. Every feature claim and comparison cell must be verifiable. Comparison tables that cherry-pick dimensions to make the product look good erode trust with technical audiences. Mitigation: include methodology notes on the docs comparison page; only compare on dimensions where the data is objectively verifiable.

**Risk: Comparison table maintenance burden.** 9 competitors x 7 columns = 63 data points that can go stale. Competitors ship features, change pricing, pivot. A stale comparison table is worse than no table -- it signals neglect. Mitigation: date-stamp the comparison ("Last verified: [date]") and build a lightweight review cadence. Consider whether 9 competitors is the right number -- 5-6 may be sufficient and more maintainable.

**Risk: Breaking the page's conversion simplicity.** The current page is a 4-section funnel. Adding 2 sections means 50% more scrolling. On mobile, this is significant. Mitigation: keep landing summaries extremely concise (the word budget constraint above), ensure each section earns its scroll-depth with clear value, and verify with analytics that scroll-depth to Pricing doesn't degrade after launch.

**Risk: Feature list overlapping with Use Cases.** Features and use cases can blur together. "Ed25519 signatures" is a feature; "Legal Evidence" is a use case that implies features. If the feature list merely re-states what Use Cases already communicates, it adds length without value. Mitigation: Use Cases should remain outcome-focused ("what you can do"), Features should be capability-focused ("what's in the box"). Review both sections together to eliminate redundancy.

### Additional Agents Needed

- **ux-design-minion** -- Needed for the visual design of both landing sections: feature list layout pattern, condensed comparison table styling, responsive behavior (the comparison table on mobile is a known hard problem), and ensuring visual consistency with existing sections.
- **content-strategy or copywriting specialist** -- The feature list headings and one-liners need to be precise and differentiated. The comparison table column headers need to be unambiguous. This is specialized writing that benefits from dedicated attention.
- **research/competitive-analysis specialist** -- Verifying the 63 data points in the full comparison table requires systematic research into each competitor's current capabilities. Claims must be accurate as of publication date. This is not a UX task -- it is a research task.
