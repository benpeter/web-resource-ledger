# Outcome

- Red first (9313a95): the three list methods answered 401 without a key.
  Green in 05fd9dd: `KEYLESS_METHODS` in `src/mcp.js` has them, and the SDK
  answers each with -32601.
- The test that checks the `security.auth_fail` log used `prompts/list` and
  `resources/list` as its refused methods; it now uses `tools/call` and
  `logging/setLevel`.
- Docs: `site/content/mcp.md`, the route table in `docs/INTERNALS.md`,
  CHANGELOG under fixed.
- Evidence: in the 36 hours of logs Coralogix keeps, key-less `/mcp` requests
  fell from 15 to 20 an hour to 1 to 3 an hour when `server/discover` became
  keyless on 2026-11-14. Of the 14 since 20:00 UTC that day, 7 asked for
  `resources/list` or `prompts/list`, 6 for `tools/call`, 1 for a method that
  doesn't exist.
- `npm run test:sync` 57/57, `npm run build:docs`, full suite 86 files, 2018
  passed, 2 skipped.

## Backlog changes

- None. Found and fixed in one go during the operational check.
