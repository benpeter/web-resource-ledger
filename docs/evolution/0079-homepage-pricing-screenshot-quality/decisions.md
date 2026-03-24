# Decisions — 0079 Homepage Pricing & Screenshot Quality

## Decision 1: 2-card hybrid layout over 3-card plan model

**Chosen**: Two cards (usage-based pricing + enterprise) with graduated tier tables inside the featured card.

**Over**: (a) Keeping 3 cards repurposed (captures/eIDAS/enterprise) — frontend-minion recommended against this because the actual pricing is graduated, not plan-based, and 3 cards would misrepresent it as competing plans. (b) Single full-width pricing table — rejected because it buries the free tier and the enterprise option.

**Why**: The Stripe configuration has graduated usage-based pricing, not named tiers. Two cards match the actual product structure: one for usage (captures + eIDAS) and one for enterprise/on-premise.

## Decision 2: Show "Pay as you go" badge on mobile

**Chosen**: Remove the mobile `display: none` override so the `::before` badge is visible on all viewports (Option A from the architecture review advisory).

**Over**: Keeping it hidden on mobile (Option B).

**Why**: "Pay as you go" is a pricing model descriptor, not marketing decoration. On a narrow viewport where a user is evaluating whether to sign up, that label carries meaningful information. The card title provides context but the badge reinforces the model at a glance.

## Decision 3: deviceScaleFactor 4 despite reviewer concerns

**Chosen**: deviceScaleFactor set to 4 as requested by the issue spec.

**Over**: Keeping deviceScaleFactor at 2 (recommended by all three code reviewers citing OOM risk on tall pages and the project's own prior security review).

**Why**: The issue explicitly states "Accept the tradeoff of larger file sizes" and requests deviceScaleFactor 4. The bitmap rendering happens in Cloudflare's Browser Rendering sandbox, not in Worker memory (the Worker receives the PNG-encoded result). The MAX_PAGE_HEIGHT cap (8000px) bounds the worst case. Most real pages are 2000-4000px tall. The concern is documented for monitoring.

## Decision 4: Reuse badge--pass for "Free" labels

**Chosen**: Use existing `badge badge--pass` (green) for "Free" labels in pricing tables.

**Over**: Creating a new `badge--free` variant.

**Why**: YAGNI — the green badge visually communicates "good/positive" which aligns with "Free". Creating a new badge variant for a single use case would be over-engineering. If the design system evolves, a dedicated variant can be added later.
