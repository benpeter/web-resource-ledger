MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
Build a public verification endpoint (`GET /v1/verify/{id}`) for a web resource ledger (GitHub issue #6). The endpoint proves a stored capture is authentic and unmodified by recomputing SHA-256 hashes, recomputing bundleHash from canonical JSON, and verifying the Ed25519 signature. No authentication required. Response cached appropriately. Rate limited at ~60 req/min per IP. Must have passing end-to-end integration tests including tamper detection.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wBF00I/mvp-step-6-verification-endpoint/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wBF00I/mvp-step-6-verification-endpoint/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wBF00I/mvp-step-6-verification-endpoint/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wBF00I/mvp-step-6-verification-endpoint/phase2-ux-strategy-minion.md

## Key consensus across specialists:

### api-design-minion
- 200 for both verified:true and verified:false
- Response: `capture` (subset: id, url, createdAt, completedAt), `wacz` (crypto evidence), `checks` (array of {name, passed, detail?})
- `verified` boolean = conjunction of all checks
- Separate VERIFY_RATE_LIMITER binding
- Cache-Control: public, max-age=31536000, immutable on 200

### security-minion
- Use server's env.SIGNING_KEY exclusively (NOT embedded key) -- embedded key trust enables key-substitution attack
- Reduce cache TTL to 86400s (not immutable) -- immutable persists stale verification after key rotation
- Expose failure categories but not specific artifact details or expected/actual hashes
- KV-first fast-fail before R2 reads
- Full WACZ-based verification (download ZIP, extract, recompute)

### test-minion
- Tamper test by modifying R2 WACZ (unzip, corrupt inner file, re-zip)
- Use stubRenderer + performCapture() for lifecycle tests (avoids ctx.waitUntil timing)
- Split: verify.test.js (unit) + verify-integration.test.js (HTTP)
- Key pinning decision must be resolved before test implementation

### ux-strategy-minion
- `checks` array with named steps (artifactHashes, bundleHash, signature) with pass/fail/skip
- Immutable for verified:true, no-store for verified:false
- Add `verifyUrl` to retrieval response for journey coherence
- No-WACZ captures = 404 (nothing to verify)
- Recommends embedded key for MVP (disagrees with security-minion)

## KEY CONFLICT: Key Pinning Strategy
- security-minion: Use server key (env.SIGNING_KEY). Trusting embedded key enables key-substitution attack.
- ux-strategy-minion: Use embedded key for MVP. Key rotation breaks verification of old captures if using server key.
- BOTH have valid points. Resolution needed.

## CONFLICT: Cache-Control
- api-design-minion + ux-strategy-minion: immutable for verified:true (content-addressed, fact never changes)
- security-minion: max-age=86400 (key rotation concern)
- Resolution needed considering that capture IDs are content-addressed.

## External Skills Context
No external skills detected.

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## Codebase Reference
- src/index.js -- router, existing handlers
- src/signing.js -- getSigningKeys(), signBytes(), verifySignature()
- src/wacz.js -- buildWacz() with canonicalize + sha256 + signBytes
- src/canonical-json.js -- canonicalize()
- src/warc.js -- sha256() utility
- src/kv.js -- getCapture()
- src/responses.js -- jsonResponse(), problemResponse()
- test/capture-retrieval.test.js -- pattern for seeded KV+R2 tests
- test/wacz.test.js -- pattern for crypto unit tests
- wrangler.toml -- bindings config

## Instructions
1. Review all specialist contributions (read the scratch files)
2. Resolve conflicts between recommendations (especially key pinning and caching)
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. No external skills were discovered
7. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wBF00I/mvp-step-6-verification-endpoint/phase3-synthesis.md`
