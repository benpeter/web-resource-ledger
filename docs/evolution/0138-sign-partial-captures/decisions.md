# Decisions

- Partial captures go through the same WACZ, signing and timestamp path as full ones.
  The reason to skip them in phase 0023 (captures ran inside the HTTP request) went away
  with the move to Queues, and leaving them unsigned meant a third of some tenants'
  captures had no evidence value: no verify link, no certificate, a webhook
  `verificationUrl` that answered 404.
- Every bundle, full or partial, records `captureQuality` (`renderQuality`,
  `waitUntilReached`, `timedOut`) in `datapackage.json`. It sits inside the signed
  manifest, so a verifier can't be shown a partial render as a full one. Recording it on
  full captures too means a reader doesn't have to treat a missing field as "full".
  `durationMs` and the stage timings stay out: they are operational data, already in the
  capture record, and not part of what the evidence claims.
- Adding the field changes the canonical datapackage, so new bundle hashes differ from
  what the same page would have produced before. Old bundles are unchanged and still
  verify. The CLI's canonical JSON is a verbatim copy of the Worker's, and the field
  holds only strings and booleans, so released `@w-r-l/verify` versions verify new
  bundles.
- Older partial captures are not signed after the fact. A signature and timestamp made
  now would attest to the time of signing, not the time of capture, which is the claim
  WRL's evidence rests on. They keep their 404 on `/v1/verify/{id}`, and the docs say
  why.
- The verify page shows a partial render as a "Page load" row with the skip icon below
  the checks, the same way it shows a consent banner it couldn't dismiss. The banner
  still says Verified, because the cryptographic checks passed; the row tells the reader
  the screenshot may be missing late-loading content. Full renders get no row, so the
  page for them is unchanged.
- MCP `verify_capture` prints `Render quality:` like `get_capture` already does, so an
  agent sees what `GET /v1/verify/{id}` returns in `capture.renderQuality`.
- Partial captures already counted toward the monthly quota as complete captures.
  Tenants with qualified timestamps turned on now also use a qualified timestamp on
  them (first 50 a month free, then EUR 0.10). That matches what a partial capture is: a
  completed capture of what the page showed. The CHANGELOG says so.
- The webhook payload does not get a `renderQuality` field. Nobody asked for it, and the
  capture record and verify response already carry it.
