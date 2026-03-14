# Lucy Review: MVP Step 4 -- WACZ Bundling and Signing

## Verdict: ADVISE

The plan is well-aligned with the original request (Issue #4) and respects
the project's engineering philosophy. Conflict resolutions are well-reasoned
and properly justified against CLAUDE.md principles (YAGNI, KISS). The five
conflict resolutions all deviate from the original issue text in defensible,
spec-driven ways. No scope creep detected -- every task traces to a stated
requirement. Four advisories follow.

---

### Requirements Traceability

| Requirement (Issue #4)                                  | Plan Element                         | Status   |
|---------------------------------------------------------|--------------------------------------|----------|
| WARC records constructed                                | Task 3: src/warc.js                  | COVERED  |
| CDXJ index generated                                    | Task 3: src/cdxj.js                  | COVERED  |
| SHA-256 hash per artifact                               | Task 3: src/hash.js                  | COVERED  |
| datapackage.json manifest with hashes                   | Task 3: src/wacz.js                  | COVERED  |
| bundleHash = SHA-256 of canonical JSON                  | Task 2 + Task 3                      | COVERED  |
| Ed25519 key pair, SIGNING_KEY secret                    | Task 1: spike + key gen script       | COVERED  |
| Public key derived at startup                           | Task 3: src/signing.js               | COVERED  |
| Signature over bundleHash                               | Task 3: src/wacz.js                  | COVERED  |
| WACZ ZIP written to R2                                  | Task 4: src/capture.js modification  | COVERED  |
| Capture metadata to KV                                  | Task 4: src/kv.js modification       | COVERED  |
| Key generation documented in README                     | Task 5                               | COVERED  |
| Test: canonical JSON stability                          | Task 2 + Task 4                      | COVERED  |
| Test: signing round-trip                                | Task 1 + Task 4                      | COVERED  |
| Acceptance: vitest run passes                           | Verification Steps                   | COVERED  |
| Acceptance: R2 contains .wacz after capture             | Task 4 integration tests             | COVERED  |
| Acceptance: README documents key generation             | Task 5                               | COVERED  |

No orphaned tasks. No unaddressed requirements.

---

### Advisory 1: Issue #4 specifies warcio.js but plan rejects it -- document the deviation

- [DRIFT]: Issue #4 work item says "WARC records constructed via warcio.js" but the plan rejects warcio.js and builds WARC manually
  SCOPE: docs/evolution/0006-wacz-bundling-signing/decisions.md
  CHANGE: The evolution log decisions.md must explicitly document why warcio.js was rejected (incompatible dependencies: hash-wasm, tempy, pako) and the rationale for manual WARC construction. This is a significant deviation from the stated work item.
  WHY: CLAUDE.md requires evolution log decisions to capture alternatives considered and rationale. The issue text is the closest thing to a spec this project has. When the plan deviates from it, the deviation must be traceable to a documented decision -- not just buried in a synthesis document that lives in a temp directory. The conflict resolution is sound (those dependencies are genuinely incompatible with Workers), but it needs to survive in the permanent record.
  TASK: Phase 8 (post-execution documentation)

### Advisory 2: Issue #4 says "signatures array" but plan uses datapackage-digest.json -- document the deviation

- [DRIFT]: Issue #4 says "Manifest signatures array receives one entry of type: self" and "signatures array structure is designed to accommodate RFC 3161 TSA timestamps." The plan puts signatures in a separate datapackage-digest.json file per WACZ-Auth spec, with no signatures array.
  SCOPE: docs/evolution/0006-wacz-bundling-signing/decisions.md
  CHANGE: Document this deviation in the evolution log. The plan's Conflict 2 resolution explains the rationale well (WACZ-Auth 0.1.0 spec, keeping datapackage.json parseable by standard tools). That reasoning should be preserved in decisions.md along with a note about how RFC 3161 timestamps will be accommodated under the new structure (the signedData object can grow, or a separate timestamping entry can be added -- the backlog item "[should] RFC 3161 timestamps via TSA" remains valid either way).
  WHY: The issue's Technical Notes section specifically calls out the signatures array as designed for RFC 3161 extensibility. The plan changes the extensibility mechanism. This is the right call (spec compliance > issue speculation), but the RFC 3161 accommodation path under the new structure should be explicitly confirmed so the backlog item remains actionable.
  TASK: Phase 8 (post-execution documentation)

### Advisory 3: Evolution log directory numbering

- [CONVENTION]: Next evolution log phase number
  SCOPE: docs/evolution/ directory naming
  CHANGE: The next phase should be numbered 0006, following the existing sequence (0001 through 0005). The plan references this phase as "MVP Step 4" but the evolution log directory should be `0006-wacz-bundling-signing/`. Ensure the orchestration's wrap-up creates this directory with the correct sequential number and updates docs/evolution/README.md.
  WHY: CLAUDE.md rule 6 requires zero-padded four-digit sequential prefixes. The plan's Cross-Cutting Coverage section mentions "Phase 8 post-execution handles evolution log documentation" but does not state the directory number. Previous feedback memory (feedback_evolution_log.md) records that this step was missed in a prior orchestration. Making the number explicit here prevents the same gap.
  TASK: Phase 8 (post-execution documentation)

### Advisory 4: fflate dependency justification should be recorded

- [COMPLIANCE]: New dependency fflate requires Helix Manifesto justification
  SCOPE: src/wacz.js, package.json
  CHANGE: The evolution log decisions.md should include a brief justification for adding fflate as a runtime dependency, per the project's "Lean and Mean" and "Always ask: what does this dependency give me?" principles. The justification is straightforward (ZIP construction is non-trivial to implement correctly, fflate is ~7KB, no alternative in Workers), but it should be on the record.
  WHY: CLAUDE.md Engineering Philosophy requires actively minimizing dependencies and explicitly justifying each one. fflate is the first runtime dependency the plan adds (beyond @cloudflare/puppeteer). The plan mentions fflate but never states why building ZIP from scratch was rejected. This is exactly the kind of thing the evolution log is for.
  TASK: Phase 8 (post-execution documentation)

---

### Items Verified -- No Issues Found

- **YAGNI compliance**: No speculative features. Every module traces to a stated requirement. Graceful degradation is explicitly justified by YAGNI (strict enforcement deferred to post-MVP verification endpoint).
- **KISS compliance**: Uncompressed WARC and CDXJ eliminate gzip from the pipeline. Manual WARC construction (~100 lines) over warcio.js dependency. Good.
- **Vanilla JS**: No TypeScript, no frameworks. All task prompts explicitly prohibit TypeScript. Consistent with existing codebase.
- **File naming conventions**: Proposed files (signing.js, warc.js, cdxj.js, wacz.js, hash.js, canonical-json.js) follow existing kebab-case pattern (url-validation.js, capture.js, auth.js, kv.js). The hyphenated `canonical-json.js` is consistent with `url-validation.js`.
- **Test file naming**: Proposed test files (signing.test.js, canonical-json.test.js, wacz.test.js) follow existing pattern (capture.test.js, auth.test.js, kv.test.js).
- **No scope creep**: 5 tasks, each traceable to issue requirements. No "nice-to-have" features.
- **Precedence rule respected**: Plan does not override or deprioritize CLAUDE.md instructions.
- **Backlog awareness**: Backlog items for RFC 3161, key rotation, and key versioning remain untouched by this plan (correct -- they are post-MVP).
- **Security conventions**: SIGNING_KEY via wrangler secret (not wrangler.toml), .dev.vars in .gitignore, no console.log in signing module.
- **CLAUDE.local.md technology bias**: Cloudflare Workers is a preferred platform. JavaScript over TypeScript. No conflicts.
- **Latency**: Plan estimates 80-260ms for WACZ bundling within existing ctx.waitUntil. No latency risk to the capture response itself.
