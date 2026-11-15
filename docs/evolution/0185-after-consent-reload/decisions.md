# Decisions

- The cause: the consent step returns the moment autoconsent reports the
  banner as declined, and the second screenshot and the HTML followed at
  once. theguardian.com reloads itself on the choice, so both showed the new
  document seconds into loading: the stored HTML had 101 images with
  `loading="lazy"` again, although the scroll step had switched every one to
  eager before the banner was handled.
- After a dismissed banner WRL watches the main frame for 2 seconds for a
  navigation. With none, it waits for new requests the way the settle step
  does (0.5 s of quiet, 3 s at most). With one, the page gets what a fresh
  load gets: the load event (20 s at most), the settle, the scroll.
- Only a reloaded page is scrolled again. A page that stayed has its lazy
  images from the first scroll, and a second one would cost 3 to 20 seconds
  on every capture with a banner.
- The settle after a reload counts requests that are already under way. The
  settle step otherwise counts only requests that start after it began, which
  is fine after a load event that waited for them, but a reloaded page's data
  requests start before its load event and would be missed. `waitForSettle`
  takes them as an optional third argument; the main settle is unchanged.
- No second blank-page or bot check after a reload, and autoconsent is not
  run again if the banner comes back. Neither has been seen.
- A failure in this wait doesn't fail the capture. It is logged
  (`render.default.post_consent_fail`) and the screenshot is taken anyway,
  as it was before this change.
- `render.stages.postConsentMs` is present only when a banner was dismissed.
  It is not folded into `consentMs`, which stays the time autoconsent took,
  and `screenshotMs` no longer includes it.
- The docs had nothing on cookie banners outside the OpenAPI schema, although
  declining cookies is the one thing WRL does to a page it captures. The
  verification guide gets a "Cookie banners" section: what WRL does, what
  `captureSettings.consent.result` means, which screenshot is which.
- Not flagged on the capture: that the page reloaded. The before-screenshot
  is in the bundle either way, and `render.default.post_consent` logs it.
