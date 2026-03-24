MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task

Two quick improvements: real pricing on homepage and crisp screenshots.

### Fix 1 — Homepage pricing (#182)

Replace the "coming soon" placeholder in the homepage pricing section with actual pricing matching the configured Stripe products:

| Service | Tier | Price |
|---------|------|-------|
| Web Captures | 1-200/month | Free |
| Web Captures | 201-10,000 | EUR 0.05 each |
| Web Captures | 10,001-100,000 | EUR 0.035 each |
| Web Captures | 100,001+ | EUR 0.015 each |
| eIDAS Timestamps | 1-50/month | Free (opt-in add-on) |
| eIDAS Timestamps | 51+ | EUR 0.10 each |

Free tier allowance must be clearly communicated. Remove all "coming soon" text.

### Fix 2 — Screenshot deviceScaleFactor (#184)

Increase the Playwright screenshot `deviceScaleFactor` from 2 to 4.

### Success criteria

- Homepage pricing section displays real tier prices matching Stripe configuration
- "Coming soon" text completely removed from pricing section
- Free tier (200 captures/month, 50 eIDAS/month) clearly stated
- Screenshots captured at deviceScaleFactor 4
- Text in captured screenshots is clearly legible
- No visual regressions on homepage layout (mobile and desktop)

### Scope

- **In**: Homepage pricing section HTML/CSS, browser rendering deviceScaleFactor config
- **Out**: Stripe integration code, billing page, pricing logic, image compression

Closes #182, closes #184

## Specialist Contributions

Read the following scratch file for the full specialist contribution:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xFHZvh/homepage-pricing-screenshot-quality/phase2-frontend-minion.md

## Key consensus across specialists:

## Summary: frontend-minion
Phase: planning
Recommendation: 2-card hybrid layout with graduated tier tables (Web Captures + eIDAS) in primary card, Enterprise in secondary; deviceScaleFactor safe single-line change
Tasks: 2 — Rewrite pricing HTML to 2-card hybrid with tier tables; Change deviceScaleFactor from 2 to 4
Risks: Memory pressure on tall pages at 4x (accepted tradeoff per issue spec)
Conflicts: none

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. This is a simple 2-file change. The plan should have a single execution task (frontend-minion) that handles BOTH fixes in one pass. No approval gates needed.
7. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xFHZvh/homepage-pricing-screenshot-quality/phase3-synthesis.md`
