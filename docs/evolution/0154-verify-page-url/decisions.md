# Decisions

- The page comes from `datapackage.json`: WRL writes `mainPageUrl` and
  `mainPageDate` there (`src/wacz.js`). The bundle hash is computed over the
  canonical datapackage and the signature covers that hash, so both values are as
  well protected as the rest of the manifest. Nothing is read from `pages.jsonl`
  or the WARC.
- `verifyWacz` returns them as `capture.url` and `capture.capturedAt`, null when the
  archive has none (WACZ files from other tools, or older test fixtures). The
  standard output shows a `Page` line above `Signed`; the legal report adds `Page:`
  to section 1 and `Captured page:` / `Captured at:` to section 2; the JSON outputs
  carry the two fields, and the legal JSON also `summary.capturedUrl`.
- `capturedAt` (when the page was captured) and `signedAt` (when the manifest was
  signed) are both reported. They are seconds apart in practice, and the report
  shouldn't merge two claims into one.
- Version 0.4.0, not published here: the publish workflow needs an `NPM_TOKEN`
  secret the repository doesn't have, and 0.1.0 to 0.3.0 were published by hand.
  The site's verification and legal-evidence pages describe the npm release, so they
  get the new lines after publishing.
- CI never ran the package's tests: only the publish workflow does, and it has never
  run. `ci.yml` gets a `test-verify` job.
- Found on the way, not changed: `packages/verify/package.json` and its `LICENSE`
  file say Apache 2.0 (phase 0125 chose that), but the package README's License
  section and the 0.3.0 changelog say PolyForm Shield 1.0.0. Which one applies is
  Ben's call.
