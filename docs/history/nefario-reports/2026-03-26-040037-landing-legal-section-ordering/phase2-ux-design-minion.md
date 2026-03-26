## Domain Plan Contribution: ux-design-minion

### Recommendations

#### Current State Assessment

The landing page currently buries its strongest differentiator. The legal standard references (FRE 901(b)(9), FRE 902(14), eIDAS Art. 41(2)) are nested inside a single "Legal Evidence" use-case card within a four-column grid. They appear as a bulleted list at small text size (`--text-sm`), visually equivalent to the other three use cases. For the target audience -- legal, compliance, and enterprise buyers -- these credentials are not a feature detail; they are the reason to trust the product. They should be surfaced much earlier.

#### Recommended Pattern: Compact Trust Strip Below the Hero

The most effective pattern for B2B SaaS compliance credentials is a **trust strip** -- a narrow, horizontally-oriented band that sits directly below the hero section and above "How It Works." This pattern works because:

1. **It occupies a natural visual pause.** After the hero's call-to-action, the eye scans downward. A trust strip catches this scan without requiring scroll commitment.
2. **It does not read as legal text.** Unlike a paragraph or bulleted list, a horizontal strip with short labels reads as a credential bar -- similar to "As seen in" logos or certification badges. The format signals authority, not terms-and-conditions.
3. **It respects the page rhythm.** The current flow is: Hero (dark bg) -> How It Works (white bg) -> Use Cases (muted bg). A trust strip can sit as a thin transition element between hero and How It Works, using the muted background to differentiate it from both adjacent sections without adding a heavy new section.

#### Specific Visual Design

**Layout: Horizontal label row, centered, single line on desktop, wrapping gracefully on mobile.**

Each standard gets a compact "chip" presentation:

```
[shield-icon] FRE 901(b)(9)     [shield-icon] FRE 902(14)     [shield-icon] eIDAS Art. 41(2)
   Evidence authentication          Self-authenticating              EU-qualified timestamps
```

Design details:

