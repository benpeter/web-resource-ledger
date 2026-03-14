# Meta-Plan: MVP Step 4 -- WACZ Bundling and Signing

## Scope

**In scope**: After existing R2 artifacts (screenshot.png, rendered.html, headers.json) are stored by `performCapture()`, construct WARC records via warcio.js, build a CDXJ index, compute SHA-256 hashes per artifact, assemble a `datapackage.json` manifest, compute a `bundleHash` from canonical JSON, sign with Ed25519, write a `.wacz` ZIP to R2 at `captures/{sha256}.wacz`, and update KV with capture metadata including the WACZ location. Document key generation in README. Tests for canonical JSON stability and signing round-trip.

**Out of scope**: Verification endpoint (Step 6), retrieval endpoint (Step 5), RFC 3161 timestamps, key rotation mechanism, `.well-known/signing-key` endpoint, WACZ-Auth full spec. The `signatures` array is designed to accommodate these later, but they are not built now.

**Key technical constraints**:
- Cloudflare Worker runtime (Web Crypto API for Ed25519, no Node.js crypto module)
- `nodejs_compat` compatibility flag is enabled
- Existing dependency: `@cloudflare/puppeteer`. New dependency needed: `warcio.js`
- Private key as `wrangler secret` (SIGNING_KEY), never in VCS or wrangler.toml
- Canonical JSON must be deterministic: sorted keys, no whitespace
- WACZ ZIP written to R2 at content-addressed path `captures/{sha256}.wacz`
- This runs inside `ctx.waitUntil()` which has a 30s budget (already noted in backlog as a constraint)
- `signatures` array structure must accommodate future RFC 3161 entries

---

## Planning Consultations

### Consultation 1: Security Design for Key Management and Signing

- **Agent**: security-minion
- **Planning question**: Review the Ed25519 signing architecture for the WACZ bundling step. Specifically: (1) Is `crypto.generateKey("Ed25519")` + `exportKey("raw")` the correct approach for generating the 32-byte private key seed in a Cloudflare Worker context? (2) What are the security implications of deriving the public key at Worker startup from the stored private key on every cold start -- is there a timing or key exposure risk? (3) The private key is stored as a base64-encoded `wrangler secret` named `SIGNING_KEY` -- are there any pitfalls with how Workers secrets are injected (env binding) that could lead to accidental logging or exposure? (4) Should the signing module defensively validate the key material (e.g., check length, format) before using it, and what should happen if validation fails (refuse to start? refuse to sign? log an error?)? (5) Are there any concerns with the canonical JSON approach to `bundleHash` determinism (sorted keys, stripped whitespace) -- could there be edge cases (Unicode normalization, number precision, etc.) that break determinism?
- **Context to provide**: `src/capture.js` (existing pipeline the signing integrates into), `wrangler.toml` (existing bindings), kickoff decisions on Ed25519 signing, the `signatures` array structure requirement from the issue
- **Why this agent**: Signing is the security-critical path -- key management errors, side-channel leaks, or determinism failures undermine the entire integrity guarantee

### Consultation 2: WACZ/WARC Format Implementation

- **Agent**: data-minion
- **Planning question**: Plan the data structure and file layout for the WACZ bundle. Specifically: (1) What should the WARC records look like for our three artifact types (rendered HTML, screenshot PNG, headers JSON) -- which WARC record types (warcinfo, resource, response, metadata) map to each artifact? (2) How should the CDXJ index be generated from the WARC records -- what fields are mandatory for WACZ compliance? (3) What is the exact structure of `datapackage.json` for our use case -- which fields are required vs optional in the WACZ spec? (4) How should per-artifact SHA-256 hashes be structured in the manifest -- hash of the raw artifact bytes, or hash of the WARC record containing the artifact? (5) What is the correct ZIP structure for a WACZ file (directory layout, compression settings)? (6) Does `warcio.js` work in the Cloudflare Workers runtime, or will we need to handle WARC record construction manually? Assess compatibility with the Workers environment (no filesystem, streaming constraints).
- **Context to provide**: WACZ specification, `warcio.js` API, existing artifact storage paths in `src/capture.js`, the three artifact types (screenshot.png, rendered.html, headers.json)
- **Why this agent**: WACZ is a data packaging format with specific structural requirements; getting the WARC record types, CDXJ index, and manifest structure wrong would produce bundles that fail external validation

### Consultation 3: Test Strategy for Cryptographic and Format Correctness

- **Agent**: test-minion
- **Planning question**: Design the test approach for Step 4. The issue explicitly requires two tests: canonical JSON stability (deterministic serialization) and Ed25519 signing round-trip (sign then verify). Beyond these: (1) What additional tests are needed for the WACZ bundling pipeline -- should we test WARC record construction, CDXJ generation, manifest assembly, ZIP structure, and R2 write independently, or is integration-level testing sufficient? (2) The existing test infrastructure uses `@cloudflare/vitest-pool-workers` with Miniflare providing R2 and KV -- how should we structure tests that need crypto operations (Ed25519) in this environment? Does Miniflare support `crypto.subtle.sign`/`verify` with Ed25519? (3) How should we test the canonical JSON determinism -- what edge cases beyond basic key sorting should be covered (nested objects, arrays, numbers, Unicode, null values)? (4) Should the signing round-trip test use a test key or derive from a fixture? (5) How should we test the integration with the existing `performCapture` pipeline -- modify the existing capture tests to verify WACZ output, or create a separate test file?
- **Context to provide**: `vitest.config.js`, existing test files (especially `test/capture.test.js` for patterns), the stub renderer pattern used in capture tests, acceptance criteria from the issue
- **Why this agent**: The acceptance criteria are test-driven (vitest round-trip must pass), and the test strategy needs to account for cryptographic operations in the Workers test environment

