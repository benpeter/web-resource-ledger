MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task

GitHub Issue #4: MVP Step 4 -- WACZ Bundling and Signing

Build WACZ bundling and Ed25519 signing for a Cloudflare Worker. After existing R2 artifacts (screenshot.png, rendered.html, headers.json) are stored, construct WARC records, build a CDXJ index, compute SHA-256 hashes, assemble a signed manifest, write a .wacz ZIP to R2 at captures/{sha256}.wacz, and update KV metadata.

Acceptance criteria:
- vitest run signing round-trip test passes
- vitest run canonical JSON stability test passes
- R2 contains a .wacz object after a capture completes in wrangler dev
- Key generation procedure documented in README

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-data-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-edge-minion.md

## Key consensus across specialists:

## Summary: security-minion
Phase: planning
Recommendation: Use node:crypto (or PKCS8 DER wrapping for Web Crypto) for Ed25519 since standard Web Crypto generateKey/importKey is fragmented on Workers; spike test needed first; lazy key caching in module scope; strict key validation (refuse to sign on failure); canonical JSON adequate with guardrails (no floats, recursive sort, golden tests)
Tasks: 8 -- spike test for Ed25519 API; key generation script; signing module; canonical JSON module; bundleHash computation; signing round-trip test; key validation failure tests; secret hygiene check
Risks: Ed25519 API instability in Workers (HIGH); silent signing failure (CRITICAL); non-deterministic ZIP (MEDIUM); canonical JSON cross-runtime divergence (LOW); key compromise without rotation (MEDIUM, accepted)
Conflicts: Disagrees with issue's crypto.generateKey("Ed25519") + exportKey("raw") approach -- won't work on Workers
Full output: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-security-minion.md

## Summary: data-minion
Phase: planning
Recommendation: Do NOT use warcio.js (incompatible deps: hash-wasm, tempy, pako); manual WARC construction ~100 lines; use fflate for ZIP; WARC types: resource (html, screenshot), metadata (headers), warcinfo; put signatures in separate datapackage-digest.json per WACZ-Auth spec; Ed25519 key must be PKCS8 format for import; keep individual R2 artifacts alongside WACZ for MVP
Tasks: 7 -- WARC record builder; CDXJ index generator; WACZ bundler; Ed25519 signing helpers; SHA-256 utility; capture pipeline integration; add fflate dependency
Risks: Ed25519 private key format (HIGH); Worker memory for large screenshots (MEDIUM); WACZ-Auth uses ECDSA not Ed25519 (MEDIUM); fflate compat (LOW); canonical JSON determinism (LOW); gzip determinism (LOW); ctx.waitUntil timing (MEDIUM)
Conflicts: Recommends datapackage-digest.json for signatures (spec-aligned) vs issue's signatures array in datapackage.json
Full output: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-data-minion.md

## Summary: test-minion
Phase: planning
Recommendation: Three new test files (canonical-json, signing, wacz); unit tests for pure functions, integration for pipeline; crypto works in workerd/Miniflare identically to production; fixed SIGNING_KEY binding in vitest.config.js for integration tests, fresh keys for unit tests; do NOT modify existing capture tests
Tasks: 5 -- canonical-json tests; signing tests; wacz integration tests; vitest config update; regression verification of existing tests
Risks: Ed25519 algorithm name unclear (Ed25519 vs NODE-ED25519); WACZ ZIP reading in tests; ctx.waitUntil timing; test isolation; graceful degradation when SIGNING_KEY absent
Conflicts: none
Full output: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-test-minion.md

## Summary: edge-minion
Phase: planning
Recommendation: WACZ bundling feasible inline (~80-260ms); use fflate zipSync level 0; pass in-memory artifacts directly; 780KB memory (0.6% of limit); use standard Ed25519 algorithm; graceful degradation on failure; simplified WARC (uncompressed data.warc vs data.warc.gz)
Tasks: 7 -- add fflate; WARC construction; CDXJ index; WACZ assembly; pipeline integration; key management script; env binding
Risks: Ed25519 importKey format (MEDIUM); ctx.waitUntil cancellation (LOW); fflate entry ordering (LOW); large screenshot memory (LOW); WARC correctness (MEDIUM); no retry for WACZ failure (MEDIUM)
Conflicts: Suggests uncompressed data.warc vs data-minion's gzipped data.warc.gz
Full output: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-edge-minion.md

## Key Conflicts to Resolve

1. **WARC compression**: edge-minion suggests uncompressed data.warc (simpler, no gzip dependency), data-minion says data.warc.gz (spec compliance, uses native CompressionStream). Resolve in favor of spec compliance or simplicity?

2. **Signature location**: data-minion recommends separate datapackage-digest.json (per WACZ-Auth spec), issue says signatures array in datapackage.json. The issue was written before spec research. Follow spec or issue?

3. **Ed25519 API**: security-minion recommends node:crypto, data-minion recommends PKCS8 DER wrapping for Web Crypto, edge-minion recommends standard Ed25519 Web Crypto. All agree a spike test is needed.

4. **WACZ failure handling**: edge-minion suggests graceful degradation (complete without WACZ), security-minion says NEVER store unsigned bundles (capture must fail). Fundamental tension between availability and integrity.

5. **Key format**: Issue says "base64-encoded raw 32 bytes." Security-minion and data-minion agree raw import won't work; need PKCS8 DER wrapping or node:crypto or JWK. What format to actually store?

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase3-synthesis.md`

## Important Context for Task Prompts

When writing task prompts for execution agents, include:
- The working directory: /Users/ben/github/benpeter/web-resource-ledger
- The existing codebase structure (src/*.js, test/*.test.js)
- The project uses vanilla JS (no TypeScript, no frameworks)
- Tests use @cloudflare/vitest-pool-workers with Miniflare
- The project follows YAGNI/KISS principles (see CLAUDE.md)
- Existing patterns: injectable renderer in capture.js, module-scoped caching, KV access through kv.js
- fflate needs to be added as a dependency
