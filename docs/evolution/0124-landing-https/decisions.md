# Decisions

- The Transform Rule was already gone: the zone has no
  `http_response_headers_transform` ruleset and no custom rulesets at all. The
  landing Worker sends its own security headers since phase 0102.
- Checking the headers showed two gaps the rule question had hidden:
  - The landing page sent no `Strict-Transport-Security`, while docs
    (1 year, includeSubDomains) and the API (2 years, preload) did.
  - The zone's "Always Use HTTPS" setting was off. `http://webresourceledger.com/`
    and `http://docs.webresourceledger.com/` answered 200 over plain HTTP, and the
    landing Worker's www redirect kept the scheme, so `http://www.` led to the
    plain-HTTP apex. The whitepaper promises TLS for all endpoints.
- Fixes:
  - "Always Use HTTPS" on for the zone (was off), applied 2026-10-23 through
    the Cloudflare API. Rollback: set it to "off" again.
  - The landing Worker sends `Strict-Transport-Security: max-age=31536000;
    includeSubDomains`, the same value as docs. No `preload`: getting off the
    preload list takes months, so that is Ben's call.
  - The www redirect always targets `https://`.
- First tests for the landing Worker (`test/landing-worker.test.js`).
