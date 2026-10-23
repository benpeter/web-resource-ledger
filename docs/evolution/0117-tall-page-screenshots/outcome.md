# Outcome

- `src/capture.js`: `takeCappedScreenshot()` and `MAX_PAGE_HEIGHT` exported,
  used for every screenshot, viewport resize removed
- `test/capped-screenshot.test.js`: 6 tests with a fake page whose
  `evaluate()` runs the real height function. Committed red first
- `site/content/limits.md`: new "Screenshot Size" section
- `docs/operations/coralogix-events.md`: `screenshot_capped` replaces
  `viewport_capped`

## Verification

Deployed the branch to staging by hand and ran the battery on the seven tall
sites plus example.com: Guardian, Spiegel, BBC, Hurriyet, CNN and TradingView
completed with render quality full, GitHub failed as above. Staging was
redeployed from main (2877ee3) right after.
