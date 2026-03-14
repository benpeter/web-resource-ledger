# Decisions: WACZ Bundling and Signing

## 1. Rejected warcio.js in favor of manual WARC construction

**Issue #4 specified**: "WARC records constructed via warcio.js"

**Decision**: Build WARC/1.1 records manually (~210 lines in `src/warc.js`).

**Why**: warcio.js pulls in three dependencies incompatible with Cloudflare
Workers: `hash-wasm` (WASM compilation not available), `tempy` (filesystem
access not available), and `pako` (redundant with our uncompressed approach).
These are hard blockers, not preference.

**Alternative considered**: Forking warcio.js to strip incompatible deps.
Rejected because the fork maintenance burden exceeds the cost of ~210 lines
of manual construction. WARC/1.1 is a simple text format with well-defined
record boundaries.

**Raised by**: data-minion (spec research), edge-minion (Workers constraints)

## 2. Signatures in datapackage-digest.json, not signatures array in datapackage.json

**Issue #4 specified**: "Manifest signatures array receives one entry of
type: self" and "The signatures array structure is designed to accommodate
RFC 3161 TSA timestamps later without format changes"

**Decision**: Follow WACZ-Auth 0.1.0 spec -- signatures go in a separate
`datapackage-digest.json` file containing `signedData` object.

**Why**: The WACZ-Auth spec (the actual standard) uses a separate file.
Issue #4 was written before spec research. The `signedData` object in
`datapackage-digest.json` can grow to accommodate RFC 3161 timestamps --
the extensibility goal is preserved under the new structure. Keeping
`datapackage.json` clean means standard WACZ tools can parse the manifest
even without understanding our signing.

**RFC 3161 accommodation**: The `signedData` object can accept additional
fields (e.g., `timestamp`, `tsaUrl`). Alternatively, RFC 3161 could be a
second entry in a future `signatures` array within the digest file. The
backlog item "[should] RFC 3161 timestamps via TSA" remains actionable
under either approach.

**Raised by**: data-minion (spec research), security-minion (format review)

## 3. Uncompressed WARC and CDXJ (no gzip)

**Decision**: Store `archive/data.warc` (not `.warc.gz`) and
`indexes/index.cdxj` (not `.cdx.gz`). No gzip anywhere in the pipeline.

**Why**: WACZ spec allows both compressed and uncompressed WARC files.
Uncompressed eliminates an entire class of gzip determinism bugs, simplifies
the construction pipeline, and makes debugging easier. The ZIP itself is
STORE mode (no compression), so the WACZ file is not double-compressed
either way.

**Trade-off**: Slightly larger WACZ files. Acceptable for MVP -- captures
are single pages, not large crawls.

**Raised by**: edge-minion (KISS), data-minion (suggested gzip but
acknowledged both are valid)

## 4. Graceful degradation when signing key is absent

**Decision**: If `SIGNING_KEY` is not configured or signing fails, the
capture completes normally without producing a WACZ bundle. Individual
artifacts (screenshot, HTML, headers) are still stored in R2.

**Why**: The capture pipeline already stores individual artifacts before
WACZ bundling. A misconfigured secret should not prevent all captures.
The 17 existing capture tests would also break if WACZ were mandatory.

**Rejected alternative**: security-minion argued captures MUST fail if
signing fails -- "unsigned bundles violate the value proposition." Counter:
no unsigned WACZ is stored; if signing fails, WACZ is skipped entirely.
Individual artifacts were never signed and were never claimed to be.

**Signaling**: KV record has no `wacz` field when WACZ was skipped.
Operators can detect missing WACZ by querying KV.

**Raised by**: edge-minion (graceful degradation), vs security-minion
(strict enforcement). Resolved by YAGNI -- strict enforcement deferred
to post-MVP verification endpoint.

## 5. PKCS8 DER key format (not raw 32 bytes)

**Issue #4 specified**: "base64-encoded raw 32 bytes"

**Decision**: Store as base64-encoded PKCS8 DER (48 bytes = 16-byte ASN.1
header + 32-byte Ed25519 seed).

**Why**: Web Crypto `importKey('raw', ...)` does not work for private keys
in Ed25519. Only `importKey('pkcs8', ...)` is supported. The PKCS8 format
is directly consumable by Web Crypto without runtime transformation.

**Alternative considered**: JWK format. Rejected because it is larger
(JSON overhead) and requires parsing. PKCS8 DER is compact and directly
importable.

**Raised by**: security-minion + data-minion (consensus), edge-minion
(confirmed via spike test)

## 6. fflate as the ZIP library

**Decision**: Use `fflate` (^0.8.2) for ZIP construction via `zipSync()`
with level 0 (STORE mode).

**Why**: ZIP construction is non-trivial to implement correctly (~80+ lines
for STORE-mode-only, more with proper ZIP64 headers). fflate is ~29KB
minified, has zero transitive dependencies, is widely used, and is
tree-shakeable. With level 0 import, the actual bundle impact is small.

**Alternatives considered**:
- jszip: much heavier, overkill for STORE-mode-only
- archiver: Node.js streams, incompatible with Workers
- Manual ZIP writer: ~80 lines for basic STORE, but fragile and
  not worth the maintenance risk

**Helix Manifesto justification**: "What does this dependency give me that
I can't do in 10 lines of vanilla code?" ZIP format requires directory
entries, local file headers, central directory records -- significantly
more than 10 lines. fflate earns its place.

**Raised by**: edge-minion (recommended), margo (approved with bundle
size note)

## 7. Ed25519 via standard Web Crypto (not node:crypto fallback)

**Decision**: Use standard `'Ed25519'` algorithm name with Web Crypto API
for sign/verify/importKey. Use `node:crypto` only for public key
derivation from the private key (SPKI export).

**Why**: The spike test (Task 1) confirmed all Web Crypto Ed25519
operations work in the workerd runtime. No fallback needed.

**Raised by**: test-minion (workerd confirmation), edge-minion (standard
API recommendation)
