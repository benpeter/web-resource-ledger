# Outcome

## What was built

A standalone CLI npm package (`@w-r-l/verify`) at `packages/verify/` that provides
independent, offline-capable cryptographic verification of WRL WACZ captures,
including full CMS/PKCS#7 certificate chain validation for RFC 3161 timestamps.

### Deliverables

**CLI tool** (`bin/wrl-verify.js`):
- `npx @w-r-l/verify capture.wacz --key <base64>` for local verification
- `npx @w-r-l/verify https://wrl.benpeter.workers.dev/v1/captures/cap_xxx` for remote
- Human-readable output by default, `--json` for machine consumption
- Exit codes: 0 (pass), 1 (fail), 2 (error)
- Three key trust levels: origin-verified, user-pinned, embedded (with warning)

**5-check verification pipeline**:
1. File integrity (artifact SHA-256 hashes)
2. Bundle integrity (canonical JSON hash)
3. Digital signature (Ed25519 verification)
4. Timestamp imprint (RFC 3161 messageImprint match)
5. Timestamp chain (CMS/PKCS#7 signature + X.509 chain validation) -- NEW

**Security features**:
- HTTPS-only enforcement on origin URLs
- `timingSafeEqual` for hash comparisons
- Zip bomb pre-check (100MB decompressed limit)
- Response size guards on key endpoint fetches
- DigiCert Trusted Root G4 certificate bundled and fingerprint-verified
- PKIjs pinned to exact versions for supply chain safety

**Test suite**: 136 tests using `node:test` covering all modules. Real DigiCert
TSA token fixture for CMS chain validation testing.

### Files created

```
packages/verify/
  package.json, package-lock.json, LICENSE
  bin/wrl-verify.js
  lib/verify.js, canonical-json.js, sha256.js, signing.js, rfc3161.js
  lib/cms-verify.js, cli.js, format.js, key-resolver.js
  certs/trusted-roots/DigiCertTrustedRootG4.pem
  test/  (7 test files, helpers, fixtures)
```

Also modified: `vitest.config.js` (exclude `packages/` from Worker test discovery)

## What deviated from the plan

1. **CMS chain validation with real DigiCert token**: The real TSA token from
   production does not embed the intermediate certificate, so offline chain
   validation cannot fully succeed without fetching the intermediate online.
   The test verifies PKIjs correctly rejects empty trust roots (#332 guard)
   and handles all error cases. Full chain validation requires the intermediate
   cert, which will need to be bundled in a future update.

2. **No changes to Worker code**: As specified in scope.

## Backlog changes

No items added to the active backlog. The following were explicitly deferred
per the issue scope:

- **npm publishing**: Deferred to a separate task (issue #78 scope note)
- **CRL/OCSP revocation checking**: Deferred (offline requirement conflicts)
- **DigiCert intermediate cert bundling**: Needed for full offline CMS chain
  validation without network access
- **CLI README content**: `--help` is the primary reference; full README deferred
- **Main repo README update**: 3-line addition mentioning the CLI tool deferred

## Surprises

The DigiCert TSA timestamp tokens don't embed the intermediate certificate in
the CMS `certificates` field. This means the CMS chain validation from the
bundled root cert to the leaf signer cert has a gap -- the intermediate cert
must either be fetched online or bundled separately. The tool handles this
gracefully (the check reports the specific failure detail), but full offline
chain validation needs the intermediate cert bundled in `certs/trusted-roots/`.
