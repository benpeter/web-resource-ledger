You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

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

## Your Planning Question

Two changes need your input.

**Pricing section** (`landing/public/index.html` lines 190-229, CSS in `landing/public/css/landing.css` lines 423-499): The current layout is a 3-card grid (Explore/Free, Evidence/Pro, On-Premise/Enterprise) with "Coming soon" badges. The actual pricing model is graduated usage-based — it does not map to 3 named plans. The tiers are graduated (see table above).

What HTML/CSS structure best presents this graduated pricing? Options to evaluate:
(a) keep the 3-card layout repurposed (one card for captures, one for eIDAS, one for enterprise/on-premise)
(b) replace with a pricing table (rows = tiers, columns = volume/price)
(c) a hybrid with a main usage card showing the graduated table and a secondary enterprise card

The free tier allowances (200 captures, 50 eIDAS timestamps) must be prominent. The On-Premise/Enterprise card is still relevant but separate from the usage model. All "Coming soon" text and badges must be removed, including the footer note "Pricing is coming. The API is available now."

**Screenshot deviceScaleFactor** (`src/capture.js` line 454): Changing `deviceScaleFactor` from `2` to `4`. This is a one-line change — just confirm there are no downstream concerns (e.g., viewport calculations, canvas size assumptions) that reference the scale factor elsewhere in the capture pipeline.

## Context

- This is vanilla HTML/CSS (no framework)
- The CSS grid is 3-col at 768px+
- `.pricing-card--featured` class marks middle card with "Recommended" pseudo-element
- Responsive layout already exists

## Instructions
1. Read the relevant files:
   - `landing/public/index.html` (pricing section, lines 180-240)
   - `landing/public/css/landing.css` (pricing styles, lines 420-500)
   - `src/capture.js` (deviceScaleFactor area, line 450-460)
   - Search for any other references to deviceScaleFactor in the codebase
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: frontend-minion

### Recommendations
<your expert recommendations for both changes>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xFHZvh/homepage-pricing-screenshot-quality/phase2-frontend-minion.md`
