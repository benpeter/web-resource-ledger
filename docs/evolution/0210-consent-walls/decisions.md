# Decisions

- A second step after autoconsent, only when autoconsent did not decline a
  banner (`result` other than `success`). `src/consent-wall.js` reads the
  visible buttons inside overlays: an element with position fixed or
  sticky, a dialog or an aria-modal element, whose text mentions cookies,
  consent, privacy or partners. A link in the page itself is never read.
- Button labels are classified by keyword in the languages WRL sees
  (English, German, French, Italian, Dutch, Spanish): `pay` first, so
  "Rifiuta e abbonati" and "S'abonner" are never taken as a decline, then
  `decline`, `accept`, `save`, `settings`.
- Order: decline button; else settings, untick every checked box or switch
  inside the overlay, then a decline or save button in the settings; else
  accept. A `pay` button is never clicked. The wall counts as gone when no
  decline, accept or save button is left (a "Cookie settings" link that
  stays on screen doesn't count). The step has 10 seconds.
- Disclosure: `captureSettings.consent` becomes
  `{ library: 'wrl-consent-wall', action, route, result, button }`.
  An accept is `action: 'acceptAll'`, `result: 'accepted'`, never
  `success`. The verify page shows the consent check as skipped with "The
  cookie consent banner offered no way to decline, so the capture accepted
  it", and the screenshot caption and alt text say so.
- A wall that stays after the step turns `notDetected` into `failed`, so
  the capture no longer says there was no banner.
- A handled wall gets the second screenshot and `screenshotBefore` like an
  autoconsent dismissal; a reload after the click is handled by the same
  settle step.
- Main frame only. Walls inside iframes (Sourcepoint and similar) are the
  consent tools autoconsent has rules for.
- `ConsentHandling` in the spec: `libraryVersion` is no longer required
  (absent for `wrl-consent-wall`); new `route` and `button`.
- The battery compare counts `accepted` as not `success`, so a site moving
  from a decline to an accept shows up as a change.
