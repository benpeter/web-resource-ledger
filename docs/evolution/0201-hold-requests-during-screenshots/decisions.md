# Decisions

- WRL holds back the requests a page starts while WRL takes its screenshots,
  after the page has loaded, settled and been scrolled. `holdsBackRequest()`
  decides; the route handler aborts held-back requests with `blockedbyclient`,
  as it does for the request cap.
- Not for the whole rest of the capture. The cookie-banner step sits between
  the two screenshots: consent tools save the choice over the network and some
  sites reload (theguardian.com). So the freeze is on for the first
  screenshot, off for the consent step, and on again once the page has come to
  rest after it, for the second screenshot and the HTML read. A pass that has
  to start over after a reload starts unfrozen.
- The page's own navigation always goes through, so a reload that starts
  during a screenshot isn't broken; the existing second pass handles it.
- Held-back requests don't make a capture partial: the page had loaded and
  settled. The count is recorded as `render.requestsHeldBack` and signed into
  `captureQuality`, and the SWGDE page says what WRL does.
- What it costs: an ad slot that would only have filled during the screenshot
  is empty in it.
- Not changed: the verify CLI, the verification page and MCP don't show the
  count yet.
