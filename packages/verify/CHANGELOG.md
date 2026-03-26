# Changelog

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
