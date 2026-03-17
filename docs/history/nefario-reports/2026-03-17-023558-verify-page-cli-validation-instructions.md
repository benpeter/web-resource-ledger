---
task: "Advisory: verify page CLI cryptographic validation instructions"
date: 2026-03-17
status: complete
mode: advisory
task-count: 0
gate-count: 0
agents: [security-minion, ux-strategy-minion, devx-minion]
slug: verify-page-cli-validation-instructions
---

## Summary

Unanimous team recommendation: **Yes, publish CLI verification instructions -- but NOT on the verify page.** Create a standalone `VERIFICATION.md` in the repo root with a companion `scripts/verify.sh`, and add a single link inside the existing "Cryptographic details" disclosure on the verify page. The verify page is a trust artifact optimized for casual users; CLI instructions serve a different audience and belong in developer documentation. A self-contained verification script is more valuable than raw CLI commands due to four encoding pitfalls that produce 100% false negatives if any is missed.

## Original Prompt

Should we update the verify page with CLI instructions for cryptographic validation?

## Key Design Decisions

1. **Instructions live in VERIFICATION.md, not verify-page.js** -- The verify page's job is trust confirmation for non-technical users. CLI instructions serve a different job (independent reproducibility) for a different audience. Mixing them degrades the primary UX without improving the secondary one.

2. **Script-first approach** -- Four encoding pitfalls (SPKI header construction, string-not-bytes signed payload, canonical JSON, base64 signature decoding) make raw CLI commands fragile. A `verify.sh` script eliminates this class of user error.

3. **Checks 1-3 now, timestamp as advanced** -- artifactHashes, bundleHash, and signature verification are fully achievable with standard tools. RFC 3161 timestamp chain validation has not been validated against a real WRL token and needs the DigiCert CA cert -- ship it as "advanced" after testing.

4. **Single link bridge** -- Add one line inside the "Cryptographic details" disclosure linking to VERIFICATION.md. Users who've opened that section have self-selected as technically curious.

5. **`jq -Sc` for canonical JSON** -- Empirically byte-equivalent to WRL's `canonicalize()` for current datapackage schema. Document the exact algorithm rather than referencing RFC 8785/JCS, with a caveat about floating-point number divergence.

## Phases

### Phase 1: Meta-Plan
Identified 3 specialists: security-minion (algorithm safety, encoding pitfalls, timestamp limitations), ux-strategy-minion (placement and audience separation), devx-minion (cross-platform CLI toolchain feasibility).

### Phase 2: Specialist Planning
All 3 consulted in parallel. Key findings per specialist:
- **security-minion**: Publishing the algorithm is safe and necessary. Four encoding pitfalls must be documented precisely. Timestamp limitation needs transparent framing. Recommended standalone verification script as primary path.
- **ux-strategy-minion**: Keep instructions out of verify page entirely. VERIFICATION.md in repo is the right home. Single link in crypto details disclosure bridges the gap. Dynamic commands are YAGNI and XSS surface.
- **devx-minion**: Prototyped all commands on macOS with OpenSSL 3.6.1. Checks 1-3 achievable. Ed25519 raw-to-PEM is hardest step. macOS LibreSSL doesn't support Ed25519 -- must call out prominently. RFC 3161 needs real-token validation.

### Phase 3: Synthesis
Two minor conflicts resolved: bash vs Node.js script (resolved: bash as primary, Node.js as reference), canonical JSON spec reference (resolved: document exact algorithm, not RFC 8785).

### Phases 3.5-8
Skipped (advisory-only orchestration).

## Agent Contributions

| Agent | Phase | Verdict |
|-------|-------|---------|
| security-minion | planning | Safe to publish; script-first; four encoding pitfalls; timestamp transparency |
| ux-strategy-minion | planning | Instructions out of verify page; VERIFICATION.md; single link bridge |
| devx-minion | planning | All commands prototyped; difficulty gradient mapped; LibreSSL gap identified |

## Team Recommendation

### Executive Summary

Yes, publish CLI verification instructions. The verification procedure uses only public information and standard cryptographic primitives -- publishing strengthens the trust model. But keep them out of the verify page, which serves a different audience and job.

### Consensus Points

1. Publishing the algorithm is safe and necessary for an open-source trust system
2. CLI instructions do NOT belong on the verify page (trust artifact, not docs)
3. A `verify.sh` script is the primary deliverable (eliminates encoding pitfalls)
4. `VERIFICATION.md` in repo root is the right documentation home
5. Single link in "Cryptographic details" disclosure bridges verify page to docs
6. Checks 1-3 are ready to ship; check 4 (timestamp) needs real-token validation first
7. macOS LibreSSL incompatibility is the #1 cross-platform concern

### Dissenting Views

None on the core questions. Two minor disagreements resolved:
- Script language (bash vs Node.js): Resolved in favor of bash as primary, Node.js as reference via existing `src/verify.js`
- Canonical JSON spec (RFC 8785 vs custom): Resolved by documenting exact algorithm, not referencing external spec

### Encoding Pitfalls (must document precisely)

1. **SPKI header**: `/.well-known/signing-key` serves raw 32-byte key; OpenSSL needs 44-byte SPKI DER (prepend `302a300506032b6570032100`)
2. **String-not-bytes**: Signature is over UTF-8 string `"sha256:<hex>"` (71 bytes), not raw 32-byte digest
3. **Canonical JSON**: Hash covers sorted-keys-no-whitespace form, not the pretty-printed version in the ZIP
4. **Base64 signature**: `openssl pkeyutl -verify` expects raw binary, not base64

### Recommended Next Steps

1. Create `VERIFICATION.md` documenting checks 1-3 with exact encoding details and trust boundaries
2. Write `scripts/verify.sh` (~80-100 lines) with prerequisite checks (OpenSSL version, LibreSSL detection, jq)
3. Add single link in "Cryptographic details" disclosure on verify page
4. Test script against real production WACZ; add to CI as regression canary
5. Document RFC 3161 verification as "Advanced" section after real-token validation
6. Optional: `?format=pem` endpoint on `/.well-known/signing-key` (eliminates hardest manual step; YAGNI if script is primary path)

### Conditions to Revisit

- If users report confusion finding verification docs from the verify page (add more prominent link)
- If key rotation causes false negatives (update docs to use `/.well-known/signing-keys` with `keyId` lookup)
- If `jq -Sc` diverges from `canonicalize()` due to new datapackage fields (floating-point numbers)

## Working Files

[2026-03-17-023558-verify-page-cli-validation-instructions/](./2026-03-17-023558-verify-page-cli-validation-instructions/)

| File | Description |
|------|-------------|
| prompt.md | Original task description |
| phase1-metaplan.md | Meta-plan: specialist selection and planning questions |
| phase2-security-minion.md | Algorithm safety, encoding pitfalls, timestamp limitations |
| phase2-ux-strategy-minion.md | Placement analysis, audience separation, Kano model |
| phase2-devx-minion.md | CLI command prototyping, cross-platform feasibility |
| phase3-synthesis.md | Advisory synthesis with full recommendation |
