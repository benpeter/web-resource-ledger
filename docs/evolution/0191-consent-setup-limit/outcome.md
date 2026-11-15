# Outcome

- Red first (e700931): two tests in `test/consent.test.js` with a page whose
  `exposeBinding()`, or whose `evaluate()` in the main frame, never
  answers. Both ran into the test timeout: the step did not return. Green
  in 61cc1b0.
- `src/consent.js`: `withinSetupLimit()` races the two setup calls against
  what is left of `CONSENT_SETUP_MAX_MS` (15 seconds from the start of the
  step). Running out of it throws, which `dismissCookieConsent()` turns
  into `status: 'failed'` with the reason, as it does for any error.
- Docs: `result: failed` in the verification guide and `openapi.yaml`,
  `capture.consent_error` in `coralogix-events.md`, changelog.

## Staging

On 61cc1b0, eight captures, to see that the step is as it was where its
setup answers: banner declined on heise.de, spiegel.de and theguardian.com
(Sourcepoint), ikea.com/de (OneTrust), slashdot.org (consentmanager.net)
and explodingtopics.com (CookieHub); no banner on example.com and
merriam-webster.com. The consent step took 1.5 to 2.5 seconds each.

The limit itself did not come into play: none of the eight had a setup
that stayed unanswered, and merriam-webster.com served its light version
(about 230 requests, 11 frames). The two unit tests are what covers it.

## Backlog changes

- #105 updated: the ten minute hang is the consent step's setup, and it has
  a limit now. Open there: the slow screenshot, the memory limit, how many
  frames get the script, and whether intercepting every request is what
  slows the browser calls.
