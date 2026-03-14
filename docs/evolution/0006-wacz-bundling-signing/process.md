# Process: WACZ Bundling and Signing

## TL;DR

Four specialists (security-minion, data-minion, edge-minion, test-minion)
planned the WACZ pipeline in parallel, produced 5 conflict resolutions and 20
architecture advisories, then a single execution agent (edge-minion) built
5 source modules, 3 test files, a key gen script, and README documentation
across 5 tasks in 3 batches with 2 approval gates. Code review found 2 helper
duplications (sha256, toTimestamp14) that were auto-fixed. 215 tests pass.
PR #14 created. Three context compactions occurred during the session.

## How the team was assembled

Nefario identified 4 specialists for planning:

- **security-minion** -- Ed25519 key management, signing protocol correctness,
  key storage security
- **data-minion** -- WACZ spec expertise, WARC/1.1 format, CDXJ indexing,
  manifest structure
- **edge-minion** -- Cloudflare Workers runtime constraints, time budgets,
  memory limits, ZIP library selection
- **test-minion** -- crypto testing strategy in workerd, test fixture design,
  integration test patterns

No discretionary reviewers were added for Phase 3.5 -- the 5 mandatory
reviewers (security-minion, test-minion, ux-strategy-minion, lucy, margo)
covered all relevant domains. The team was approved without adjustment.

## What each specialist argued

### data-minion: The spec authority

data-minion did the deepest spec research and produced the most detailed
contribution (386 lines). Key positions:

- **WARC record types**: Mapped each artifact to the correct WARC type --
  `resource` for rendered HTML and screenshot (derived artifacts, not raw HTTP
  responses), `metadata` for headers (describes a resource, not a resource
  itself), `warcinfo` for capture context.
- **warcio.js is a non-starter**: Identified three hard blockers -- hash-wasm
  (WASM compilation not available in Workers), tempy (filesystem not available),
  pako (redundant). This was the clearest technical finding of the planning
  phase. No specialist contested it.
- **Signatures belong in datapackage-digest.json**: Cited WACZ-Auth 0.1.0 spec
  directly. The issue said "signatures array in datapackage.json" but the
  actual standard uses a separate file. data-minion argued this preserves
  RFC 3161 extensibility AND keeps datapackage.json parseable by standard
  WACZ tools.
- **Gzip for WARC files**: Recommended `data.warc.gz` with CompressionStream,
  noting the WACZ spec traditionally uses compressed WARC. This was overridden
  (see Conflict 1 below).

### security-minion: The strict constructionist

security-minion produced the most opinionated contribution, including the
session's only significant disagreement. Key positions:

- **Ed25519 API is fragmented**: Warned that Cloudflare Workers have two
  algorithm identifiers (`Ed25519` and `NODE-ED25519`) with different capability
  sets. Recommended `node:crypto` as the primary path, with Web Crypto as
  fallback. This was partially overridden -- the spike test later proved
  standard Web Crypto works.
- **Captures MUST fail if signing fails**: Argued that storing unsigned
  bundles violates the core value proposition. "An unsigned bundle that looks
  like a signed one is a silent integrity failure." This was the sharpest
  disagreement of the planning phase (see Conflict 4 below).
- **Key validation is non-optional**: Specified 4 validation checks (presence,
  base64 validity, length, import success) and argued for sanitized error
  messages that never expose key material.
- **Canonical JSON is adequate**: Validated the proposed canonicalization
  approach as functionally equivalent to RFC 8785 for WRL's data types, but
  flagged edge cases (floating-point, Unicode normalization) with a pragmatic
  "not a concern for WRL's data types today."
- **ZIP determinism**: Raised that non-deterministic ZIP metadata (timestamps,
  file ordering) could break content-addressed storage. Recommended fixed
  timestamps and fixed file ordering.

### edge-minion: The feasibility engineer

edge-minion's contribution was the most operationally grounded. Key positions:

- **Time budget analysis**: Estimated WACZ bundling at 80-260ms, well within
  the 5s headroom after browser rendering in the 30s `ctx.waitUntil()` budget.
  Broke down each operation: SHA-256 hashing ~1-2ms, WARC construction ~1-2ms,
  Ed25519 signing ~1-2ms, fflate zipSync ~2-5ms, R2 write ~50-200ms. This
  analysis justified inline bundling over a separate Queue/Worker.
- **fflate is the right ZIP library**: Evaluated 4 alternatives (zip.js,
  jszip, archiver, manual writer) and recommended fflate based on size (~29KB,
  zero transitive deps), API fit (`zipSync` for synchronous Workers), and the
  "what does this dependency give me that I can't do in 10 lines?" test.
  Manual ZIP writing is ~80+ lines for STORE-mode-only, making fflate
  a proportional choice.
- **Pass artifacts directly, don't read from R2**: Identified that reading
  artifacts back from R2 after writing them would add 150-450ms of unnecessary
  latency plus wasted subrequest quota. The in-memory buffers from rendering
  should flow directly to WACZ construction.
