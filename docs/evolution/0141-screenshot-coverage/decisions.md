# Decisions

- `takeCappedScreenshot` already measured the page and knew whether it clipped; the
  renderer dropped both. The renderer now adds `pageHeight`, `screenshotHeight` and
  `screenshotClipped` to `render`, taken from the screenshot the capture keeps (the
  after-consent one when there is one). The capture record stores `render` as given, so
  the API returns them without further changes.
- `screenshotHeight` is stored, not derived from `MAX_PAGE_HEIGHT` at display time. If
  the cap changes, older captures still say what their own screenshot covers; the
  verify page and MCP read the numbers from the record.
- `captureQuality` in the WACZ carries the same three fields, so the signed bundle says
  whether its screenshot shows the whole page.
- The verify page shows a caption under the screenshot when it was clipped. It reads
  `render` from the public capture record it already fetches, coerces both numbers with
  `Number()` before writing them into the HTML, and adds nothing for unclipped pages.
- MCP `get_capture` adds one line for clipped screenshots only, so the output for
  ordinary pages is unchanged.
- The renderer itself has no unit test (it needs a browser); the change there is passing
  two values through. The tests cover what happens to them: the WACZ, the record, the
  verify page and `get_capture`.
