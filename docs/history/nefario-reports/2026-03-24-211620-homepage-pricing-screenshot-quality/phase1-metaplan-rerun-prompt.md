MODE: META-PLAN

You are creating a revised meta-plan after a team adjustment.

## Task

Two quick improvements: real pricing on homepage and crisp screenshots.

### Fix 1 — Homepage pricing (#182)

Replace the "coming soon" placeholder in the homepage pricing section with actual pricing matching the configured Stripe products:

| Tier | Price |
|------|-------|
| Captures 1–200/month | Free |
| Captures 201–10,000 | €0.05 each |
| Captures 10,001–100,000 | €0.035 each |
| Captures 100,001+ | €0.015 each |
| eIDAS timestamps 1–50/month | Free |
| eIDAS timestamps 51+ | €0.10 each |

Free tier allowance must be clearly communicated. Remove all "coming soon" text.

### Fix 2 — Screenshot deviceScaleFactor (#184)

Increase the Playwright screenshot `deviceScaleFactor` from the current value to 4, so captured screenshots are high-resolution and text is legible at 100% zoom. Accept the tradeoff of larger file sizes.

### Scope

- **In**: Homepage pricing section HTML/CSS, browser rendering deviceScaleFactor config
- **Out**: Stripe integration code, billing page, pricing logic, image compression

## Codebase Context

Key files:
- Homepage pricing: `landing/public/index.html` (lines 190-229) — three pricing tiers with "Coming soon" text
- Screenshot config: `src/capture.js` (line 454) — `deviceScaleFactor: 2`

## Original Meta-Plan
Read from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xFHZvh/homepage-pricing-screenshot-quality/phase1-metaplan.md

## Team Adjustment
- Removed: ux-strategy-minion (prices and tier structure are already defined by Stripe config; this is content substitution, not information architecture)
- Revised team: frontend-minion

## Constraints
- Keep the same scope and task description
- Generate planning consultation for frontend-minion only
- The planning question should cover both fixes (pricing HTML + deviceScaleFactor)
- Preserve external skill integration decisions
- Do NOT add agents the user did not request

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/purring-discovering-fox

## Instructions
1. Read the original meta-plan for context
2. Generate a focused planning question for frontend-minion covering both fixes
3. Write the revised meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xFHZvh/homepage-pricing-screenshot-quality/phase1-metaplan-rerun.md`
