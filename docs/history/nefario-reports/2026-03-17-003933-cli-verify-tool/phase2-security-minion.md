## Domain Plan Contribution: security-minion

### Recommendations

#### 1. Library Selection: PKIjs (pkijs)

After evaluating the four candidate libraries against the requirements (CMS
SignedData signature verification, X.509 certificate chain validation,
maturity, bundle size for npx, maintenance status, API quality), **PKIjs is
the clear and only viable choice**.

**Evaluation summary:**

| Library | CMS SignedData verify | X.509 chain validation | Maintenance | Verdict |
|---------|----------------------|------------------------|-------------|---------|
| **pkijs** | Full support via `SignedData.verify()` with `checkChain: true`, `trustedCerts` | Built-in chain engine, pure JS + WebCrypto | Active (v3.3.3, published ~3 months ago, ~195k weekly downloads) | **Recommended** |
| **node-forge** | **No functional `pkcs7.verify()` method** -- the library explicitly lacks CMS signature verification (see [issue #849](https://github.com/digitalbazaar/forge/issues/849), [issue #305](https://github.com/digitalbazaar/forge/issues/305)). Developers must manually validate authenticated attributes. | Has `verifyCertificateChain()` but disconnected from PKCS#7 | Active but 29M weekly downloads masks stagnation in PKCS#7 area | **Eliminated** -- cannot verify CMS signatures |
| **@peculiar/x509** | No CMS/PKCS#7 support -- focused on X.509 certificate operations only | Certificate chain validation, but no CMS envelope handling | Active, same org as pkijs (Peculiar Ventures) | **Eliminated** -- no CMS support |
| **node:crypto X509Certificate** | No CMS support whatsoever | `x509.verify(publicKey)` verifies single cert signature only -- no chain walking, no trust anchor evaluation, no revocation checking | Node.js built-in | **Eliminated** -- too low-level, would require reimplementing the chain engine |

**PKIjs specifics:**
- Dependencies: `asn1js` (ASN.1 engine) + `pvutils` (utility functions). Both
  are from the same organization (Peculiar Ventures).
- Built on WebCrypto API, which is available in Node.js 15+. The CLI targets
  Node 20+ (per `package.json` engines), so no compatibility concern.
- The `SignedData.verify()` API directly accepts `trustedCerts` and
  `checkChain: true`, providing a single call that verifies the CMS
  signature AND validates the certificate chain up to a trusted root.
- PKIjs also provides `TimeStampResp` and `ContentInfo` classes that can parse
  the DER token directly, but the CLI should only use PKIjs for the
  cryptographic verification step, not to replace the existing DER parser
  (see recommendation #4).

**Bundle size consideration for npx:** PKIjs + asn1js + pvutils add
approximately 200-300KB to installed node_modules (not minified -- this is a
CLI, not a browser bundle). For an npx-invoked CLI this is acceptable. The
alternative of hand-rolling CMS signature verification and X.509 chain
validation would be thousands of lines of security-critical code -- that is
where the real risk lies.

#### 2. Trust Anchor Strategy: Bundled + Extensible

The CLI must bundle specific trusted root certificates rather than relying on
the system trust store. Reasons:

1. **Reproducibility** -- verification results must be identical across
   machines regardless of OS trust store contents. A macOS machine, a Linux
   container, and a Windows CI runner must all produce the same result.

2. **Minimality** -- the system trust store contains hundreds of roots. The CLI
   only needs to trust the specific root CAs that chain to known TSA
   providers. Bundling a subset is both safer (smaller attack surface) and
   philosophically aligned with the project's Helix Manifesto principles.

3. **Offline capability** -- the task requires offline verification. Fetching
   roots at runtime defeats this.

**Concrete approach:**

- Bundle the **DigiCert Trusted Root G4** certificate (expires 2038-01-15) as
  a PEM file in the CLI package. This is the root that chains to DigiCert's
  timestamping intermediate (`DigiCert Trusted G4 RSA4096 SHA256 TimeStamping CA`).
  Download from: https://cacerts.digicert.com/DigiCertTrustedRootG4.crt

- Design the trust store as an **array of PEM certificates loaded from a
  directory** (e.g., `certs/trusted-roots/`). This makes it trivial to add
  roots for other TSAs without code changes -- just drop a PEM file.

- **Do NOT hardcode DigiCert.** The project has already switched TSAs once
  (Sectigo -> DigiCert). The trust store must be a configuration surface, not
  a constant. The bundled roots are defaults, not the only option.

- Provide a `--trust-root` CLI flag to specify additional trusted root PEM
  files at verification time. This supports users who capture with a
  different TSA than the default.

- **Do NOT use the system trust store** (e.g., `tls.rootCertificates` from
  Node.js). This introduces non-determinism and makes the CLI dependent on OS
  configuration that varies between environments.

#### 3. Verification Chain: Complete RFC 3161 Section 2.4.2 Compliance

The verification must implement the full chain specified in RFC 3161 Section
2.4.2 (Response Verification). The current code only does step 4 (hash match).
The complete chain is:

**Step 1: Parse the CMS ContentInfo envelope**
- Decode the base64 token to DER bytes
- Parse as CMS ContentInfo (OID: id-signedData, 1.2.840.113549.1.7.2)
- Extract the SignedData structure

**Step 2: Verify the CMS cryptographic signature**
- Using PKIjs `SignedData.verify()`, verify that the signature in
  `SignerInfo` was computed over the correct content (the encapsulated
  TSTInfo) using the signer's private key
- This proves the TSTInfo was not modified after the TSA signed it

**Step 3: Validate the TSA certificate chain**
- Using PKIjs `SignedData.verify({ checkChain: true, trustedCerts: [...] })`,
  validate that the signer certificate chains to a bundled trusted root
- This proves the signer is who they claim to be

**Step 4: Validate certificate properties**
- **Validity period**: The signer certificate must have been valid at the
  time indicated by `genTime`. Not just "valid now" -- the certificate must
  have been valid *when the timestamp was issued*. This is critical because
  TSA certificates rotate; a timestamp from 2026 signed by a cert that
  expired in 2025 is invalid.
- **Extended Key Usage**: The signer certificate MUST contain
  `id-kp-timeStamping` (OID 1.3.6.1.5.5.7.3.8). RFC 3161 Section 2.3
  requires this extension to be critical and to be the only EKU present.
  If the signer cert is authorized for other purposes (e.g., TLS server
  auth), something is wrong.
- **Key Usage**: If present, must include `digitalSignature` and/or
  `nonRepudiation` (depending on the certificate profile).

**Step 5: Verify messageImprint (existing check)**
- The hash algorithm OID in TSTInfo.messageImprint.hashAlgorithm must be
  sha-256 (OID 2.16.840.1.101.3.4.2.1)
- The hash value in TSTInfo.messageImprint.hashedMessage must match the
  computed bundleHash
- This is what the current `verifyTimestamp()` already does

**Step 6: Report verification depth**
- The CLI output should clearly distinguish between:
  - "messageImprint matches" (hash integrity -- what the Worker does today)
  - "CMS signature valid" (cryptographic proof the TSA signed this TSTInfo)
  - "certificate chain trusted" (the TSA is a recognized authority)
- This gives users a layered understanding of what was verified

**What to skip for now (with explicit documentation):**
- **CRL/OCSP revocation checking** -- requires network access, breaks offline
  requirement. Document as a known limitation. Revocation checking is a
  SHOULD in RFC 3161, not a MUST.
- **TSA policy OID validation** -- the CLI does not have a policy to enforce.
  Log the policy OID for informational purposes.
- **Accuracy field validation** -- rarely populated by commercial TSAs, and
  the genTime is the useful output.

#### 4. DER Parser Strategy: Keep Existing, Use PKIjs for Crypto Only

The existing hand-rolled DER parser in `rfc3161.js` is well-tested (17 tests),
minimal, and correct for its purpose (extracting TSTInfo fields from a
TimeStampToken). It should NOT be replaced.

**The CLI should:**
1. Use the existing `extractTSTInfo()` to get messageImprint, genTime, nonce
   (the fields needed for the hash-match check)
2. Use PKIjs `ContentInfo.fromBER()` + `SignedData.verify()` for the
   cryptographic verification (signature + chain)
3. Keep these as separate, independently testable steps

**Rationale:**
- The existing parser is purpose-built and audited. Replacing it with PKIjs's
  generic ASN.1 parser adds surface area without adding security value for
  the field extraction task.
- PKIjs is needed specifically for the *crypto operations* (signature
  verification, chain validation) that WebCrypto alone cannot do at the CMS
  abstraction level.
- This separation means the Worker (Cloudflare) keeps using the existing
  parser for its limited verification, while the CLI adds the crypto layer on
  top. No code needs to change in the Worker path.

#### 5. Security Architecture for the CLI Itself

The CLI is a verification tool that users run on untrusted input (WACZ files
from arbitrary sources). It must be defensive:

- **Treat the WACZ as hostile input** -- malformed ZIP, oversized files,
  path traversal in ZIP entries, zip bombs. The existing `unzipSync` from
  fflate is reasonable but add a max decompressed size check.
- **Treat the DER token as hostile input** -- the existing parser already
  validates tag bytes and buffer bounds, which is good. PKIjs also validates
  ASN.1 structure on parse.
- **No network access during verification** -- the CLI must work fully
  offline. No CRL fetching, no OCSP, no certificate downloads. Everything
  needed for verification must be in the WACZ + bundled trust store.
- **Constant-time comparison for hash values** -- use `crypto.timingSafeEqual`
  for the messageImprint hash comparison, not string `===`. The current code
  uses string comparison, which is a minor timing side channel. In a CLI
  this is low-risk but trivial to fix and establishes correct practice.
- **No secrets in the CLI** -- the verification tool uses only public keys
  and public root certificates. The signing key never touches this package.

### Proposed Tasks

#### Task A: Bundle trusted root certificates
- **What**: Download DigiCert Trusted Root G4 in PEM format. Create a
  `certs/trusted-roots/` directory in the CLI package. Write a loader that
  reads all PEM files from this directory at startup. Add a `--trust-root`
  CLI flag for additional roots.
- **Deliverables**: `certs/trusted-roots/DigiCertTrustedRootG4.pem`, root
  loader module, CLI flag integration
- **Dependencies**: None (can be done in parallel with other tasks)

#### Task B: Add PKIjs dependency and CMS verification module
- **What**: Add `pkijs` (which brings `asn1js` and `pvutils`) as a
  dependency to the CLI package. Create a new module (e.g.,
  `cms-verify.js`) that:
  1. Takes a base64 DER timestamp token and an array of trusted root PEM certs
  2. Parses the token as CMS ContentInfo
  3. Extracts SignedData
  4. Calls `signedData.verify({ signer: 0, checkChain: true, trustedCerts })`
  5. Validates EKU (id-kp-timeStamping) on the signer certificate
  6. Validates the signer cert was valid at genTime
  7. Returns a structured result: `{ signatureValid, chainTrusted, signerInfo }`
- **Deliverables**: `cms-verify.js` module, unit tests with real DigiCert
  timestamp fixtures
- **Dependencies**: Task A (needs trusted roots for chain validation tests)

#### Task C: Integrate CMS verification into the verification pipeline
- **What**: Update the CLI's verification flow to call the new CMS
  verification module when checking timestamps. The existing
  `verifyTimestamp()` (hash match) remains as step 1. The new CMS
  verification becomes step 2. Report both results in the CLI output.
  The `timestamp` check should now report one of:
  - `pass` -- hash matches AND CMS signature valid AND chain trusted
  - `fail` -- any cryptographic check failed (with specific detail)
  - `skip` -- no timestamp present
- **Deliverables**: Updated verification pipeline, updated CLI output format,
  integration tests
- **Dependencies**: Task B

#### Task D: Certificate property validation
- **What**: After CMS signature and chain verification, validate:
  1. EKU contains id-kp-timeStamping (OID 1.3.6.1.5.5.7.3.8)
  2. EKU extension is critical
  3. Signer certificate validity period covers genTime
  4. Key Usage includes digitalSignature (if KU extension present)
  Report each check distinctly so users understand exactly what was validated.
- **Deliverables**: Certificate property checks in `cms-verify.js`, tests
  with synthetic certificates that fail each check individually
- **Dependencies**: Task B

#### Task E: Hardening and defensive input handling
- **What**: Add max decompressed size check to WACZ unzipping. Switch
  messageImprint comparison to `crypto.timingSafeEqual`. Add tests for
  malformed/truncated DER tokens, oversized tokens, tokens with invalid
  ASN.1 structure. Verify that PKIjs rejects malformed CMS structures
  gracefully (no unhandled throws that crash the CLI).
- **Deliverables**: Hardened input handling, negative test cases
- **Dependencies**: Task C (needs the full pipeline to test end-to-end)

### Risks and Concerns

#### HIGH: PKIjs `SignedData.verify()` chain validation bug (Issue #332)

There is a [known issue](https://github.com/PeculiarVentures/PKI.js/issues/332)
where `SignedData.verify` with `checkChain: true` was reported to always
return `true` regardless of the trusted certs provided. This may have been
fixed in v3.x but MUST be verified with a concrete test: pass an empty
`trustedCerts` array and confirm verification FAILS. If this bug still exists
in the current version, the chain validation is security theater.

**Mitigation**: Write a test in Task B that explicitly verifies chain
validation rejects an untrusted signer. If the test passes with empty
trustedCerts (it should not), file a bug and implement manual chain walking
as a fallback using `@peculiar/x509` for the chain validation step only.

#### MEDIUM: TSA certificate rotation breaks pinned trust

DigiCert will eventually rotate their timestamping intermediate or root
certificate. Old captures timestamped with a previous chain will fail
verification if the CLI only bundles the current root.

**Mitigation**: The `certs/trusted-roots/` directory approach handles this --
bundle both old and new roots during transition periods. The `--trust-root`
flag is the escape hatch. Document the certificate lifecycle in the CLI's
help text.

#### MEDIUM: CRL/OCSP gap

Without revocation checking, a timestamp signed by a revoked TSA certificate
will still verify as valid. This is a known limitation of offline
verification.

**Mitigation**: Document explicitly in CLI output and README. Note that RFC
3161 Section 2.4.2 says revocation checking is a SHOULD, not MUST.
Commercial TSAs (DigiCert) have never had a timestamping certificate revoked
in practice, but the theoretical risk exists.

#### LOW: PKIjs supply chain risk

Adding PKIjs introduces a dependency chain (pkijs -> asn1js -> pvutils).
Peculiar Ventures is a small company. A compromise of any of these packages
could inject malicious code into the verification pipeline.

**Mitigation**: Pin exact versions in package.json (no `^` or `~`). Commit
the lockfile. Add `npm audit` to CI. Consider vendoring the packages if the
CLI has a long release cycle. The packages are well-established (195k weekly
downloads) and maintained by a recognized PKI company, so the risk is low
but non-zero.

#### LOW: Timing side channel in hash comparison

The current string `===` comparison for messageImprint is technically a
timing side channel. In a CLI context (attacker cannot observe timing) this
is negligible, but fixing it is trivial and establishes correct practice.

**Mitigation**: Task E replaces with `crypto.timingSafeEqual`.

### Additional Agents Needed

- **test-minion**: Should be consulted for the test strategy around CMS
  verification. Specifically: how to create test fixtures with known-good
  and known-bad certificate chains, how to test EKU validation with
  synthetic certificates, and whether to use real DigiCert timestamp
  responses as golden fixtures or generate synthetic ones. The negative
  test cases (revoked cert, expired cert, wrong EKU, tampered signature)
  require careful fixture construction.

- No other additional agents needed beyond what is presumably already in
  the planning team. The library selection, trust model, and verification
  chain are security domain decisions. Implementation is straightforward
  JavaScript engineering.