### Consultation 4: Worker Runtime Constraints and Integration Architecture

- **Agent**: edge-minion
- **Planning question**: Evaluate the runtime feasibility of WACZ bundling inside the existing `ctx.waitUntil()` pipeline. Specifically: (1) The current `performCapture()` runs browser rendering + artifact storage within the 30s `ctx.waitUntil()` budget. Adding WARC construction, SHA-256 hashing of all artifacts, ZIP assembly, Ed25519 signing, and a second R2 write -- is this feasible within the remaining time budget after rendering completes? What is a realistic time estimate for these operations on typical artifact sizes (HTML ~50KB, screenshot ~200KB, headers ~2KB)? (2) Should WACZ bundling happen inline after artifact storage in `performCapture()`, or as a separate sequential step? (3) ZIP construction in Workers: what library options exist that work without filesystem access? Is there a lightweight ZIP library that operates on ArrayBuffers/Uint8Arrays? (4) Memory constraints: constructing a ZIP in memory with all artifacts -- is this within Worker memory limits for typical captures? (5) Should we read artifacts back from R2 for bundling, or pass the in-memory artifacts directly from the rendering step to avoid an extra R2 read?
- **Context to provide**: `src/capture.js` (the `performCapture` function and its Promise.allSettled pattern), `wrangler.toml` (Worker configuration), the ctx.waitUntil 30s constraint noted in backlog
- **Why this agent**: Edge runtime constraints (memory limits, execution time, no filesystem) directly determine whether the planned architecture is feasible

---

## Cross-Cutting Checklist

- **Testing**: INCLUDE test-minion for planning (Consultation 3 above). The acceptance criteria are test-driven -- canonical JSON stability and signing round-trip tests must pass. Test strategy needs to address crypto in Miniflare and integration with existing test patterns.

- **Security**: INCLUDE security-minion for planning (Consultation 1 above). This step introduces cryptographic signing, key management (secret storage), and integrity hashing -- all security-critical. Key material handling and canonical JSON determinism directly affect the trust model.

- **Usability -- Strategy**: EXCLUDE from planning consultation. This step produces no user-facing interface changes -- it is a backend pipeline addition (WACZ bundling inserted after existing artifact storage). The capture API request/response contract does not change. UX strategy review at the architecture review phase (Phase 3.5) is sufficient. The only user-facing artifact is the README key generation documentation, which is straightforward procedural documentation.

- **Usability -- Design**: EXCLUDE. No UI components produced. No user-facing interface changes.

- **Documentation**: INCLUDE software-docs-minion in the execution plan (not planning consultation). The issue requires documenting the key generation procedure in README. This is a well-scoped documentation task that does not need planning input -- the content is determined by the signing implementation. Phase 8 post-execution documentation will handle this.

- **Observability**: EXCLUDE from planning. This step does not introduce new production services or API endpoints. It extends an existing background pipeline. Logging of signing failures or bundle construction errors should be addressed in the implementation prompt but does not need a dedicated observability planning consultation. The existing `failCapture()` error handling pattern covers operational visibility.

---

## Anticipated Approval Gates

1. **WACZ bundle structure and manifest schema** (MUST gate) -- The `datapackage.json` structure, WARC record types, and CDXJ index format are hard to reverse once implemented and tested against. Downstream steps (retrieval, verification) depend on this format being correct. data-minion produces this, blocked tasks: all implementation tasks.

2. **Signing key management and canonical JSON approach** (MUST gate) -- The Ed25519 key derivation flow and canonical JSON serialization are security-critical and affect every future capture. Getting these wrong requires re-signing all existing bundles. security-minion validates, blocked tasks: signing implementation.

3. **warcio.js / ZIP library feasibility in Workers** (potential gate) -- If data-minion or edge-minion identifies that `warcio.js` does not work in Workers runtime, the implementation approach changes significantly (manual WARC construction). This may need user input on the tradeoff. Could be resolved without a gate if the answer is clear.

---

## Rationale

This task is fundamentally a **data packaging + cryptography** problem inside an **edge runtime** with tight constraints. Four specialists are consulted:

- **security-minion**: Ed25519 signing is the trust anchor for the entire product. Key management, canonical JSON determinism, and signing correctness must be reviewed before implementation.
- **data-minion**: WACZ is a standardized format with specific structural requirements (WARC record types, CDXJ index, datapackage.json manifest). Getting the format wrong produces bundles that cannot be verified by external tools.
- **test-minion**: Acceptance criteria are explicitly test-driven. The test strategy must address crypto operations in Miniflare and determine the right granularity (unit vs integration) for the bundling pipeline.
- **edge-minion**: The 30s ctx.waitUntil budget, no-filesystem constraint, and memory limits directly determine feasibility. If WACZ bundling cannot complete within these constraints, the architecture must change (e.g., Queues).

Agents NOT consulted for planning:
- **ux-strategy-minion**: No user-facing changes. Will review in Phase 3.5.
- **api-design-minion**: No API surface changes in this step. The capture endpoint request/response is unchanged.
- **frontend-minion**: No frontend work.
- **iac-minion**: No infrastructure changes beyond a `wrangler secret` (which is documented in the issue).
- **observability-minion**: No new services or endpoints. Existing error handling covers operational visibility.

---

## External Skill Integration

No external skills detected in project. Scanned `.claude/skills/` and `.skills/` in the working directory -- no SKILL.md files found. User-global skills (`~/.claude/skills/`) contain only `juli` (personal conversation skill), which is not relevant to this task domain.
