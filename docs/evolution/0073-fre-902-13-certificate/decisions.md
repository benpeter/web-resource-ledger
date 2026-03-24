# Decisions: FRE 902(13) Certification Document

## D1: PDF library selection

**Chosen**: pdf-lib v1.17.1 (exact version pin, no caret)
**Over**: vmprint (890KB bundle), raw PDF byte generation (maintenance burden), @cantoo/pdf-lib fork (unnecessary — unmaintained upstream isn't a blocker for a pinned version)
**Why**: pdf-lib is 270KB, pure JS, proven in Cloudflare Workers, deterministic with `updateMetadata: false`. 3M weekly downloads. Standard fonts only (Helvetica, Courier) avoid embedding. The pinned version eliminates supply chain risk from the unmaintained upstream.

## D2: Signature approach — detached vs embedded

**Chosen**: Detached Ed25519 signature via HTTP headers (X-Signature-Ed25519, X-Signature-Key-Id)
**Over**: Embedded PDF signature (CMS/PKCS#7 inside the PDF structure)
**Why**: Embedded signatures create a chicken-and-egg problem — you sign the document but the signature must be inside it, requiring a placeholder that's filled post-signing. This breaks determinism. Detached signatures are simpler, consistent with how WACZ signing already works, and verifiable independently. The `X-Signature-Key-Id` header carries the key fingerprint (not the raw public key) following the existing signing.js pattern.

## D3: Font choice — sans-serif vs serif

**Chosen**: Helvetica (body), Helvetica-Bold (headings), Courier (hashes/IDs)
**Over**: Times Roman / serif fonts (user-docs-minion recommended serif for "legal look")
**Why**: Both are standard PDF fonts requiring no embedding. Helvetica was chosen because pdf-lib's standard Times-Roman has limited glyph coverage. For an auto-generated certificate, professional readability matters more than visual tradition. Courier provides clear monospace distinction for cryptographic values.

## D4: Document structure — 6 sections

**Chosen**: Title, Attestation (blank qualified person fields), Process Description, Integrity Evidence, Operator Identity, Verification/Disclaimer
**Why**: Follows the FRE 902(13) requirements: a qualified person must certify that the electronic process produces accurate results. The attestation section has blank fields ([NAME], [TITLE/ROLE], [SIGNATURE REQUIRED]) because WRL generates the document — the qualified person must adopt it. This avoids pre-populating names which could create false attestation.

## D5: Public endpoint — no auth required

**Chosen**: Certificate endpoint is public, rate-limited via VERIFY_RATE_LIMITER
**Over**: Requiring authentication for certificate download
**Why**: Certificates are evidence artifacts that may need to be accessed by attorneys, courts, and opposing counsel who don't have WRL accounts. The capture ID (128-bit) serves as a capability token, consistent with the Phase 0075 decision to make individual capture endpoints public. Tenant isolation is enforced only when a valid API key is present (prevents cross-tenant enumeration).

## D6: Caching strategy — immutable

**Chosen**: `Cache-Control: public, max-age=31536000, immutable` for 200 responses, `no-store` for errors
**Why**: Certificates are deterministic — same captureId always produces the same PDF. Immutable caching is safe and eliminates redundant computation. Error responses use `no-store` because the error condition may be transient (e.g., capture still processing).

## D7: Test strategy — byte-level stream extraction

**Chosen**: Decompress FlateDecode streams with fflate's `unzlibSync`, then match hex-encoded text
**Over**: (1) Raw string matching on uncompressed streams (pdf-lib compresses by default, `useObjectStreams: false` doesn't disable FlateDecode), (2) PDF parser library (heavy dependency for tests only)
**Why**: pdf-lib always compresses page content streams with FlateDecode (zlib). Text in streams appears as hex strings (`<4865...> Tj`). The `pdfAllText` helper uses byte-level scanning (`findBytes`) on the raw Uint8Array to locate stream boundaries, decompresses with `unzlibSync`, then `pdfContains` converts search strings to hex for matching. This avoids adding a PDF parser dependency while validating actual document content.

## D8: Content stream compression — accept FlateDecode

**Initial plan**: Keep streams uncompressed for easier test string matching
**Actual**: pdf-lib's FlateDecode compression cannot be disabled per-stream; `useObjectStreams: false` only controls cross-reference streams
**Resolution**: Accept compressed streams, add fflate (already a transitive dependency) for test decompression. This is simpler than fighting the library's behavior and produces smaller PDFs.
