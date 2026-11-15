# Outcome

- Red first (b35dc1a): an integration test in a real browser, with the
  page of phase 0185 reloading 2.6 seconds after its banner is declined
  instead of 0.3. The capture attempt failed: `page.content()` threw
  "Unable to retrieve content because the page is navigating". Green in
  d64a253.
- `src/capture.js`: the second screenshot and the HTML read sit in a loop of
  at most two passes. `settleAfterConsent()` is unchanged; the second pass
  calls it with a navigation already seen, so it goes straight to the load
  wait, the settle and the scroll. `readHtml()` holds the one second limit
  of the timed-out path for both the first and the second read.
- `render.stages.postConsentMs`, `screenshotMs` and `contentMs` are sums over
  both passes. `render.default.post_consent` has `pass`.
- Docs: verification guide, `postConsentMs` in `openapi.yaml`,
  `coralogix-events.md`, changelog.

## Staging

On a68f805 (this change on top of phase 0187):

- theguardian.com, 5 captures: its Sourcepoint banner showed twice and was
  declined, the site reloaded within the 2 seconds both times
  (`reloaded: true, pass: 1`, 11.3 and 10.5 seconds after the banner), and
  the stored HTML has no lazy image left (108 images, 102 eager). Three times
  the site showed no cookie banner.
- heise.de and slashdot.org (banner declined, no reload): `pass: 1`, 2.5
  seconds. example.com: no banner.
- The late reload did not come up in these captures, so no `pass: 2` on
  staging. It needs a slow load of the Guardian, as in
  `cap_72c74ade0dee44d182d4d1d206d18456` on the build before (22.5 s to the
  navigation timeout, 88 of 107 images lazy in the stored HTML). The
  integration test is what covers it.

## Backlog changes

None.
