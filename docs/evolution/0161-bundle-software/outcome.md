# Outcome

- Red first (d0a2897), then green (7a3bc1b).
- `src/build-info.js` `softwareId()`; `src/wacz.js` (manifest and signed digest),
  `src/warc.js` (`warcinfo`) and `src/capture.js` (header fetch User-Agent) use it.
- Tests: `test/wacz.test.js` checks all three bundle places and the User-Agent with
  the build stamped, and `WRL/dev` without.
- Docs: the SWGDE page's collection-documentation table; CHANGELOG.

## Backlog changes

- None.
