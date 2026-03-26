## Delegation Plan

**Team name**: landing-section-ordering
**Description**: Reorder landing page sections (Use Cases before How It Works) and resolve trust bar question. Implement changes and verify with Lighthouse.

### Conflict Resolution: Trust Bar

The key disagreement between specialists:

- **ux-strategy-minion + ux-design-minion**: Add a trust strip below hero with compact legal standard references (FRE 901/902, eIDAS, Ed25519, RFC 3161). Progressive disclosure -- signal first, detail later.
- **product-marketing-minion**: Opposes. Legal standard refs are proof points for only 2 of 6 priority segments. Leading with legal jargon narrows perceived audience. At most a subtle credibility line.

**Resolution: No trust bar. Side with product-marketing-minion.**

Why: The product-marketing argument is stronger on the evidence. The GTM plan identifies 6 priority segments, and FRE/eIDAS citations are meaningful to only 2 (Legal/E-discovery, Digital Forensics). The trust bar pattern works well when the credentials are universally relevant (like "SOC 2 Certified" for a B2B SaaS). Here, the credentials are segment-specific -- they are powerful proof points for the right audience but opaque jargon for everyone else. The current placement inside the Legal Evidence use case card is correct: it delivers the proof points exactly when the legal reader is evaluating fit, without imposing legal vocabulary on the page's primary narrative.

The ux-strategy argument about "legal audience needing to see vocabulary within 5 seconds" is valid, but the section reorder addresses this more effectively: moving Use Cases above How It Works means the Legal Evidence card (with its FRE/eIDAS references) becomes the first content section after the hero. Legal readers will find their vocabulary quickly without a trust bar.

Additionally, the ux-design-minion's proposal to simplify the Legal Evidence card (removing the standards list, replacing with narrative) would strip out the very detail that makes the card effective for its target audience. Rejected.

