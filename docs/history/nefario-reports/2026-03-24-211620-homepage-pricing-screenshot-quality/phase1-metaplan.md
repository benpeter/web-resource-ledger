# Meta-Plan: Homepage Pricing & Screenshot Quality

## Task Summary

Two small, independent fixes:
1. Replace "coming soon" placeholder pricing on the homepage with real tier pricing matching Stripe configuration
2. Increase Playwright screenshot `deviceScaleFactor` from 2 to 4 for higher-resolution captures

## Planning Consultations

### Consultation 1: Pricing Section Restructure
- **Agent**: frontend-minion
- **Planning question**: The current pricing section uses a 3-card layout (Explore/Free, Evidence/Pro, On-Premise/Enterprise) with "Coming soon" badges. The new pricing model is graduated usage-based (captures: 4 tiers, eIDAS: 2 tiers). This doesn't map to 3 named plans anymore -- it's a single usage-based model with free tiers. What's the best way to restructure the HTML/CSS to present graduated pricing clearly? Should we keep the 3-card layout (repurposed), switch to a pricing table, or use a different pattern? The existing CSS classes are in `landing/public/css/landing.css` (lines 423-499) and the HTML is in `landing/public/index.html` (lines 190-229).
- **Context to provide**: Current HTML structure (3 cards with tier names, badges, prices, descriptions), CSS grid layout (3-col at 768px+), the graduated pricing tiers from Stripe config, the constraint that free tier allowances must be prominently communicated.
- **Why this agent**: frontend-minion knows HTML/CSS layout patterns and can recommend the right structural approach for presenting graduated pricing without over-engineering.

### Consultation 2: Pricing Information Architecture
- **Agent**: ux-strategy-minion
- **Planning question**: The current pricing section communicates "coming soon" across 3 named tiers (Explore, Evidence, On-Premise). The actual model is simpler: usage-based with free tiers. From a user journey perspective, what information hierarchy best serves someone evaluating WRL? Should the free tier be the hero (lead with "free to start"), should we emphasize the per-capture cost, or should we present the full graduated table? The On-Premise/Enterprise card is still relevant but separate from the usage-based model. How should it relate to the usage pricing?
- **Context to provide**: The homepage flow (hero -> how it works -> use cases -> pricing -> footer), the target audience (developers, journalists, legal teams), the graduated pricing tiers, the fact that eIDAS timestamps are an optional add-on.
- **Why this agent**: ux-strategy-minion ensures the pricing presentation serves the user's decision-making journey rather than just dumping numbers on the page.

### Cross-Cutting Checklist

- **Testing**: EXCLUDE from planning. Fix 1 is static HTML -- visual verification suffices. Fix 2 is a single numeric constant change (`deviceScaleFactor: 2` to `4`) with no logic change. Existing test infrastructure handles both. No test strategy input needed for planning.
- **Security**: EXCLUDE from planning. Neither change introduces attack surface, handles auth, processes user input, or manages secrets. Fix 1 is static content. Fix 2 is a rendering parameter.
- **Usability -- Strategy**: INCLUDE -- see Consultation 2 above (ux-strategy-minion). Pricing presentation directly impacts user conversion decisions.
- **Usability -- Design**: EXCLUDE from planning. The design question here is structural (information architecture), not visual. The existing design system (cards, badges, typography) provides the building blocks. If frontend-minion's proposed restructure is significant, ux-design-minion can review at execution time, but planning input is not needed.
- **Documentation**: EXCLUDE from planning. Neither fix changes API surface, architecture, or user-facing documentation. Pricing is already self-documenting on the homepage. Phase 8 assessment will confirm.
- **Observability**: EXCLUDE from planning. No runtime components are being created or modified in a way that affects logging/metrics/tracing. The `deviceScaleFactor` change is a rendering parameter, not an observable system change.

### Notable Exclusions

- **ux-design-minion**: The pricing section already has established CSS/design system patterns. The question is information architecture (ux-strategy-minion's domain), not visual design. If the structural change is large, ux-design-minion reviews at Phase 3.5.
- **api-design-minion**: Pricing display is static HTML, not an API contract change. Stripe integration code is explicitly out of scope.
- **sitespeed-minion**: Increasing `deviceScaleFactor` to 4 produces larger screenshots, but this is an accepted tradeoff per the task brief. No performance budget analysis needed for a deliberate size increase.

### Anticipated Approval Gates

**None anticipated.** Both changes are low blast radius and easy to reverse:
- Fix 1: Additive HTML/CSS content change with 0 downstream dependents in this plan.
- Fix 2: Single numeric constant change with 0 downstream dependents in this plan.

The only judgment call is how to restructure the pricing cards, which is why frontend-minion and ux-strategy-minion are consulted for planning. Once they align on an approach, execution is straightforward.

### Rationale

This is a small, well-scoped task with two independent fixes. The only planning complexity is Fix 1: the current 3-card pricing layout doesn't match the actual pricing model (graduated usage-based, not named tiers). This structural mismatch needs frontend and UX strategy input to resolve well. Fix 2 is trivial (one number change) and needs no planning consultation.

Two specialists are consulted:
- **frontend-minion**: How to restructure the HTML/CSS for graduated pricing
- **ux-strategy-minion**: What information hierarchy best serves the user

Both questions are tightly scoped and can be answered quickly. The answers feed directly into a single execution task for each fix.

### Scope

**In scope:**
- Homepage pricing section HTML/CSS restructure to show real graduated pricing
- Removal of all "Coming soon" text and badges
- Clear communication of free tier allowances (200 captures/month, 50 eIDAS/month)
- `deviceScaleFactor` change from 2 to 4 in `src/capture.js`

**Out of scope:**
- Stripe integration code, billing page, pricing logic
- Image compression or optimization for larger screenshots
- Any other homepage sections
- Mobile-specific pricing redesign (responsive layout already exists, just needs content update)

### External Skill Integration

No external skills detected in project. Scanned `.claude/skills/` and `.skills/` in the working directory -- no SKILL.md files found. User-global skills at `~/.claude/skills/` are not despicable-agents specialists and none overlap with this task domain.
