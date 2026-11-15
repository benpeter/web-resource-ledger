# Decisions

- The cause: autoconsent comes in two parts. The page script carries 11
  detectors written in code (OneTrust, Cookiebot, Sourcepoint, TrustArc,
  consentmanager.net and six more). Every other banner it knows from JSON
  rules that the host has to send to the page with the `initResp` message.
  WRL sent only the config. Phase 0027 left the rules out on purpose, to be
  looked at again "after measuring real-world detection rates".
- The measurement: of 76 sites captured in production since September, one
  had its banner declined and one failed; 74 say `notDetected`, among them
  kleinanzeigen.de, lefigaro.fr, todocoleccion.net and rubypayeur.com.
- WRL sends the rules now, filtered for each frame's URL with autoconsent's
  own `filterCompactRules`: about 240 KB for a main frame, 9 KB for a child
  frame.
- Only the hand-written rules run, about 1,000. The 430 rules that autoconsent
  generates from a crawl (`auto_*`) stay off. On staging the one for
  semrush.com clicked "Do not sell or share my personal information", which
  opens the cookie settings, left them open over the page and reported
  success. A rule for one site also runs before the rules for consent tools,
  so it kept the hand-written CookieHub rule from running at all.
- Cosmetic rules stay off, as decided in 0027: they hide a banner and decide
  nothing.
- The rules and `filterCompactRules` are loaded with a dynamic import on the
  first capture. As static imports they made every test file that imports
  the Worker slower (the unit suite went from 23 s to 33 s), and a Worker
  that starts for `/health` would have paid for 570 KB of rules it never
  uses. `src/capture.js` loads `@cloudflare/playwright` the same way.
- The rules come from the installed package, not from a committed copy like
  the page script. A sync test holds the two to one version.
- More rules made a second problem bigger: the whole step had 2 seconds. A
  Sourcepoint banner takes 1.6 to 2.5 seconds to decline, so spiegel.de and
  bbc.com mostly ended as `failed` with the banner in the screenshot (9 of 11
  on staging in a day), and a rule that opens the settings first needs
  longer still. The limit now depends on how far autoconsent has come: 2
  seconds to detect a consent tool, 5 for its banner to show, 10 for the
  decline. A page without a consent tool costs what it did.
- A consent tool that is on the page and shows no banner is `notDetected`,
  not `failed`. marca.com carries Didomi and shows visitors from outside the
  EU no banner; "a banner was found but could not be declined" is wrong
  there, and with a thousand rules it would be said often. `cmpDetected`
  still names the tool. This changes what an existing value means, so the
  OpenAPI description and the verification guide give the date.
- Such a page takes 5 seconds on the step, 3 more than before. autoconsent
  looks for a popup for 2.5 seconds after it detected the tool, which can
  itself take 2.5, so a shorter limit would cut off banners that show late.
- Not done: ending the step early when autoconsent reports that it found
  nothing. Its last detection attempt ends after the 2 seconds anyway.
- Not done: a browser in the EU. WRL's browser runs where Cloudflare puts
  it; on staging the CookieHub banner of semrush.com carried
  `data-region="us-ca"`, so the site took it for a visitor from California.
  A site that only asks EU visitors shows it no banner. That is what the
  page looked like to that visitor, and the capture says so.
- Not done: banners autoconsent has no hand-written rule for. kleinanzeigen.de
  shows its own "accept all or pay" wall, which stays in the screenshot
  with `notDetected`, as before.
- The polling fallback (a browser without `exposeBinding`) gets the same
  rules and limits, so the two paths don't differ. Nothing runs it today.
- "WRL never clicks anything else" on the site was no longer exact: where a
  banner has no "Reject" button, a rule opens its settings, unticks what is
  ticked and saves. Checked the hand-written rules whose opt-out clicks
  something named "accept": all of them are that save button after the
  unticking, and their opt-in steps are different ones.
