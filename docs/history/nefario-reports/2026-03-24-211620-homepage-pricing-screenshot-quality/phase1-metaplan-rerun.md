# Meta-Plan: Homepage Pricing & Screenshot Quality (Revised)

## Task Summary

Two small, independent fixes:
1. Replace "coming soon" placeholder pricing on the homepage with real tier pricing matching Stripe configuration
2. Increase Playwright screenshot `deviceScaleFactor` from 2 to 4 for higher-resolution captures

## Planning Consultations

### Consultation 1: Pricing HTML Restructure & Screenshot Config
- **Agent**: frontend-minion
- **Planning question**: Two changes need your input.

  **Pricing section** (`landing/public/index.html` lines 190-229, CSS in `landing/public/css/landing.css` lines 423-499): The current layout is a 3-card grid (Explore/Free, Evidence/Pro, On-Premise/Enterprise) with "Coming soon" badges. The actual pricing model is graduated usage-based -- it does not map to 3 named plans. The tiers are:

  | Service | Tier | Price |
  |---------|------|-------|
  | Web Captures | 1-200/month | Free |
  | Web Captures | 201-10,000 | EUR 0.05 each |
  | Web Captures | 10,001-100,000 | EUR 0.035 each |
  | Web Captures | 100,001+ | EUR 0.015 each |
  | eIDAS Timestamps | 1-50/month | Free (opt-in add-on) |
  | eIDAS Timestamps | 51+ | EUR 0.10 each |

  What HTML/CSS structure best presents this graduated pricing? Options to evaluate: (a) keep the 3-card layout repurposed (one card for captures, one for eIDAS, one for enterprise/on-premise), (b) replace with a pricing table (rows = tiers, columns = volume/price), (c) a hybrid with a main usage card showing the graduated table and a secondary enterprise card. The free tier allowances (200 captures, 50 eIDAS timestamps) must be prominent. The On-Premise/Enterprise card is still relevant but separate from the usage model. All "Coming soon" text and badges must be removed, including the footer note "Pricing is coming. The API is available now."

  **Screenshot deviceScaleFactor** (`src/capture.js` line 454): Changing `deviceScaleFactor` from `2` to `4`. This is a one-line change with no structural implications -- just confirm there are no downstream concerns (e.g., viewport calculations, canvas size assumptions) that reference the scale factor elsewhere in the capture pipeline.

- **Context to provide**: Current HTML (3 cards with tier names, badges, prices, descriptions), CSS grid (3-col at 768px+, `.pricing-card--featured` for the middle card with "Recommended" pseudo-element), the graduated pricing tiers above, the constraint that this is vanilla HTML/CSS (no framework), and the `deviceScaleFactor` usage in `src/capture.js`.
- **Why this agent**: frontend-minion knows HTML/CSS layout patterns and can recommend the right structural approach for graduated pricing without over-engineering. Can also verify the deviceScaleFactor change has no ripple effects in the rendering pipeline.

### Cross-Cutting Checklist

- **Testing**: EXCLUDE from planning. Fix 1 is static HTML -- visual verification suffices. Fix 2 is a single numeric constant change (`deviceScaleFactor: 2` to `4`) with no logic change. Existing test infrastructure handles both. No test strategy input needed for planning.
- **Security**: EXCLUDE from planning. Neither change introduces attack surface, handles auth, processes user input, or manages secrets. Fix 1 is static content. Fix 2 is a rendering parameter.
- **Usability -- Strategy**: EXCLUDE from planning. The prices and tier structure are already defined by Stripe config -- this is content substitution, not information architecture. The user explicitly removed ux-strategy-minion from the team for this reason. frontend-minion's structural recommendation covers the presentation question adequately.
- **Usability -- Design**: EXCLUDE from planning. The pricing section already has established CSS/design system patterns. The structural question (how to lay out graduated tiers) is covered by frontend-minion. If the restructure is significant, ux-design-minion can review at Phase 3.5.
- **Documentation**: EXCLUDE from planning. Neither fix changes API surface, architecture, or user-facing documentation. Pricing is self-documenting on the homepage. Phase 8 assessment will confirm.
- **Observability**: EXCLUDE from planning. No runtime components are being created or modified in a way that affects logging/metrics/tracing. The `deviceScaleFactor` change is a rendering parameter, not an observable system change.

### Notable Exclusions

- **ux-design-minion**: The pricing section already has established CSS/design system patterns. The question is structural (how to present graduated tiers), which frontend-minion covers. If the restructure is large, ux-design-minion reviews at Phase 3.5.
- **sitespeed-minion**: Increasing `deviceScaleFactor` to 4 produces larger screenshots, but this is an accepted tradeoff per the task brief. No performance budget analysis needed for a deliberate size increase.
- **api-design-minion**: Pricing display is static HTML, not an API contract change. Stripe integration code is explicitly out of scope.

### Anticipated Approval Gates

**None anticipated.** Both changes are low blast radius and easy to reverse:
- Fix 1: Additive HTML/CSS content change with 0 downstream dependents in this plan.
- Fix 2: Single numeric constant change with 0 downstream dependents in this plan.

The only judgment call is how to restructure the pricing cards, which is why frontend-minion is consulted for planning. Once the approach is decided, execution is straightforward.

### Rationale

This is a small, well-scoped task with two independent fixes. The only planning complexity is Fix 1: the current 3-card pricing layout doesn't map to the actual pricing model (graduated usage-based, not named tiers). frontend-minion provides the structural recommendation for how to present graduated pricing in vanilla HTML/CSS. Fix 2 is trivial (one number change) and needs no separate consultation -- frontend-minion confirms no ripple effects as part of the same planning question.

One specialist is consulted:
- **frontend-minion**: How to restructure the HTML/CSS for graduated pricing, and whether the deviceScaleFactor change has any downstream concerns in the capture pipeline.

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
