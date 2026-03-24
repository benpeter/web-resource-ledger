Two quick improvements: real pricing on homepage and crisp screenshots.

## Fix 1 — Homepage pricing (#182)

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

## Fix 2 — Screenshot deviceScaleFactor (#184)

Increase the Playwright screenshot `deviceScaleFactor` from the current value to 4, so captured screenshots are high-resolution and text is legible at 100% zoom. Accept the tradeoff of larger file sizes.

## Success criteria

- Homepage pricing section displays real tier prices matching Stripe configuration
- "Coming soon" text completely removed from pricing section
- Free tier (200 captures/month, 50 eIDAS/month) clearly stated
- Screenshots captured at deviceScaleFactor 4
- Text in captured screenshots is clearly legible
- No visual regressions on homepage layout (mobile and desktop)

## Scope

- **In**: Homepage pricing section HTML/CSS, browser rendering deviceScaleFactor config
- **Out**: Stripe integration code, billing page, pricing logic, image compression

Closes #182, closes #184
