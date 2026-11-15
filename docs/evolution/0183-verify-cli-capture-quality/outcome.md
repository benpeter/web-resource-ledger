# Outcome

- Red first (1fbeb68): 10 package tests failed. Green in 1e4354d.
- `packages/verify/lib/verify.js`: `readCaptureQuality()`, `capture.quality`.
  `lib/format.js`: `captureQualityNotes()` and the `Note` lines.
  `lib/format-legal.js`: the paragraph in section 2 and `capture.quality` in
  the JSON report.
- Package README and CHANGELOG (under v0.4.0, unreleased).
- `npm test` in `packages/verify`: 249 passed.
- Run against two staging bundles with `--origin
  https://staging.webresourceledger.com`: the samsung.com capture
  (`cap_07dba4b038a04979a4405117c48b89a7`) prints "The site answered with
  HTTP 403; ..." in the standard output, the legal report and `--json`; the
  finance.yahoo.com capture prints "Partial capture: the page had not
  finished loading, ...".

## Backlog changes

- #87 comment: 0.4.0 now also reports the capture quality; the site pages to
  update after the publish include the CLI examples on Verification.
