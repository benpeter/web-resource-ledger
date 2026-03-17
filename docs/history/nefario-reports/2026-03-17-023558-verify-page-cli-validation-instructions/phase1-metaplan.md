# Meta-Plan: CLI Cryptographic Validation Instructions on Verify Page

## Task Summary

Evaluate whether and how to add CLI instructions for independent cryptographic validation to the verify page (`src/verify-page.js`). The verify page currently shows server-side verification results but provides no guidance for users who want to independently verify captures using command-line tools.

## Context

The verify page (`/v1/verify/{id}`) is the primary user-facing trust artifact. It currently displays:
- Verification status (verified/unverified)
- Four checks: file integrity, bundle integrity, digital signature, independent timestamp
- Cryptographic details disclosure (bundle hash, signed-at time, public key URL, TSA info)

The underlying cryptographic primitives are all standard and CLI-reproducible:
- **Ed25519 signature** over the bundle hash string (UTF-8 bytes of `sha256:{hex}`)
- **Bundle hash**: SHA-256 of canonicalized `datapackage.json` (JSON Canonicalization per sorted keys)
- **WACZ format**: Standard ZIP containing `datapackage.json` + `datapackage-digest.json`
- **RFC 3161 timestamp**: DER-encoded, stored base64 in `datapackage-digest.json`
- **Public key**: Available at `/.well-known/signing-key` (base64 JSON) and `/.well-known/signing-keys` (historical)
- **WACZ download**: Available at `/v1/captures/{id}/artifacts/wacz`

The project follows YAGNI/KISS principles. The verify page is vanilla JS (~700 lines), server-rendered as an inline HTML template. The page uses a `<details>` disclosure pattern for progressive detail.

## Planning Consultations

