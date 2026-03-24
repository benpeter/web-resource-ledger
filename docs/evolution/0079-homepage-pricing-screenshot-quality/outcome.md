# Outcome — 0079 Homepage Pricing & Screenshot Quality

## What was built

Two targeted fixes closing issues #182 and #184:

### Fix 1: Homepage pricing (closes #182)
Replaced the 3-card placeholder pricing section ("Coming soon" badges, placeholder tier names) with a 2-card layout:

- **Usage-Based Pricing** (featured card): Contains two semantic HTML tables showing graduated pricing for Web Captures (4 tiers: free 200/mo, then €0.05/€0.035/€0.015 per capture) and Qualified Timestamps/eIDAS (2 tiers: free 50/mo, then €0.10 per capture). Free tiers prominently displayed with green badges.
- **On-Premise / Enterprise** (plain card): Self-hosted deployment description with "Contact us" mailto CTA.

All "Coming soon" text removed. The pricing note "Pricing is coming. The API is available now." removed. Dead CSS rules cleaned up (badge--info, pricing-note, pricing-card__price).

### Fix 2: Screenshot quality (closes #184)
Changed `deviceScaleFactor` from 2 to 4 in `src/capture.js`. Single-line change, no ripple effects confirmed.

## Files changed
| File | Lines changed | Description |
|------|--------------|-------------|
| landing/public/index.html | +55/-27 | 2-card pricing layout with semantic tables |
| landing/public/css/landing.css | +40/-18 | 2-col grid, pricing table styles, dead rule cleanup |
| src/capture.js | 1 | deviceScaleFactor: 2 → 4 |

## What deviated from the plan
Nothing significant. The plan was executed as designed. The mobile badge advisory (show vs hide "Pay as you go" on mobile) was resolved by the implementer choosing Option A (show on mobile), which was documented in decisions.md.

## Reviewer concerns documented but not acted on
All three code reviewers (code-review-minion, lucy, margo) flagged the deviceScaleFactor increase to 4 as a potential OOM risk on tall pages. The project's prior security review (phase 0026) recommended capping at 2. This concern was accepted per the issue spec's explicit "accept the tradeoff" directive. The bitmap rendering happens in Browser Rendering's sandbox, not Worker memory. Documented for monitoring.

## Backlog changes
No backlog items added or removed. Both issues (#182, #184) were straightforward implementations with no deferred work.
