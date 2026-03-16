You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Issue #58: Dual-screenshot cookie consent dismissal for captures. Extend WACZ bundles, WARC records, datapackage.json, CDXJ index, and KV records to support two screenshots and captureSettings metadata.

## Your Planning Question
How should WACZ, WARC records, `datapackage.json`, CDXJ index, and KV record extend for two screenshots and `captureSettings` metadata?
1. Two separate WARC resource records for before/after screenshots, or a single multipart record?
2. URI scheme for before vs. after: `urn:wrl:screenshot:before:{url}` and `urn:wrl:screenshot:after:{url}`?
3. Define the `captureSettings` schema for datapackage.json. What fields? Where in the object hierarchy?
4. Impact on bundle hash computation and Ed25519 signature chain?
5. KV record shape: where does `captureSettings` go in the completeCapture() record?
6. When autoconsent fails (single screenshot), what does the WACZ bundle look like? Same as today?

## Context
Key files to read:
- `src/wacz.js` -- current WACZ assembly, datapackage.json structure, signature chain
- `src/warc.js` -- WARC record construction, current record order
- `src/kv.js` -- KV record shape, completeCapture() interface
- `src/cdxj.js` -- CDXJ index format
- Phase 0017 advisory recommended `captureSettings` with: consent library, consent action, success/failure, settingsVersion
- The signature chain: canonicalize(datapackage) -> sha256 -> Ed25519 sign. Adding captureSettings to datapackage means it's automatically covered by the signature.

## Instructions
1. Read the source files listed above
2. Design the data schema extensions with concrete field definitions
3. Consider backward compatibility with existing WACZ bundles and verification
4. Return your contribution in structured format
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-data-minion.md`