- **Container**: Full-width band with `--color-surface-muted` background, vertical padding of `--space-4` to `--space-6` (much thinner than a full landing section). No `scroll-margin-top` or section ID needed -- this is not a navigation target.
- **Layout**: Flexbox row, `justify-content: center`, `gap: var(--space-8)` between items. Each item is a flex column: bold standard reference on top (monospace or medium-weight sans), short plain-English descriptor below in `--text-sm` / `--color-text-muted`.
- **Optional shield icon**: A small inline SVG shield (16x16 or 20x20) to the left of each standard name. This is the "trust badge" pattern distilled to its minimal form. It adds visual credibility without being kitschy. Use `--color-accent` (#3d7c9a) for the shield fill -- it already exists in the design system and reads as authoritative/institutional.
- **No borders, no cards**: Each item should NOT be in its own card or bordered box. That creates visual heaviness. The items float as text in the strip. The background color change from hero to strip to white section provides sufficient visual grouping.
- **Leading text** (optional): A small centered label above the three items: "Standards alignment" or "Evidence standards" in `--text-xs`, uppercase, `--color-text-muted`, `letter-spacing: 0.06em` -- matching the existing `.site-footer__heading` treatment. This gives context without a full heading.

**Mobile (below 768px)**: Stack the three items vertically, left-aligned, with `gap: var(--space-4)`. The strip becomes a short vertical list. Each item remains compact (icon + name + descriptor on two lines).

**Desktop (1024px+)**: Single row, centered. The three items should fit comfortably within the 1120px container.

#### What Stays in the Use Cases Section

The Legal Evidence use-case card should remain but can be simplified. Instead of repeating the three standards with full explanations, it becomes a narrative card: "Screenshots get challenged. WRL captures produce signed, timestamped evidence bundles designed for courtroom authentication." with a link to the legal evidence docs page. The standards themselves are already introduced in the trust strip; the use-case card tells the story of why they matter.

This avoids the "wall of legal text" risk in both locations: the trust strip is too compact to feel like legal text, and the use-case card is now narrative rather than a list of statute numbers.

#### Alternative Patterns Considered (Not Recommended)

1. **Trust badges/shields as graphical icons**: Large shield graphics with standard names inside. Risks looking like generic "Norton Secured" badges that users have learned to ignore. Also requires custom SVG artwork that the current landing page does not have.

2. **Expandable details/accordion**: Hiding standards behind `<details>` elements reduces their visibility to exactly zero for scanners. The whole point of surfacing them is that they should be visible without interaction.

3. **Hero inline callout**: Putting standards references directly in the hero section (e.g., below the tagline). Too dense -- the hero's job is emotional/aspirational ("Web evidence you can prove"), not technical/credential. Mixing these dilutes both messages.

4. **Dedicated "Compliance" section**: A full landing section with heading, description, and cards for each standard. This over-invests page real estate in what should be a quick credibility signal. Save the deep explanation for the docs page (which already exists at `/legal-evidence/`).

5. **Banner/ribbon above the hero**: An alert-style banner pinned above the header. Reads as a promotion or warning, not a credential. Wrong semantic signal.

### Proposed Tasks

1. **Create trust strip HTML** -- Add a new `<section>` between the hero and "How It Works" with class `trust-strip`. Contains three items, each with an optional shield SVG, the standard reference, and a one-line descriptor. Aria: use `aria-label="Evidence standards"` on the section. The standard references are informational text, not interactive -- no special ARIA roles needed.

2. **Create trust strip CSS** -- New styles in `landing.css` under a new section comment block. Flexbox row layout, responsive breakpoint at 768px for stacking. Use existing design tokens exclusively. Estimated: ~40 lines of CSS.

3. **Create shield SVG icon** -- A simple, small (20x20 viewBox) shield outline in `--color-accent`. Inline in HTML (not an external file) for simplicity and to avoid an extra HTTP request. Keep it minimal: shield shape, no inner detail.

4. **Simplify Legal Evidence use-case card** -- Remove the `<ul class="use-case-details">` list of three standards. Replace with a concise narrative paragraph. Keep the docs link.

5. **Verify contrast** -- The trust strip text on `--color-surface-muted` (#f3f2f0) background: `--color-text` (#1e2a36) gives strong contrast. `--color-text-muted` (#6e6a66) on #f3f2f0 should be checked -- this combination is used extensively elsewhere on the page so presumably passes, but should be confirmed for the specific text sizes used in the strip.

6. **Test responsive behavior** -- Verify the strip works at 320px, 768px, and 1024px+ breakpoints. Ensure touch targets are not relevant here (no interactive elements in the strip).

### Risks and Concerns

1. **Legal accuracy of simplified claims.** Moving standard references to a prominent position increases their visibility and therefore the scrutiny they will receive. The one-line descriptors must be technically accurate. "Evidence authentication" for FRE 901(b)(9) and "Self-authenticating" for FRE 902(14) are reasonable shorthand, but a legal reviewer (not a design decision) should confirm these do not overstate what WRL provides. The current use-case card uses careful language ("designed to support authentication under") -- the trust strip descriptors should maintain similar precision even in compressed form.

2. **Implied certification risk.** Shield icons paired with legal standard numbers could be interpreted as "certified by" or "compliant with" these standards. WRL supports evidence authentication under these standards; it is not certified by any court or regulatory body. The visual treatment should avoid anything that reads as a certification mark. Using a generic shield icon (not a seal, not a checkmark-in-shield) and the word "alignment" rather than "compliance" or "certified" mitigates this.

3. **Contrast verification for muted text.** The `--color-text-muted` (#6e6a66) on `--color-surface-muted` (#f3f2f0) combination appears throughout the page already, but at `--text-sm` size in the trust strip, it should be verified against APCA Lc targets. Quick mental math: #6e6a66 is mid-gray (~L 0.47 in OKLCH), #f3f2f0 is near-white (~L 0.96). The delta of ~0.49 in L should reach Lc 60+ but should be confirmed with an actual APCA calculator rather than estimated.

4. **Section ordering change affects scroll anchors.** The nav links target `#how-it-works` and `#use-cases`. Adding the trust strip between hero and How It Works does not break these anchors, but it does push How It Works slightly further down the page. The `scroll-margin-top` on `.landing-section` should still work correctly since it is relative to the header height, not absolute position.

### Additional Agents Needed

- **Content/copy review**: The one-line descriptors for each standard need to be precise. Someone with legal domain knowledge should validate that the compressed phrasing does not overstate WRL's capabilities. This is a content accuracy concern, not a design concern.
- **Frontend minion**: To implement the HTML/CSS changes. The trust strip is straightforward vanilla CSS -- no framework or JS needed. Should be implementable within the existing design system tokens.
- **Accessibility minion**: Post-implementation, should verify the trust strip's contrast ratios at actual rendered sizes and confirm the section's landmark/heading structure does not disrupt the page's accessibility tree (since the strip intentionally omits an h2 heading, it should use `aria-label` on the section element instead).
