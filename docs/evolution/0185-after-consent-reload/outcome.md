# Outcome

- Red first (037ab90): an integration test in a real browser with a page
  whose Cookiebot-style banner reloads the page when declined, and whose
  content arrives by a request two seconds after each load. The stored HTML
  had the empty content container. Green in ea0213f.
- `src/capture.js`: `settleAfterConsent()` between the consent step and the
  second screenshot; `waitForSettle()` takes requests already under way;
  `render.stages.postConsentMs`; events `render.default.post_consent`
  (postConsentMs, reloaded) and `post_consent_fail`.
- Docs: a "Cookie banners" section in the verification guide (the first
  user-facing text on what WRL does with a banner), `postConsentMs` in
  `openapi.yaml`, `coralogix-events.md`, changelog.

## Staging

theguardian.com, autoconsent declined the Sourcepoint banner both times.

| | before (7d0be7a) | this branch (5080b6b) |
|---|---|---|
| capture | `cap_e7f313431cef49fa8582e4285459289c` | `cap_1dde9c40d00e4f6c8afe4a6f4ba5bbae` |
| screenshot | grey boxes for most images below the first screen | every image, no banner |
| stored HTML | 101 of 118 images `loading="lazy"` | none lazy, 111 eager |
| before-banner screenshot | every image, banner over the top story | same |
| render time | 40.8 s | 51.0 s, 11.5 s of it after the banner |

- `render.default.post_consent` for the Guardian says `reloaded: true`, which
  confirms the cause. slashdot.org (consentmanager.net banner declined) did
  not reload and waited 2.7 s. example.com has no banner and no
  `postConsentMs`.
- Not run: the full battery. The change is behind `consent.status ===
  'dismissed'`; the two sites of the battery with a dismissed banner
  (Slashdot, Samsung when it is not blocked) and the Guardian are the ones it
  touches, and two of the three were captured.

## Found on the way

- Production stopped deploying: the staging tenant of the smoke test was out
  of quota (208 of 200), so "Deploy to Staging" failed for #459 and #458 and
  production was skipped. Raised the tenant to 2000 a month on staging and
  re-ran the smoke job.

## Backlog changes

- New #103: a staging smoke tenant out of quota stops every deploy, silently
  (fixed for now, follow-ups listed there).