- **Standard `Ed25519` over `NODE-ED25519`**: Recommended the standard
  algorithm name, noting the legacy variant may change behavior over time.

### test-minion: The test strategist

test-minion's contribution was the most structured. Key positions:

- **Unit tests for pure logic, integration for the pipeline**: Advocated
  against testing everything at integration level. Canonical JSON, signing
  round-trip, WARC construction, CDXJ generation are all pure functions that
  deserve focused unit tests. One integration test validates the full pipeline.
- **Don't test the ZIP library**: "Whatever ZIP library is chosen, trust that
  it produces valid ZIPs. The integration test that reads the .wacz back from
  R2 and extracts its contents validates the ZIP implicitly."
- **Ed25519 works in workerd**: Stated that `crypto.subtle.generateKey('Ed25519',
  true, ['sign', 'verify'])` works in the workerd runtime used by
  Miniflare/vitest-pool-workers. This was the strongest signal about API
  availability because it was based on the actual test runtime.
- **Graceful degradation drives test design**: Argued that `SIGNING_KEY` should
  be optional in vitest.config.js and the WACZ step should skip gracefully
  when absent, so existing capture tests don't break.

## Where they disagreed and how conflicts were resolved

### Conflict 1: WARC compression (gzip vs uncompressed)

**data-minion** recommended `data.warc.gz` with native CompressionStream --
the WACZ spec traditionally uses compressed WARC files. **edge-minion**
recommended uncompressed `data.warc` -- simpler, no gzip determinism concerns,
and the ZIP uses STORE mode anyway so gzip would be the only compression.

**Resolution**: Uncompressed. The WACZ spec allows both. Uncompressed
eliminates an entire class of gzip determinism bugs, simplifies construction
and debugging, and follows KISS. The trade-off (slightly larger WACZ files)
is irrelevant for single-page captures at MVP scale. This also simplified
the CDXJ index filename (`index.cdxj` not `index.cdx.gz`), removing all
gzip from the pipeline.

### Conflict 2: Signature location

**Issue #4** specified a `signatures` array in `datapackage.json`. **data-minion**
cited the WACZ-Auth 0.1.0 spec which puts signatures in a separate
`datapackage-digest.json` file.