### Consultation 1: Security Architecture of CLI Verification
- **Agent**: security-minion
- **Planning question**: What are the security implications of publishing CLI verification instructions? Specifically: (1) Does exposing the exact verification algorithm (Ed25519 over UTF-8 of hash string, canonical JSON sort order) create any risk, or is this already effectively public via the open-source code? (2) Are there gotchas with Ed25519 raw key format vs PEM vs SPKI that could lead users to false negatives (and erode trust)? (3) Should instructions include timestamp certificate chain verification (currently deferred in the server code too -- `rfc3161.js` does NOT verify the TSA's cryptographic signature), and if not, how should that limitation be communicated?
- **Context to provide**: `src/verify.js` (verification algorithm), `src/signing.js` (key format: PKCS8 private, raw 32-byte public), `src/rfc3161.js` (timestamp verification defers CMS chain validation), `src/canonical-json.js` (sorted-key canonicalization), `/.well-known/signing-key` endpoint returns `{ algorithm: "Ed25519", publicKey: "<base64>", keyId: "<hex>" }`
- **Why this agent**: CLI verification instructions that are wrong or misleading could damage trust more than having no instructions at all. Security-minion can identify where users might get false negatives from format mismatches, and whether exposing the verification algorithm publicly has implications.

### Consultation 2: User Journey and Information Architecture
- **Agent**: ux-strategy-minion
- **Planning question**: Where in the verify page should CLI instructions live, and who is the target audience? Consider: (1) The page already has two `<details>` disclosures ("Capture details" and "Cryptographic details"). Should CLI instructions be a third disclosure, nested inside "Cryptographic details", or a separate section? (2) The page serves two audiences: casual users who just want "verified/not verified" and technical users who want independent verification. How do we serve the second group without increasing cognitive load for the first? (3) Should the instructions be static (always the same) or dynamic (pre-populated with the specific capture's hash, signature, key URL)?
- **Context to provide**: Current page structure (status banner, capture metadata, checks, screenshot, capture details disclosure, cryptographic details disclosure), project principles (KISS, cognitive load minimization), the fact that this is a single-file vanilla JS page (~700 lines already)
- **Why this agent**: The verify page is a trust interface. Getting the information hierarchy wrong -- either hiding instructions too deep or cluttering the primary flow -- could undermine the page's core purpose of communicating trust status clearly.

### Consultation 3: CLI Command Accuracy and Toolchain Selection
- **Agent**: devx-minion
- **Planning question**: What specific CLI commands should we recommend for each verification step, and what are the cross-platform considerations? The verification steps are: (1) Download WACZ: `curl`. (2) Extract `datapackage.json` and `datapackage-digest.json`: `unzip`. (3) Compute bundle hash: canonicalize JSON (sorted keys), then SHA-256. (4) Verify Ed25519 signature: need to verify base64 signature over UTF-8 bytes of hash string using raw 32-byte public key. (5) Optionally verify individual file hashes. Key constraints: the canonical JSON step (sorted keys, no whitespace) is non-trivial in shell -- is `jq` reliable for this? Ed25519 with `openssl` requires specific key format handling (raw bytes to PEM conversion). What's the simplest correct toolchain?
- **Context to provide**: `src/canonical-json.js` (the exact canonicalization: sorted keys, no whitespace, recursive), `src/signing.js` line 130 (verification uses `crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519')` -- raw 32-byte key), the WACZ structure (ZIP with `datapackage.json`, `datapackage-digest.json`, WARC files), signing payload is `sha256:{hex}` string as UTF-8 bytes
- **Why this agent**: CLI instructions that don't work on common platforms or that subtly differ from the actual verification algorithm would be worse than no instructions. DevX-minion can identify the simplest correct command sequences and flag platform gotchas (macOS vs Linux openssl versions, jq canonicalization edge cases).

### Cross-Cutting Checklist

- **Testing**: EXCLUDE from planning. This task modifies a static HTML template with no testable logic. The instructions themselves should be validated by devx-minion during planning, not via automated tests.
- **Security**: INCLUDE -- see Consultation 1. Publishing verification algorithms and key format details requires security review.
- **Usability -- Strategy**: INCLUDE -- see Consultation 2. This is fundamentally an information architecture decision on the primary trust artifact.
- **Usability -- Design**: EXCLUDE from planning. The visual implementation (disclosure pattern, typography) follows the existing page patterns. No new interaction patterns are needed.
- **Documentation**: EXCLUDE from planning. The CLI instructions ARE the documentation -- they live on the verify page itself, not in separate docs. software-docs-minion would add overhead without adding value here.
- **Observability**: EXCLUDE from planning. No runtime components or services are being added.

### Anticipated Approval Gates

1. **CLI command sequence design** (MUST gate): The exact commands and their order are hard to reverse once published -- users will bookmark, screenshot, and reference them. Multiple valid approaches exist (openssl vs Python vs dedicated tools). This decision has no downstream dependents but involves significant judgment where multiple valid approaches exist, and incorrect instructions would actively damage trust. Gate before implementation.

### Rationale

Three specialists were selected because this task sits at the intersection of three concerns that are genuinely independent:

1. **Security** (security-minion): Is it safe and complete to publish these instructions? What should be disclosed about the timestamp verification limitation?
2. **User experience** (ux-strategy-minion): Where do the instructions go without cluttering the trust interface?
3. **Developer experience** (devx-minion): What commands actually work, cross-platform, for each verification step?

Other agents were excluded because:
- **frontend-minion**: The implementation is straightforward HTML/JS in an existing pattern. No architectural decisions needed.
- **software-docs-minion**: The instructions are the deliverable, not separate documentation about the deliverable.
- **test-minion**: No testable logic is being added.

### Scope

**In scope**:
- Determine which CLI verification steps to include (hash, signature, file integrity, timestamp)
- Determine the exact CLI commands for each step
- Determine placement and information architecture on the verify page
- Determine whether instructions should be static or dynamic (capture-specific)
- Address the timestamp verification limitation (TSA certificate chain not verified)

**Out of scope**:
- Building a dedicated CLI tool or npm package for verification
- Adding a "copy to clipboard" button or interactive elements beyond `<details>` disclosure
- Modifying the verification API or endpoints
- Adding new API endpoints to support CLI verification
- Changing the cryptographic primitives or signing format

### External Skill Integration

No external skills detected in project.
