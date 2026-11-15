# Decisions

- The cause: phase 0185 watches the main frame for a navigation for 2 seconds
  after the banner is declined. That capture's page was slow (22.5 s to the
  navigation timeout, a `partial` capture), and the Guardian's reload started
  after the 2 seconds. WRL took the second screenshot and read the HTML from
  the reloaded document a moment into loading: 88 of 107 images lazy again.
- The integration test for it found a second outcome. When the reload lands
  while `page.content()` runs, Playwright throws "Unable to retrieve content
  because the page is navigating", and the attempt fails with "Capture could
  not be completed". The queue retries it, and each retry has the same odds.
- No longer watch window. However long it is, a slower page reloads after
  it, and every capture with a declined banner would wait that long.
- The second screenshot and the HTML read are one step that can be done over.
  If the main frame navigated while the step ran, or the HTML read failed
  because the page was navigating, WRL treats that as the reload: load event,
  settle, scroll, then screenshot and HTML again.
- Once. A page that navigates during the second pass as well is captured as
  it stands, and an error there fails the attempt as before. A site that
  reloads in a loop would otherwise hold the browser.
- A navigation that has started but not committed when the HTML is read
  changes nothing: screenshot and HTML are both of the old document, which
  had come to rest.
- `render.stages.postConsentMs`, `screenshotMs` and `contentMs` add up both
  passes, so the stages still sum to about the render time.
  `render.default.post_consent` is logged per pass, with `pass`.
