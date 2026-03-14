# Margo Code Review -- MVP Step 4: WACZ Bundling & Signing

## Summary

The implementation is well-scoped and proportional to the problem. Five new
modules (signing, warc, cdxj, canonical-json, wacz) plus one new dependency
(fflate) to assemble signed WACZ bundles. Module boundaries are clean, the
orchestrator (wacz.js) delegates clearly, and the integration into capture.js
degrades gracefully when no signing key is configured. No over-engineering
detected -- no unnecessary abstraction layers, no speculative features, no
framework bloat.

**Complexity budget**: +1 dependency (fflate), 0 new services, 0 new
abstraction layers, 0 new technologies. Well within budget.

## VERDICT: ADVISE

The code is sound and proportional. Two code-quality items worth addressing
before merge; neither is blocking.

## FINDINGS

- [ADVISE] src/warc.js:198-208 and src/cdxj.js:87-98 -- `toTimestamp14` function
  is duplicated verbatim across two modules. Both functions have identical
  implementations (ISO string to 14-digit timestamp). The cdxj.js version is
  already exported but warc.js defines its own private copy.
  AGENT: code-minion
  FIX: Remove `toTimestamp14` from warc.js and import from cdxj.js:
  `import { toTimestamp14 } from './cdxj.js'`. Alternatively, if the coupling
  feels wrong (warc importing from cdxj), extract to a shared `time.js` -- but
  that is YAGNI unless a third consumer appears. Importing from cdxj.js is the
  simpler option since warc.js already passes ts14 values that cdxj.js consumes.

- [ADVISE] src/warc.js:187-189 and src/wacz.js:30-33 -- `sha256` hash function
  is duplicated across two modules. Both produce `sha256:{hex}` from a
  Uint8Array using identical implementations (named `sha256Warc` in warc.js,
  `sha256` in wacz.js). The wacz.js comment explicitly references margo's
  advisory against a separate module, which was correct for a single use site --
  but now there are two call sites in separate modules.
  AGENT: code-minion
  FIX: Keep one copy. Options ranked by simplicity: (1) export `sha256Warc`
  from warc.js and import in wacz.js -- minimal change, no new files; (2) move
  to a `hash.js` module -- only justified if a third consumer appears. Option 1
  is sufficient.

- [NIT] src/cdxj.js:87-98 -- `toTimestamp14` is exported from cdxj.js but never
  called externally (the only external call is `toSurt` in tests). If warc.js
  imports it per the ADVISE above, this export becomes justified. If not, it is
  dead public API surface. Not blocking either way.
  AGENT: code-minion
  FIX: Resolved by the ADVISE above (warc.js imports it). No action needed if
  that fix is applied.

- [NIT] src/signing.js:15 -- `import { createPrivateKey, createPublicKey } from
  'node:crypto'` uses Node.js crypto for public key derivation from PKCS8
  private key via SPKI export. This works under Cloudflare's nodejs_compat but
  ties the module to a compatibility flag. The comment on line 55 acknowledges
  this. Not a complexity concern -- just a compatibility surface to be aware of.
  No action needed.
  AGENT: code-minion
  FIX: None required. Document the nodejs_compat dependency in wrangler.toml if
  not already present (it is already present based on existing project config).

- [NIT] src/signing.js:89 -- `btoa(String.fromCharCode(...new Uint8Array(sig)))`
  will throw for signatures larger than ~65K bytes due to spread operator limits
  on the call stack. Ed25519 signatures are always 64 bytes, so this is safe in
  practice. Not actionable.
  AGENT: code-minion
  FIX: None required. Ed25519 signatures are fixed at 64 bytes.
