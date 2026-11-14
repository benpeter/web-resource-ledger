# Decisions

- Checked and left alone: the use-case pages (200 free captures and 10 GB from
  `src/quotas.js`, €0.05 from `src/pricing.js`, 200 sitemap URLs from
  `src/sitemap.js`, 10 captures a minute from `src/rate-limits.js`), and the landing
  page's "10 tools" (the comparison table's columns, WRL included) against "14 tools"
  (every tool the compare page names). The compare page's meta description said WRL is
  compared "with 10" tools; it names 13 besides WRL.
- `legal-evidence.md` said every capture receives a DigiCert timestamp. The TSA call
  degrades gracefully (`src/wacz.js`), and the verifier then reports the timestamp
  check as `skip` ("No independent timestamp was obtained for this capture"). Legal
  readers rely on that sentence, so it now says what happens when DigiCert can't be
  reached.
- The privacy policy is the reference for what is collected; the other pages now match
  it and the code:
  - DPA: email addresses as a data category (sign-in and notification address), the
    Annex row, "Multi-factor authentication" renamed to "Dashboard authentication"
    because email sign-in has no second factor, and "Minimal identity data" no longer
    says email addresses aren't requested or stored. GitHub sign-in asks for
    `user:email` and stores the primary verified address as the notification address
    (`src/oauth.js`), which the DPA denied even before email sign-in existed.
  - Whitepaper 3.1: rows for the sign-in address and the link token; the notification
    address's legal basis is contract performance, as in the privacy policy, not
    consent, and it's stored at sign-in, not only when notifications are switched on.
  - Data retention: rows for the email identity, sign-in links, the first-key KV entry
    and the 2-hour sign-in counters; deletion requests can name the sign-in email.
- `docs/INTERNALS.md` gave the `first_key:` KV entry a 3600 s TTL; the code uses
  24 hours (`FIRST_KEY_TTL_SECONDS`), and email sign-in writes it too.
- No effective date changes. The privacy policy only gains "or the email address you
  sign in with" in its contact line. The DPA is a template whose effective date is
  filled in when signed.
- Account deletion is a support request, and there is no runbook or script for it.
  Filed as a backlog item rather than written here.
