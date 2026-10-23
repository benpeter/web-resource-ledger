# Decisions

- Screenshots render at device scale 2 instead of 4. Phase 0079 (#189) moved to 4
  so the pricing screenshot on the landing page looked sharp. At 4 a full-height
  screenshot is up to 5,120 by 32,000 pixels and 35.8 MB was seen in the logs; at 2
  it is up to 2,560 by 16,000, about a quarter of the pixels.
- `MAX_PAGE_HEIGHT` stays at 8,000 CSS pixels. The cap is about how much of a page
  the screenshot covers, not resolution.
- Existing captures keep their 4x screenshots. Nothing is re-rendered.
- 4x as a paid option goes on the backlog (Ben's call), not into this phase.
- The scale is now a named export, `DEVICE_SCALE_FACTOR`, with a test that pins it.