**Resolution**: Follow the spec. The issue was written before spec research.
The `signedData` object in `datapackage-digest.json` preserves RFC 3161
extensibility (the issue's stated goal) while keeping `datapackage.json`
parseable by standard WACZ tools. Nobody argued against this once data-minion
presented the spec evidence.

### Conflict 3: Ed25519 API approach (the 4-way split)

This was the most complex disagreement -- all 4 specialists had different
recommendations:

- **security-minion**: Use `node:crypto` (most reliable, documented API)
- **data-minion**: Web Crypto with PKCS8 DER wrapping (raw import won't work)
- **edge-minion**: Standard `Ed25519` Web Crypto (modern, non-legacy)
- **test-minion**: `crypto.subtle.generateKey('Ed25519')` works in workerd

**Resolution**: Spike-first. Task 1 tests the standard Web Crypto `Ed25519`
path with PKCS8 import. If it works (which it did, on the first try), use it.
If it fails, fall back to `node:crypto`. The key storage format was consensus:
base64-encoded PKCS8 DER (48 bytes), not raw 32 bytes as the issue specified.
All specialists agreed raw import wouldn't work.

### Conflict 4: Signing failure handling (the sharpest disagreement)

**security-minion** argued that captures MUST fail if signing fails:
"An unsigned bundle that looks like a signed one is a silent integrity failure.
Storing an unsigned bundle violates the core value proposition. The capture
pipeline should call `failCapture()` with a non-retryable error."

**edge-minion** argued for graceful degradation: capture completes, WACZ is
skipped entirely, individual artifacts still stored and available.

**Resolution**: Graceful degradation for MVP, with YAGNI as the deciding
principle. The counter to security-minion's argument: no unsigned WACZ is
stored. If signing fails, WACZ is skipped entirely. Individual artifacts
(screenshot, HTML, headers) were never signed and were never claimed to be.
The KV record has no `wacz` field when WACZ was skipped, giving operators
visibility. Strict enforcement is deferred to the verification endpoint
(Step 6), which will naturally handle unsigned captures. This also preserved
the 17 existing capture tests that don't provide `SIGNING_KEY`.

### Conflict 5: Key format storage

**Issue #4** specified "base64-encoded raw 32 bytes." All specialists agreed
this wouldn't work -- Web Crypto requires PKCS8 for private key import.
**edge-minion** suggested JWK as an alternative.

**Resolution**: PKCS8 DER (48 bytes = 16-byte ASN.1 header + 32-byte seed).
More compact than JWK, directly consumable by `importKey('pkcs8', ...)`, no
JSON parsing needed at import time. The key generation script outputs the
base64 string ready for `wrangler secret put`.

## What the architecture review found

Five mandatory reviewers (security-minion, test-minion, ux-strategy-minion,
lucy, margo) all returned ADVISE -- no BLOCKs. 20 advisory items total were
incorporated into execution task prompts:

**security-minion (6 items)**: Key rotation detection for warm isolates,
signed payload byte sequence clarification, SPKI header assertion (32-byte
check), catch block diagnostics (don't swallow errors silently), ephemeral
test key (don't commit key material to VCS), publicKey trust caveat (verifiers
must pin against operator-published key).

**test-minion (3 items)**: R2 cleanup for .wacz objects in test teardown,
graceful degradation test coverage, WARC unit assertions.

**ux-strategy-minion (1 item)**: Key generation script output order --
actionable instructions first, then key material. (A small but thoughtful UX
improvement.)

**lucy (4 items)**: Document the warcio.js rejection in evolution log
decisions.md. Document the datapackage-digest.json deviation. Verify evolution
log numbering (0006). Record fflate dependency justification.

**margo (5 items)**: Inline `hash.js` (3-line function doesn't need its own
module). Consider inlining `canonical-json.js` (weaker argument). Reduce
canonical JSON tests from 12 to 5-6 (disproportionate test effort for a
5-line function). Trim Task 3 prompt (over-specified pseudocode). fflate
bundle size verification.

The most impactful advisory was security-minion's key rotation detection:
in Cloudflare Workers, module-scoped cached keys survive across requests
within a warm isolate. If `env.SIGNING_KEY` changes (key rotation) while an
isolate stays warm, the cached stale key would continue signing. The fix
was simple -- cache the env string alongside the CryptoKey and compare on
each call -- but the bug would have been subtle and hard to detect in
production.

## What happened at approval gates

### Gate 1: Ed25519 API Confirmation

The spike test (Task 1) passed on the first try. Standard `'Ed25519'`
algorithm name worked in workerd for all operations: generateKey, sign,
verify, PKCS8 export/import, raw public key export/import. No fallback
paths needed.

**Human chose**: Approve immediately. No changes requested. The spike
result eliminated the highest-risk unknown in the plan.

### Gate 2: WACZ Pipeline Implementation

Task 3 produced 4 source modules (signing.js, warc.js, cdxj.js, wacz.js)
plus fflate dependency. All security advisories were implemented: key
rotation cache, 32-byte public key assertion, signed payload documentation,
publicKey trust caveat.

**Human chose**: Approve immediately. No changes requested. At both gates,
no post-execution phases were skipped -- all of code review, tests, and
documentation ran.

## What the human changed and didn't change

The human approved the team without adjustment, approved both reviewer sets
without adjustment, approved the execution plan without changes, and approved
both gates without changes. The human also chose to run all post-execution
phases at both gates (no skips).

The human did NOT intervene on:
- **The graceful degradation decision** (Conflict 4). security-minion's
  "must fail" argument was strong, but the YAGNI resolution was defensible
  and the human let it stand.
- **margo's advisory to inline canonical-json.js**. The synthesis kept it
  as a separate module (test-minion's argument about isolating test failures
  was persuasive), and the human didn't override.
- **margo's advisory to reduce canonical JSON tests**. The final count was
  6 tests (not margo's suggested 5, not the original 12). A reasonable
  middle ground that wasn't explicitly negotiated.

## What the code review found

Three reviewers (code-review-minion, lucy, margo) all returned ADVISE.
The consensus finding (identified independently by all three) was helper
duplication:

1. **`toTimestamp14`** existed in both `warc.js` (private) and `cdxj.js`
   (exported). Both were identical implementations built by the same agent
   (edge-minion) in the same task (Task 3). Fix: import from `cdxj.js` in
   `warc.js`.

2. **`sha256`** existed in both `warc.js` (as `sha256Warc`) and `wacz.js`
   (as `sha256`). Again, built by the same agent in the same task. Fix:
   rename `sha256Warc` to `sha256` in `warc.js`, export it, import in
   `wacz.js`. A clarifying comment was also added in `wacz.js` about
   canonical vs pretty-printed datapackage.json.

Both fixes were auto-applied. All 215 tests continued to pass.

Other findings (not fixed, NITs):
- WARC-Block-Digest header absent from WARC records (out of scope for MVP)
- Catch block in signing.js swallows errors with minimal diagnostics
- SPKI prefix validation could assert the actual prefix bytes, not just length
- `node:crypto` import creates tighter coupling to `nodejs_compat` flag

## Where to read more

- **Full specialist discussions**: `docs/history/nefario-reports/2026-03-14-122554-mvp-step-4-wacz-bundling-signing/phase2-*.md`
- **Architecture review verdicts**: `docs/history/nefario-reports/2026-03-14-122554-mvp-step-4-wacz-bundling-signing/phase3.5-*.md`
- **Code review findings**: `docs/history/nefario-reports/2026-03-14-122554-mvp-step-4-wacz-bundling-signing/phase5-*.md`
- **Synthesized execution plan**: `docs/history/nefario-reports/2026-03-14-122554-mvp-step-4-wacz-bundling-signing/phase3-synthesis.md`
- **Nefario execution report**: `docs/history/nefario-reports/2026-03-14-122554-mvp-step-4-wacz-bundling-signing.md`
