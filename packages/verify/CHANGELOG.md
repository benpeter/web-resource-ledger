# Changelog

## v0.4.0 (unreleased)

- Name the captured page: the standard output shows it, the `--legal` report lists it in the summary and the subject section with the time it was captured, and `--json` and `--legal --json` carry `capture.url` and `capture.capturedAt`. The values come from `datapackage.json`, which the signature covers
- The README describes what the `--legal` report contains
- Require fflate 0.8.3 or later: in 0.8.0 to 0.8.2, unzipping a malformed ZIP64 archive could loop forever ([GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98)), so a crafted WACZ could hang the verifier

## v0.3.0 (2026-03-26)

- Add `--legal` flag for detailed, court-admissible verification reports
- Legal reports include plain-language explanations of each cryptographic check, trust model disclosure, and examiner attestation sections
- Supports both human-readable (`--legal`) and machine-readable (`--legal --json`) legal output formats
- License changed from Apache 2.0 to PolyForm Shield 1.0.0
- Merge timestamp checks into single Time verification row in standard output

## v0.2.1 (2026-03-20)

- Add `qualifiedTimestamp` check to verify CLI
- Replace workers.dev URLs with api.webresourceledger.com

## v0.1.0 (2026-03-17)

Initial release -- zero-install CLI tool for full cryptographic verification of WRL WACZ bundles.

- Ed25519 signature verification
- SHA-256 content hash validation
- RFC 3161 timestamp verification with DigiCert TSA chain
- CMS certificate chain validation
- Human-readable and JSON output formats
