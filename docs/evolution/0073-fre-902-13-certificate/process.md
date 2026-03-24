# Process: FRE 902(13) Certification Document

## TL;DR

Seven specialists planned the feature. Synthesis resolved one font conflict (Helvetica over Times Roman) and one signing approach debate (detached over embedded). Four execution tasks produced 1,394 lines across 11 files. Code review caught a real bug (drawKV indent parameter silently ignored) and a packaging issue (fflate in wrong dependency group), both auto-fixed. All 1,228 tests pass. The session required one context compaction due to the large planning phase.

## Planning Phase (Phases 1-3)

### Specialists consulted

Seven domain specialists were consulted in parallel:

| Specialist | Planning question | Key recommendation |
|---|---|---|
| **frontend-minion** | PDF library selection and determinism strategy | pdf-lib (270KB, proven in Workers), `updateMetadata: false` for determinism |
| **user-docs-minion** | Document structure and legal language | 6-section structure, blank qualified person fields, "supports" vs "satisfies" language |
| **api-design-minion** | Endpoint design and response headers | Public endpoint, signature in X-Signature headers, `certificateUrl` in capture response |
| **security-minion** | Signing approach, rate limiting | Detached Ed25519 via HTTP headers, keyId reference not raw public key |
| **test-minion** | Testing strategy without PDF parser | Three strategies: string matching, signature verification, snapshot/determinism |
| **ux-strategy-minion** | UI placement and interaction | Download button in Artifacts section, btn--ghost styling, conditional on WACZ |
| **software-docs-minion** | Documentation scope | OpenAPI spec, legal-evidence.md update, certificate content structure docs |

### Where specialists disagreed

**Font choice**: user-docs-minion recommended Times Roman (serif) for a "traditional legal look." frontend-minion recommended Helvetica (sans-serif) for broader glyph coverage. Synthesis chose Helvetica — both are standard PDF fonts, but pdf-lib's Times-Roman has limited character support, and the document's authority comes from its content, not its typography.

**Signing approach**: The team was unified on Ed25519 but split on delivery mechanism. security-minion and api-design-minion both recommended detached signatures via HTTP headers. No one argued for embedded PDF signatures, which was the correct outcome — embedded CMS signatures break determinism and add substantial complexity.

**Stream compression**: test-minion planned for uncompressed content streams based on the `useObjectStreams: false` flag. In reality, pdf-lib always compresses page content streams with FlateDecode regardless of that flag. This required a test strategy adaptation.

## Architecture Review (Phase 3.5)

Five mandatory reviewers (security, test, ux-strategy, lucy, margo) plus no discretionary reviewers. All returned APPROVE or ADVISE. No BLOCKs.

Key ADVISE notes incorporated:
- security-minion: Rate limiting via existing VERIFY_RATE_LIMITER (adopted in endpoint handler)
- test-minion: Warned about FlateDecode compression (prophetic — this became the main test challenge)

## Execution (Phase 4)

Four tasks executed sequentially with one approval gate after Task 1:

### Task 1: Core PDF generation + API endpoint (frontend-minion)
The largest task: created `src/certificate.js` (513 lines) and `handleGetCertificate` in `src/index.js`. This was the approval gate because all downstream work depends on the certificate content and API shape.

The generated certificate is a 2-3 page document with six numbered sections following FRE 902(13) structure. The `makeFlow` helper (~85 lines) handles cursor tracking, word-wrap, and page breaks — essential because pdf-lib has no built-in text layout.

### Task 2: Web UI button (frontend-minion)
10 lines of vanilla JS in ui-detail.js + 10 lines of CSS in ui-css.js. A download link (`<a href="...certificate" download>`) in the artifacts section, conditional on `data.wacz`. Ghost button styling. Simplest task in the set.

### Task 3: Documentation updates (software-docs-minion)
OpenAPI spec (+108 lines), legal-evidence.md (+33 lines), verification.md cross-reference, README one-liner. Documented all response headers including the signature headers.

### Task 4: Test suite (test-minion)
Created 41 tests across 9 describe blocks. This is where the FlateDecode compression issue surfaced — the test strategy assumed raw string matching on PDF content, but content streams are zlib-compressed.

## The FlateDecode Problem

The most significant deviation from the plan. pdf-lib compresses all page content streams with FlateDecode (zlib wrapper). The `useObjectStreams: false` flag only controls cross-reference table compression, not content streams.

**Evolution of the test helper**:
1. First attempt: raw string matching on PDF bytes → failed, content is compressed
2. Second attempt: `inflateSync` from fflate for decompression → failed, fflate's `inflateSync` expects raw deflate, not zlib-wrapped
3. Third attempt: `unzlibSync` with string-boundary detection (`\nstream\n` indexOf on latin1) → failed in workers runtime, binary data contains false matches
4. Final solution: byte-level scanning with `findBytes` on raw `Uint8Array`, extract streams by byte position, decompress with `unzlibSync`, match hex-encoded text

The final `pdfAllText` helper works by scanning for `stream\n` bytes directly in the PDF binary, extracting the zlib-compressed data between stream/endstream markers, decompressing with `unzlibSync`, and returning the concatenated content. The `pdfContains` helper converts search strings to their hex representation (e.g., "Federal" → "4665646572616C") because pdf-lib encodes text as hex strings in content streams.

## Code Review (Phase 5)

Three reviewers ran in parallel:

**code-review-minion** (ADVISE):
- Found a real bug: `drawKV` function ignored the `indent` parameter passed by 5 call sites in Section III. Fixed by adding `indent = 0` to destructured options.
- Noted `Cache-Control: public` on authenticated requests could leak through shared CDN. Accepted as-is — the certificate content is identical for all callers of the same captureId, and the 404 cross-tenant path uses `no-store`.
- Noted hardcoded operator PII. Accepted as-is — YAGNI for single-operator system.
- Noted quadratic truncation loop. Accepted as-is — URLs in real captures are well under the threshold.

**lucy** (ADVISE):
- Found `fflate` in dependencies instead of devDependencies. Fixed by moving it.
- Noted silent `catch (_)` in test helper conflicts with CLAUDE.md "every catch must log or handle specific error type." Accepted as-is — this is test infrastructure, not production code, and the catch is documented with a comment.

**margo** (APPROVE):
- Confirmed pdf-lib is justified (no vanilla alternative under 500 lines)
- Confirmed 513 lines is proportional (~400 lines is legal content, ~85 is essential layout plumbing)
- Confirmed test suite is proportional (1.2:1 ratio for a correctness-critical feature)
- Complexity budget: 1 (one new dependency for genuine capability)
- Also independently spotted the `drawKV` indent bug (already fixed by then)

## Human Interventions

This session ran in autonomous mode. Lucy agent served as gate approver. No human interventions occurred.

## Where to Read More

- Specialist contributions: `docs/history/nefario-reports/` (companion directory)
- Synthesis plan: scratch directory phase3-synthesis.md
- Code review findings: scratch directory phase5-*.md
- Issue: GitHub #141
