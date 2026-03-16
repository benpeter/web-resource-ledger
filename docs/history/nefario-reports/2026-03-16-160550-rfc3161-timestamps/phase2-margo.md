# Margo: YAGNI/KISS Assessment -- ASN.1 Approach for RFC 3161

**Verdict: ADVISE** -- hand-rolled minimal DER codec is the right approach, but
with specific guardrails.

---

## Recommendations

### 1. Hand-roll a minimal DER encoder/decoder. Do NOT add a general-purpose ASN.1 library.

**Why this is the right call:**

The project has 2 runtime dependencies. The codebase is ~16 source files of
focused, readable vanilla JS. The engineering philosophy (CLAUDE.md) explicitly
mandates YAGNI, KISS, lean-and-mean, and "what does this dependency give me
that I can't do in 10 lines of vanilla code?"

The ASN.1 surface area for RFC 3161 is narrow and well-defined:

**Encoding (TimeStampReq):**
- SEQUENCE, INTEGER (version = 1), SEQUENCE (MessageImprint: OID for SHA-256 +
  OCTET STRING for hash), optional INTEGER (nonce), optional BOOLEAN (certReq)
- This is a fixed structure. The only variable is the 32-byte hash value. The
  rest is constant bytes. A DER encoder for this is ~40-60 lines of code.

**Parsing (TimeStampResp):**
- Extract PKIStatusInfo (an INTEGER for granted/rejection status)
- Extract the TimeStampToken (a ContentInfo SEQUENCE containing CMS SignedData)
- For verification: extract TSTInfo from within the CMS structure to confirm the
  hash matches what was submitted
- Store the entire TimeStampResp as an opaque blob in the WACZ (this is the
  actual timestamp proof; the TSA's signature over it is what makes it
  independently verifiable)

**Verification (TSTInfo extraction):**
- Navigate the CMS SignedData structure to reach the encapsulated content
  (TSTInfo)
- Parse TSTInfo to extract messageImprint (hash algorithm + hash value) and
  genTime (timestamp)
- Compare messageImprint against what was submitted
- The CMS signature itself is verified by the TSA's certificate chain -- but
  full certificate chain validation in Workers is out of scope (see security
  concerns below)

The total hand-rolled DER codec is estimated at 150-250 lines. A general-purpose
ASN.1 library like `asn1.js` (npm) is 8,000+ lines and pulls in `bn.js`
(another 4,000+ lines). `@lapo/asn1js` is smaller but still provides a full
generic parser when we need to handle exactly two fixed message formats.

**Complexity budget:**

