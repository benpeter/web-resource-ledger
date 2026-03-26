# Decisions: Landing Page Legal Claims and Section Ordering

## Decision 1: No Trust Bar

**Chosen**: No trust bar or trust strip added. Legal standard references (FRE 901/902, eIDAS) remain only in the Legal Evidence use case card.

**Over**: Trust strip below hero with compact standard badges showing FRE 901(b)(9), FRE 902(14), eIDAS Art. 41(2) with shield icons and plain-English descriptors.

**Advocates**: ux-strategy-minion and ux-design-minion recommended the trust bar for progressive disclosure — signal legal vocabulary early, detail later.

**Why rejected**: product-marketing-minion's analysis was more compelling:
- Legal citations are meaningful to only 2 of 6 priority audience segments
- Leading with legal rule numbers risks repositioning WRL as a "legal compliance tool" rather than "web evidence infrastructure"
- The section reorder (Decision 2) already moves the Legal Evidence card much closer to the top of the page, addressing the "legal readers need vocabulary early" concern without a dedicated element
- Trust bar pattern works well when credentials are universally relevant (e.g., "SOC 2 Certified"); FRE/eIDAS rule numbers are segment-specific

## Decision 2: Use Cases Above How It Works

**Chosen**: Section order changed to Hero → Use Cases → How It Works → Pricing

**Over**: Original order Hero → How It Works → Use Cases → Pricing

**Why**: All three specialists agreed unanimously. Use Cases answers "why should I care?" (outcomes, jobs-to-be-done). How It Works answers "how does it work?" (mechanism). Leading with outcomes before mechanism follows JTBD principles and serves all audience segments better. The current order forced all visitors through a technical process explanation before showing them what the product is for.

## Decision 3: Legal Evidence Card Content Preserved

**Chosen**: Keep the detailed FRE/eIDAS bullet list in the Legal Evidence use case card exactly as-is.

**Over**: Simplify the card to narrative-only, removing specific standard citations (proposed by ux-design-minion).

**Why**: The bullet list with specific rule references is the card's core value for its target audience. Legal professionals and compliance officers need to see the exact standards supported. Removing them to reduce visual density would weaken the card for the segment it specifically serves. The card is one of four in a grid — density in one card does not overwhelm the section.
