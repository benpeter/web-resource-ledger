**Outcome**: The homepage pricing section shows real pricing instead of "coming soon", and captured screenshots are crisp by increasing the browser's deviceScaleFactor.

**Fix 1 — Homepage pricing (#182)**:
Replace the "coming soon" placeholder in the homepage pricing section with actual pricing matching the configured Stripe products:
- Graduated capture pricing: 1–200 free, 201–10k €0.05, 10k–100k €0.035, 100k+ €0.015
- eIDAS qualified timestamps: 1–50 free, 51+ €0.10/capture
- Free tier allowance clearly communicated
- Remove all "coming soon" text

**Fix 2 — Screenshot deviceScaleFactor (#184)**:
Increase the Playwright screenshot deviceScaleFactor from 1 (or current value) to 4, so captured screenshots are high-resolution and text is legible at 100% zoom. Accept the file size increase.

**Success criteria**:
- Homepage pricing section displays real tier prices matching Stripe configuration
- "Coming soon" text completely removed from pricing section
- Free tier (200 captures/month, 50 eIDAS/month) clearly stated
- Screenshots captured at deviceScaleFactor 4
- Text in captured screenshots is clearly legible
- No visual regressions on homepage layout (mobile and desktop)

**Scope**:
- In: Homepage pricing section HTML/CSS, browser rendering deviceScaleFactor config
- Out: Stripe integration code, billing page, pricing logic, image compression