| Decision | Score |
|---|---|
| Hand-rolled DER codec (new code, no dependency) | 0 (it's application code) |
| General-purpose ASN.1 library (new dependency) | 1 + cognitive overhead |

The score difference is small, but the philosophical alignment is large. This
project has consistently built focused modules (warc.js hand-builds WARC
records, cdxj.js hand-builds CDXJ, signing.js does raw Ed25519 with
crypto.subtle). An ASN.1 library would be the only "toolkit" dependency --
everything else is purpose-built. Breaking that pattern needs justification.

### 2. The DER codec should be a single file: `src/rfc3161.js`

Not `src/asn1.js` + `src/der.js` + `src/rfc3161.js`. One module that encodes
TimeStampReq and parses TimeStampResp. Internal helpers (writeTLV, readTLV) are
private functions in that file, not exported abstractions.

**Why:** The WARC builder (`warc.js`) follows this exact pattern -- it hand-builds
WARC records with internal helper functions, not a generic "record format"
library. The DER codec should mirror this: a purpose-built module for RFC 3161,
not a reusable ASN.1 toolkit.

If a second ASN.1 use case emerges (it won't -- YAGNI), extraction can happen
then. The cost of extraction later is near-zero because the helpers will already
be well-tested.

### 3. Store the raw TimeStampResp bytes as base64 in the WACZ

Do not parse and re-serialize the TSA response. Store the exact bytes the TSA
returned. This is the actual evidence artifact -- any transformation risks
invalidating the TSA's signature.

For verification, parse the stored blob to extract TSTInfo and confirm the hash
matches. The CMS signature verification (validating the TSA's certificate chain)
is a separate concern -- see risks below.

### 4. Scope the DER parser strictly: extraction, not full validation

The DER parser needs to:
1. Navigate to specific tagged values within known structures (SEQUENCE, CONTEXT-TAGGED)
2. Extract OCTET STRING (hash value), INTEGER (status, nonce), GeneralizedTime (genTime)
3. Reject malformed input (length overflows, truncated data, unexpected tags)

It does NOT need to:
- Handle INDEFINITE-LENGTH encoding (DER forbids it)
- Handle SET sorting
- Handle constructed OCTET STRINGs
- Support arbitrary schema definitions
- Build an ASN.1 object graph

This scope constraint is what makes hand-rolling feasible and safe.

### 5. No middle-path library exists that fits

I evaluated the options:

| Library | Size | Dependencies | Workers-compatible | Assessment |
|---|---|---|---|---|
| `asn1.js` | 8K+ lines | bn.js, inherits, minimalistic-assert | Probably | Massively over-scoped; YAGNI |
| `@lapo/asn1js` | ~2K lines | 0 | Yes | Generic parser; still over-scoped |
| `asn1-ts` | Large | Multiple | Unclear | Enterprise-grade; absurd for this |
| `pkijs` | Very large | asn1js, pvutils | Yes | Full PKI toolkit; absurd for this |
| Hand-rolled | 150-250 lines | 0 | Yes | Purpose-built, testable, auditable |

There is no "tiny focused RFC 3161 library" in the npm ecosystem. The packages
that exist (`rfc3161-client`, etc.) either have heavy dependencies, are unmaintained,
or are Node.js-specific (not Workers-compatible).

The absence of a focused library is itself evidence that the problem is either
solved by a full PKI toolkit (which we don't need) or by purpose-built code
(which is what we should write).

---

## Proposed Tasks

### Task 1: Build `src/rfc3161.js` -- DER encoder/decoder for RFC 3161

Single module containing:
- `buildTimeStampReq(hashBytes)` -- returns DER-encoded TimeStampReq as Uint8Array
- `parseTimeStampResp(derBytes)` -- returns `{ status, hashAlgorithm, hashValue, genTime, rawToken }` or throws
- Internal helpers: `writeTLV`, `readTLV`, `readLength`, `writeLength`, OID constants

Estimated size: 150-250 lines. No external dependencies.

**Guardrails (non-negotiable):**
- Length fields must be validated against remaining buffer size (prevent over-read)
- Tag bytes must be checked explicitly (prevent type confusion)
- Maximum total input size cap (e.g., 64 KB -- a legitimate TimeStampResp is
  typically 2-5 KB; anything over 64 KB is malformed or adversarial)
- Nonce round-trip validation (if a nonce is sent, the response must echo it)

### Task 2: Tests for DER encoder/decoder

Use real TSA response fixtures (capture one real response from the chosen TSA
during development and embed it as a hex/base64 constant). Also test:
- Malformed DER (truncated, invalid tags, length overflow)
- Status rejection (TSA returns non-zero status)
- Nonce mismatch
- Hash mismatch in TSTInfo vs. submitted hash

### Task 3: Integration into `buildWacz()` and verification pipeline

This is implementation, not margo's domain. But from a complexity perspective:
- The TSA fetch should be a single `fetch()` call with a hard timeout
- The result should be stored as a new entry in the `signatures` array
- If the TSA is unreachable, the capture succeeds without a timestamp -- one
  try/catch, not a retry loop

---

## Risks and Concerns

### Risk 1: CMS certificate chain validation is out of scope (and that's correct)

Full verification of the TSA's certificate chain (is the TSA certificate trusted?
was it revoked? is the chain valid?) requires a certificate store, CRL/OCSP
checking, and chain-building logic. This is NOT feasible in Cloudflare Workers
and NOT needed for the MVP.

**What we CAN verify:** the hash in TSTInfo matches what we submitted, and
the genTime is plausible (within a reasonable window of the capture time).

**What we CANNOT verify in Workers:** the TSA's cryptographic signature over
the TSTInfo. This is fine -- the timestamp token is stored as evidence. A
third-party verifier with a full PKI stack can validate the TSA's signature
independently. WRL's job is to obtain and store the timestamp, not to be the
final arbiter of TSA trust.

**YAGNI boundary:** do not build certificate chain validation. It would require
either a massive dependency (pkijs) or hand-rolling CMS signature verification,
which is a different order of magnitude from DER parsing. The backlog already
parks "eIDAS Qualified TSA" and "WACZ-Auth full spec compliance" -- full TSA
certificate validation belongs in that tier.

### Risk 2: DER parsing bugs could create security vulnerabilities

Hand-rolled binary parsers are a common source of bugs (buffer over-reads, integer
overflows). Mitigations:

1. Cap input size (64 KB max)
2. Validate all length fields before reading
3. Use DataView for multi-byte integer reads (prevents endianness bugs)
4. Comprehensive test coverage with malformed inputs
5. The parser is read-only (parsing a response) -- it cannot affect the TSA or
   the signing pipeline. The worst case is incorrect verification, not data
   corruption.

### Risk 3: Scope creep into "general-purpose ASN.1"

The DER codec MUST remain RFC 3161-specific. If the implementation starts
growing beyond ~300 lines, or if someone proposes making the helpers reusable
for other ASN.1 formats, that's a scope creep signal. The module should be
named `rfc3161.js`, not `asn1.js` or `der.js`, to signal its scope.

### Risk 4: TSA response format variation

Different TSAs may produce slightly different CMS structures (different
certificate chains, different signed attribute sets). The parser must navigate
the CMS structure by tags and offsets, not by assuming fixed byte positions.
This is the one area where a generic ASN.1 library would be more resilient --
but the trade-off (8,000+ lines of dependency vs. careful tag-based navigation)
favors the hand-rolled approach given the project's philosophy.

**Mitigation:** test against real responses from the chosen TSA (DigiCert or
GlobalSign) during development. If a second TSA is added later (backlog: "Multiple
TSAs for redundancy"), validate its response format then.

---

## Additional Agents Needed

- **security-minion**: Must review the DER parser for buffer safety, input
  validation, and the decision NOT to do CMS signature verification. This is the
  highest-risk code in the feature -- hand-rolled binary parsing of
  externally-sourced data.
- **test-minion**: Must plan the test fixture strategy (real TSA responses vs.
  synthetic DER). The DER codec is the most testable component in this feature --
  pure function, deterministic, no side effects. Test coverage should be thorough.

---

## Summary: Why Hand-Roll?

| Factor | Library | Hand-rolled |
|---|---|---|
| Dependency count | +1 (possibly +2 with transitive) | 0 |
| Code under team control | No | Yes |
| Attack surface | Large (generic parser) | Small (fixed structures) |
| Lines of code in project | ~0 (imported) | 150-250 |
| Lines of code in node_modules | 8,000-12,000 | 0 |
| Consistency with project style | Breaks pattern | Matches warc.js, cdxj.js |
| YAGNI compliance | Imports full ASN.1 for 2 message types | Builds exactly what's needed |
| Supply chain risk | Real (npm attack surface) | None |
| Maintenance burden | Upstream changes, CVEs, breaking versions | Stable (RFC 3161 is frozen since 2004) |

The DER structures for RFC 3161 are specified in an RFC that hasn't changed
in 20+ years. The message formats are simple, fixed, and small. This is the
exact scenario where hand-rolling wins: stable spec, narrow scope, strong
project convention, zero dependency tolerance.

Build the minimum viable DER codec. Test it thoroughly. Move on.