### Task 1: Reorder sections and update nav
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are modifying the WRL landing page to reorder sections and update navigation.

    ## What to do

    Make two changes to `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/silly-kindling-jellyfish/landing/public/index.html`:

    **1. Move the Use Cases section above How It Works.**

    Current order in the HTML:
    ```
    Hero → How It Works (#how-it-works, landing-section--white) → Use Cases (#use-cases, landing-section--muted) → Pricing
    ```

    New order:
    ```
    Hero → Use Cases → How It Works → Pricing
    ```

    Cut the entire `<!-- Use Cases -->` section (lines 149-188, from `<!-- Use Cases -->` comment through the closing `</section>`) and paste it before the `<!-- How It Works -->` section.

    **Important: Swap the background classes when reordering.** The page alternates white/muted backgrounds. After the move:
    - Use Cases (now first after hero) gets `landing-section--white` (was `--muted`)
    - How It Works (now second) gets `landing-section--muted` (was `--white`)

    This maintains the visual alternation: Hero (dark) → Use Cases (white) → How It Works (muted) → Pricing (white).

    **2. Update the nav link order to match.**

    In the `<nav aria-label="Main">` element, change the link order from:
    ```html
    <a href="#how-it-works">How It Works</a>
    <a href="#use-cases">Use Cases</a>
    ```
    to:
    ```html
    <a href="#use-cases">Use Cases</a>
    <a href="#how-it-works">How It Works</a>
    ```

    The Pricing, Docs, and Sign in links stay in their current positions.

    ## What NOT to do

    - Do NOT change any copy or content within sections
    - Do NOT add new sections, elements, or classes
    - Do NOT modify the CSS file
    - Do NOT add a trust bar or trust strip
    - Do NOT change the Legal Evidence use case card content
    - Do NOT modify the hero section
    - Do NOT change any IDs, aria attributes, or structured data

    ## Why

    All three specialists agreed: Use Cases answers "why should I care?" while How It Works answers "how does it work?" Leading with outcomes before mechanism follows Jobs-to-be-Done principles and improves the page for all audience segments. The section reorder also means legal/compliance readers encounter the Legal Evidence card (with its FRE/eIDAS references) earlier in the scroll, addressing the trust signal concern without needing a separate trust bar.

    ## Deliverables

    Modified file: `landing/public/index.html`

    ## Success criteria

    - Use Cases section appears before How It Works in the HTML source
    - Background classes alternate correctly (white → muted → white)
    - Nav links appear in order: Use Cases, How It Works, Pricing, Docs, Sign in
    - All anchor IDs (#use-cases, #how-it-works) are preserved unchanged
    - No other content changes
- **Deliverables**: Modified `landing/public/index.html` with reordered sections and nav
- **Success criteria**: Use Cases before How It Works, alternating backgrounds maintained, nav order matches section order

### Task 2: Lighthouse verification
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Run Lighthouse performance and accessibility audits on the modified landing page to verify the section reorder did not introduce regressions.

    ## What to do

    1. Serve the landing page locally. The landing page is static HTML in `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/silly-kindling-jellyfish/landing/public/`. Use any simple static file server (e.g., `npx serve landing/public` or Python's http.server).

    2. Run Lighthouse CLI against the local server:
    ```bash
    npx lighthouse http://localhost:<port>/ --output=json --output=html --output-path=/tmp/wrl-landing-lighthouse --only-categories=performance,accessibility
    ```

    3. Check the results:
       - Accessibility score should be 95+
       - Performance score should be 90+
       - No new accessibility violations related to heading order, landmark structure, or navigation

    4. If scores are below thresholds, investigate and report which specific audits failed.

    ## What NOT to do

    - Do NOT modify any files based on Lighthouse results -- just report findings
    - Do NOT run SEO or best-practices categories (out of scope)

    ## Deliverables

    Report the Lighthouse accessibility and performance scores. Flag any regressions.

    ## Success criteria

    - Accessibility score >= 95
    - Performance score >= 90
    - No heading-order warnings from the section reorder
- **Deliverables**: Lighthouse score report confirming no regressions
- **Success criteria**: Accessibility >= 95, Performance >= 90, no heading-order warnings

### Cross-Cutting Coverage

- **Testing**: No code logic changes -- this is a static HTML section reorder. Lighthouse verification (Task 2) covers accessibility and performance testing. No unit/integration tests needed.
- **Security**: No security surface changes. No new inputs, endpoints, auth flows, or dependencies. Excluded.
- **Usability -- Strategy**: Covered by ux-strategy-minion's planning contribution. The section reorder implements their primary recommendation. Trust bar was evaluated and rejected with documented rationale.
- **Usability -- Design**: Covered by ux-design-minion's planning contribution. The background class swap maintains visual rhythm. No new UI components being added (trust bar rejected).
- **Documentation**: No architectural or API changes. The evolution log (required by CLAUDE.md) will be handled by the calling session's post-execution phases. No dedicated documentation task needed within this plan.
- **Observability**: No runtime components affected. Excluded.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - accessibility-minion: The section reorder changes heading order in the DOM. Worth a quick check that the accessibility tree remains coherent, especially since the heading hierarchy (h2 for Use Cases, h2 for How It Works) stays flat but the landmark/section order changes.
    Review focus: Heading order in DOM after section swap, landmark structure, nav link order matching content order.
- **Not selected**:
  - ux-design-minion: No new visual elements being added. The background class swap is mechanical. Design review not needed for a section reorder.
  - sitespeed-minion: No new assets, scripts, or layout changes that would affect Core Web Vitals. Lighthouse in Task 2 covers performance.
  - observability-minion: No runtime components.
  - user-docs-minion: No user-facing documentation changes needed for a section reorder.

### Decisions

- **Trust bar: rejected**
  Chosen: No trust bar. Legal standard references remain only in the Legal Evidence use case card.
  Over: Trust strip below hero with compact standard badges (advocated by ux-strategy-minion and ux-design-minion).
  Why: Legal citations are meaningful to only 2 of 6 priority segments. The section reorder already moves legal proof points closer to the top of the page. Adding a trust bar with FRE rule numbers risks narrowing perceived audience for the 4 non-legal segments, and the product-marketing analysis of category perception risk (positioning WRL as a "legal compliance tool" rather than "web evidence infrastructure") is compelling.

- **Legal Evidence card content: preserved as-is**
  Chosen: Keep the detailed FRE/eIDAS bullet list in the Legal Evidence use case card.
  Over: Simplify the card to narrative-only, removing standard citations (advocated by ux-design-minion).
  Why: The bullet list with specific rule references is the card's primary value for its target audience. Removing them to avoid "density" would weaken the card for the legal segment that it specifically serves. The card is one of four in a grid -- density in one card does not overwhelm the section.

### Risks and Mitigations

1. **Background alternation after reorder** -- Swapping sections without swapping background classes would create two consecutive same-colored sections (muted → muted or white → white). Mitigated by explicitly including background class swap in the task prompt.

2. **Legal credibility signal timing** -- By rejecting the trust bar, legal/compliance visitors must scroll past the hero to find legal vocabulary. Mitigated by the section reorder itself: the Legal Evidence card is now the first content card after the hero, significantly reducing scroll distance to legal proof points.

3. **Use case card order within grid** -- product-marketing-minion noted that if the primary growth segment is developers (AI Agent Grounding), that card should perhaps be first rather than Legal Evidence. This is a separate business strategy decision, explicitly out of scope for this task.

4. **eIDAS accuracy concern** -- product-marketing-minion flagged that eIDAS Art. 41(2) references may overstate current capabilities if qualified timestamps are not yet shipping. This is a copy accuracy question, out of scope for this section-ordering task, but flagged for follow-up.

### Execution Order

```
Batch 1 (sequential):
  Task 1: Reorder sections and update nav
  Task 2: Lighthouse verification (blocked by Task 1)
```

Single approval gate: none. Both changes are easily reversible (additive HTML reorder) with zero downstream dependents.

### Verification Steps

1. Visual inspection: Open index.html in a browser. Confirm Use Cases appears after hero, How It Works appears after Use Cases.
2. Scroll test: Confirm smooth scroll from nav links lands on correct sections.
3. Background alternation: Confirm visual pattern is hero (dark) → use cases (white) → how it works (muted) → pricing (white).
4. Anchor stability: Confirm `#use-cases` and `#how-it-works` anchors still work correctly.
5. Lighthouse: Accessibility >= 95, Performance >= 90 (Task 2).
