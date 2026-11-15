# Outcome

- Red first, four times, each green in the commit after it:
  - ce4f3bc, integration test in a real browser: a page with a CookieHub
    banner said `notDetected`. Green in 2e62618 (the rules are sent).
  - 29282b4: the same banner with settings that take three seconds to open
    said `failed`. Green in bc45ca4 (time limits by stage).
  - 5cc4546, unit test: autoconsent was not told to leave its generated
    rules off. Green in 1ea73fa.
  - 3ada5f4: a consent tool on the page with its banner hidden said
    `failed`. Green in 3bc5052 (`notDetected`, `cmpDetected` kept).
  - 4935d76, unit test: detection that answers after three seconds was
    given up on after two. Green in 75cd40f.
- `src/consent.js`: `loadRules()`, `autoconsentInitMessage()`,
  `consentLimitMs()`, `detectionRoundDone()`, `consentResult()`; the result
  has `popupFound`. `src/capture.js` uses `consentResult()` and logs
  `popupFound` in `render.default.consent_result`.
- `test/consent.test.js` is the first unit test of the consent step; the
  module's header had named that file since phase 0027.
- `test/autoconsent-version-sync.test.js`: the committed page script and
  the installed package are one version.
- Removed `src/vendor/autoconsent.playwright.js`, a copy from March that
  nothing imported and the vendor script never refreshed.
- Docs: verification guide ("Cookie banners": the rules, the time limits,
  what `notDetected` with `cmpDetected` means, the date from which captures
  differ), SWGDE page (declining can take several clicks inside the banner),
  `openapi.yaml` (`result`, `cmpDetected`), `coralogix-events.md`,
  `STACK.md`, changelog.
- Worker bundle: 1,877 KiB gzipped, 178 KiB more than main (the rules, and
  autoconsent's library, which has the function that filters them). The
  limit is 10 MB.

## Staging

36 sites, each captured on main (5c7cce0) and on this branch (ee636a5): ten
that customers captured in production, the battery's sites and well-known
European ones.

| `captureSettings.consent.result` | main | this branch |
|---|---|---|
| `success` | 5 | 19 |
| `failed` | 5 | 0 |
| `notDetected` | 23 | 15 |
| capture failed (HTTP 403, blank) or hung | 3 | 2 |

- Newly declined: semrush.com and explodingtopics.com (`cookiehub`),
  todocoleccion.net (`cookie-script`), rubypayeur.com (`axeptio`),
  infonet.fr (`cookieyes`), zalando.de (`usercentrics-api`), repubblica.it
  (`iubenda`), lefigaro.fr (`AppConsent`), gov.uk (`gov.uk`).
- `failed` on main, declined now, all by the longer limit: spiegel.de,
  bbc.com, heise.de, aftonbladet.se (Sourcepoint), slashdot.org
  (consentmanager.net).
- ikea.com/de: declined in 4 of 4 captures. On the build before the
  detection wait (91a88d7) it was missed in 2 of 4.
- marca.com (Didomi) and entreprises.lefigaro.fr (AppConsent) carry a
  consent tool that showed no banner: `notDetected` with `cmpDetected`, and
  5.5 and 6.7 seconds on the step.
- A page without a consent tool takes 2.5 to 2.8 seconds on the step, 0.2
  to 0.4 more than on main: autoconsent's first round over 600 rules ends
  around the 2 second mark, and the step looks again every 250 ms.
- A capture with a declined banner takes 5 to 12 seconds longer than one
  without, for the second screenshot and the wait before it. That was so
  before; more captures get there now.
- Of the 15 `notDetected` pages, five still show a consent wall that no
  hand-written rule knows: kleinanzeigen.de, corriere.it, lemonde.fr, nu.nl,
  and cnn.com, whose notice offers only "Agree". telegraph.co.uk answered
  with an Akamai block page. theguardian.com showed no banner in this run
  and had it declined in the two runs before.
- With the generated rules on (bc45ca4), semrush.com reported `success` with
  the cookie settings dialog open over the page. Verification pages:
  `cap_6f83f3b7d61d433491ce526a969652ab` (generated rule),
  `cap_4d73bc46e2c742cebe7097917dd46334` (CookieHub rule, clean).

## Found on the way

- A capture of theguardian.com on this branch had grey boxes for most
  images: the site reloaded later than the 2 seconds phase 0185 watches for.
  Fixed in phase 0188.

## Backlog changes

- New #104: consent walls no hand-written autoconsent rule knows
  (kleinanzeigen.de, corriere.it, lemonde.fr, nu.nl) stay in the screenshot.
