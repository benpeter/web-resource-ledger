MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

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

## Codebase Context

Key files already identified:
- Homepage pricing: `landing/public/index.html` (lines 190-229) — three pricing tiers with "Coming soon" text
- Screenshot config: `src/capture.js` (line 454) — `deviceScaleFactor: 2`

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/purring-discovering-fox

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xFHZvh/homepage-pricing-screenshot-quality/phase1-metaplan.md`
