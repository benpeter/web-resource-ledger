# Outcome

- Red first (dbb3452), then green (a79d111).
- `@w-r-l/verify` 0.4.0 in the repository: standard output, `--json`, `--legal` and
  `--legal --json` name the captured page and when it was captured. Package README
  and changelog updated.
- CI runs the package's 237 tests in a new `test-verify` job; CONTRIBUTING lists all
  four suites.
- Tests: 8 new (verifyWacz, formatHuman, formatLegal, formatLegalJson), 237/237.

## Backlog changes

- Filed: publish @w-r-l/verify 0.4.0 (needs an npm token or a manual publish by
  Ben), then add the page lines to the site's verification and legal-evidence pages;
  and decide the package's license (Apache 2.0 or PolyForm Shield).
