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
- One loop that reads the buttons again after every click, up to 5 clicks
  and 15 seconds: decline button; else settings (untick every checked box
  or switch inside the overlay); after a decline, save, and when the wall
  still stands, accept; else accept. A `pay` button is never clicked. The
  wall counts as gone when no decline, accept or save button is left (a
  "Cookie settings" link that stays on screen doesn't count). Labels are
  compared without case, so "Preferenze" on a second screen is the
  "PREFERENZE" already clicked.
- First staging run (aeee71e) showed three things the fixture didn't:
  kleinanzeigen.de's "ablehnen, ändern oder widerrufen" is a link inside a
  sentence (now: a label with a comma or more than six words is text);
  corriere.it's settings hold one Deny/Accept pair per purpose, and a
  refusal ends at a pay wall ("Acquista a €14,99/anno" or "Accetta e
  continua"), so the honest outcome there is `accepted`; and
  kleinanzeigen.de's settings are a page of their own (`/gdpr`), where
  every visible button counts and "Alle ablehnen und fortfahren" sends the
  visitor back. If a settings page doesn't send it back, WRL opens the
  captured URL again. Buttons below the screen count, since a long settings
  panel has its save button further down.
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
- Not covered: nu.nl sends EU visitors to `myprivacy.dpgmedia.nl/consent`,
  another site, which WRL doesn't let the main frame go to; from the US
  places Cloudflare runs WRL's browser in, it shows no wall at all.
- Second staging run (06e5e88): lemonde.fr declined, corriere.it declined
  in its settings (from Dallas no pay wall followed), cnn.com accepted
  ("Agree"). Accepting let CNN's ad stack load: the first attempt hit the
  50 MB size cap and the tab crashed in the screenshot; the queue's retry
  made a partial capture. kleinanzeigen.de's `/gdpr` page draws its
  buttons after its load event, so the step found none, went back, and
  reported a decline nobody made. Now a page a click opened is read again
  for up to 3 seconds, and a wall that is gone after a settings click
  alone is `failed`, not a decline. When the wall step clicked anything,
  the capture takes the second screenshot even on `failed`, so the
  screenshot matches the HTML read after it.
