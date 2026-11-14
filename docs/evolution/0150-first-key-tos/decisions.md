# Decisions

- Sign-in creates the first API key before the user sees the terms (GitHub callback
  and email sign-in alike) and parks it in KV for 24 hours. The session gate answered
  403 on account routes until the terms were accepted, but exempted
  `/v1/account/first-key` along with `/v1/account/tos`. Phase 0055 (D6) put the gate in
  the backend to stop a curl bypass of the UI's terms screen; with the exemption, a
  request to `/v1/account/first-key` returned the key, and the key works for captures
  without the terms ever being accepted.
- The UI shows the terms first and fetches the key only after acceptance
  (`src/ui/ui-tos.js` -> `mountWelcome()`), so the exemption served no flow. It's
  removed; only `/v1/account/tos` stays exempt. A key fetched before acceptance now
  answers 403 and the KV entry stays for when the terms are accepted.
- Creating the key only after acceptance would be tidier, but it moves key creation
  out of both sign-in paths; with the key unreachable until acceptance, the order no
  longer matters.
- The two tenants have no usage rows, so their keys were never used. Their KV entries
  expired long ago; nothing to clean up.
- API keys still don't check the terms on each request. Every way to get a key now
  goes through a gated route (first key, `POST /v1/account/keys`), so a per-request
  check would add a D1 read to the hot path for no reachable case.
- The whitepaper's sign-in sequence showed the first key's TTL as 3600 s (it is
  24 hours since phase 0114) and stopped before the terms; it now shows both steps.
