## Security Review Verdict: ADVISE

The plan is well-structured with strong security awareness already built in.
The PKIjs bug validation requirement, timing-safe comparison, decompressed-size
guard, and trust-model transparency are all good. The items below are gaps the
implementation prompts do not fully close.

---

- [security]: The 100MB decompressed-size guard is applied AFTER unzipSync completes, meaning fflate has already allocated memory for the full decompressed payload before the check fires.
  SCOPE: `packages/verify/lib/verify.js`, Task 2 security hardening section
  CHANGE: Apply the size limit pre-decompression using fflate's streaming or per-entry size tracking. At minimum, check compressed input size before calling unzipSync -- WACZ files containing a 10MB compressed stream that expands 10:1 exceed 100MB silently. The current plan's `unzipSync` call completes first, then checks total size. The check must reject before memory is fully allocated, or the OOM risk is just deferred.
  WHY: A maliciously crafted WACZ (zip bomb) can exhaust memory before the 100MB check is evaluated. fflate's `unzipSync` will attempt to decompress all entries eagerly; the size check on the returned object is too late to prevent the allocation.
  TASK: Task 2

- [security]: The `--trust-embedded` warning is printed to stderr but the verification result itself does not distinguish embedded-key verification from trusted-origin verification in the JSON output.
  SCOPE: `packages/verify/lib/format.js`, `packages/verify/lib/verify.js`, Task 3
  CHANGE: The `keyResolution.source` field is already specified as `"embedded"` in the JSON schema -- ensure the `verified` field is NOT set to `true` when source is `"embedded"`. Either rename the verdict to reflect the weaker trust level (e.g., `"consistent"` rather than `true`) or add a separate `trustLevel` field that downstream consumers can check. Without this, a script consuming `--json` output cannot tell the difference between a fully verified capture and one that only proved self-consistency.
  WHY: A consumer piping `--json` and checking `"verified": true` cannot distinguish `source: "origin"` (cryptographically verified against a trusted third party) from `source: "embedded"` (self-asserted). This undermines the trust model and creates a category of false positives for automated pipelines.
  TASK: Task 3

- [security]: The `key-resolver.js` origin derivation from a WRL capture URL has no URL scheme validation -- it trusts the scheme from whatever string is passed as the URL.
  SCOPE: `packages/verify/lib/key-resolver.js`, Task 3
  CHANGE: Before making any fetch request derived from user input (either the file-or-url argument or `--origin`), enforce that the scheme is `https:`. Reject `http:`, `file:`, `data:`, and any other scheme with a usage error (exit 2). The plan already says to auto-derive origin from WRL capture URLs, but the `isWrlCaptureUrl` regex only checks path structure, not scheme.
  WHY: An attacker who can control the input URL (e.g., in a scripted pipeline) could supply `http://attacker.example.com/v1/captures/cap_aabbccdd...` and have the CLI fetch a signing key from an attacker-controlled server over plaintext HTTP. The trust model is then completely bypassed.
  TASK: Task 3

- [security]: The WACZ download has a 100MB size guard, but the key endpoint fetch (5s timeout, 30s for WACZ) has no response body size limit.
  SCOPE: `packages/verify/lib/key-resolver.js`, Task 3
  CHANGE: Add a response body size limit on `/.well-known/signing-key` and `/.well-known/signing-keys` fetches (suggest 1MB -- a signing key response should be under 1KB). Read the response with a size cap rather than `response.json()` directly.
  WHY: A malicious or misconfigured origin server returning a very large body to the key endpoint will cause the CLI to attempt to parse an arbitrarily large JSON payload. This is a denial-of-service risk and an input validation gap.
  TASK: Task 3

- [security]: The bundled DigiCert root certificate is fetched at build time from an external URL in Task 1 (`https://cacerts.digicert.com/DigiCertTrustedRootG4.crt.pem`) with no integrity verification specified in the plan.
  SCOPE: `packages/verify/certs/trusted-roots/DigiCertTrustedRootG4.pem`, Task 1
  CHANGE: After downloading the cert, verify its SHA-256 fingerprint against the known value (DigiCert Trusted Root G4 fingerprint: `552F7BDCF1A7AF9E6CE672017F4F12ABF77240C78E761AC203D1D9D20AC89988` for the DER form). Hard-code the expected fingerprint in the Task 1 prompt. Do NOT commit a cert that was fetched without verification.
  WHY: If the download is MITM'd or the DigiCert CDN serves a different cert (even transiently), the trust anchor itself becomes compromised. Anyone running `npm install @wrl/verify` would then trust an attacker-controlled root for all CMS chain verification. This is a supply chain attack via a trusted-root substitution.
  TASK: Task 1

- [security]: The `verifyWacz` function in `verify.js` exposes `capture.publicKey` in its return value, and the JSON output schema includes `"publicKey": "base64..."`. The plan notes "Embedded publicKey in result is informational, NOT used for verification" as a security invariant to test, but the implementation prompt for Task 3 does not explicitly warn the implementer to make this distinction clear in the JSON output.
  SCOPE: `packages/verify/lib/format.js`, JSON output schema, Task 3
  CHANGE: Add a note in the JSON output schema or in format.js that `capture.publicKey` is the key embedded in the WACZ file (self-asserted) and is NOT necessarily the key used for verification. The key used for verification should come from `keyResolution`, not `capture`. Consider renaming to `capture.embeddedPublicKey` in the JSON schema to make the distinction unambiguous.
  WHY: A consumer reading the JSON output who uses `capture.publicKey` for downstream trust decisions (e.g., to re-verify or to identify the signer) would be operating on the WACZ-embedded key rather than the externally-resolved key. This is a subtle confusion vector that becomes a vulnerability in any automated pipeline.
  TASK: Task 3
