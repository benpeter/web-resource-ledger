# Outcome: Verification Endpoint

## What was built

Public `GET /v1/verify/{id}` endpoint that proves stored web captures are
authentic and unmodified. Three-check verification pipeline: artifact hash
recomputation, bundle hash recomputation from canonical JSON, and Ed25519
signature verification against the server's pinned public key.

## Files changed

| File | Action | Lines | Description |
|------|--------|-------|-------------|
| `src/verify.js` | Created | 183 | Pure `verifyWacz(waczBytes, publicKeyBytes)` function |
| `src/index.js` | Modified | +75 | Route, handler, `verifyUrl` in retrieval response |
| `wrangler.toml` | Modified | +5 | `VERIFY_RATE_LIMITER` binding (60 req/60s) |
| `test/verify.test.js` | Created | 265 | 12 unit tests for verification core logic |
| `test/verify-integration.test.js` | Created | 239 (est) | 21 integration tests for HTTP endpoint |

## Test results

- 263 tests passing across 13 test files (up from 230)
- 33 new tests: 12 unit + 21 integration
- Key coverage: happy path, tamper detection (corrupted artifact, modified
  manifest, wrong key, key substitution attack), error cases (unknown ID,
  pending, no-WACZ, malformed ID, failed status), headers (cache split,
  CORS, security), security (no IP/URL/R2 key leaks), journey coherence
  (verifyUrl in retrieval)

## Key security properties verified

1. Server-key-only trust: key substitution attack test passes
2. No hash values in error detail messages
3. All three checks run regardless of earlier failures
4. `capture.url` absent from verify response (public endpoint protection)
5. Size guard before `arrayBuffer()` (memory exhaustion prevention)
6. Rate limiting at 60 req/min per IP
7. `no-store` on failed verifications (prevents caching transient failures)

## Deviations from issue spec

1. **Cache-Control**: Conditional split instead of `immutable` -- see
   decisions.md #2
2. **Response shape**: Array of named checks instead of `artifacts` object --
   see decisions.md #3

## Backlog changes

- Added: Key rotation verification degradation (verification returns false
  for captures signed with rotated keys -- documented MVP limitation)
- Added: R2 artifact streaming for large WACZ verification (currently uses
  arrayBuffer, 100MB hard limit)
- Updated: Marked verification endpoint complete in the journey chain
- No items removed

## Surprises

None. The implementation went cleanly -- all 10 Phase 3.5 advisories were
incorporated into task prompts and the agents implemented them correctly.
The `buildTestWacz` helper bug (using `dpHashOfBytes` instead of
`bundleHash` for `signedData.hash`) was caught in Phase 3.5 review and
corrected in the Task 3 prompt before it could cause false-passing tests.
