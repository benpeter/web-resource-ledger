# Process: RFC 3161 Timestamp Integration

## TL;DR

Eight specialist agents planned the RFC 3161 integration across 3 phases, then 6 execution tasks (one turned out to be a no-op) produced a 545-line hand-rolled DER codec, evolved the WACZ format from v0.1.0 to v0.2.0, and added a 4th verification check. Code review caught 4 bugs (including a ~50% nonce validation failure rate), all fixed before merge. 497 tests pass. The key debate -- 3 checks vs. 4 -- was resolved in favor of UX visibility over API stability.

## Specialists Consulted and Why

### Phase 2: Planning (8 agents, parallel)

1. **security-minion** -- TSA trust model, DER parsing attack surface, certificate chain validation feasibility. This was the highest-risk domain: getting the cryptographic protocol wrong undermines the entire feature.
2. **api-design-minion** -- `signedData` format evolution, verification API response shape, backward compatibility. The format migration is the architectural backbone.
3. **iac-minion** -- Worker execution limits (30s ctx.waitUntil budget), TSA latency from Cloudflare edge, graceful degradation flow. Without this input, the plan might assume capabilities the runtime doesn't have.
4. **margo** -- YAGNI/KISS judgment on ASN.1 library vs. hand-rolled DER. The biggest over-engineering risk.
5. **frontend-minion** -- Verification page changes: 4th check row, crypto details extension. User-visible surface of the feature.
6. **test-minion** -- TSA response mocking strategy, DER fixture approach, backward compatibility test coverage.
7. **ux-strategy-minion** -- How to communicate "independently timestamped" vs. "operator-only" to non-technical users (journalists, legal professionals).
8. **software-docs-minion** -- OpenAPI spec updates, README references, documentation artifact inventory.

### Phase 3.5: Architecture Review (5 mandatory reviewers)

- **security-minion**, **test-minion**, **ux-strategy-minion**, **lucy**, **margo**
- No discretionary reviewers added (no new UI patterns or services).

### Phase 5: Code Review (3 reviewers, parallel)

- **code-review-minion**, **lucy**, **margo**

## What Each Specialist Argued

### The 3-check vs. 4-check Debate

The sharpest disagreement was between api-design-minion (keep 3 checks, fold timestamp into aggregate signature check) and the frontend/UX coalition (add a visible 4th check).

**api-design-minion's position**: The `checks` array is an API contract. Consumers who hardcode `checks.length === 3` will break. The timestamp should be detail within the `signing.signatures` array, not a top-level check. Aggregation preserves the existing contract.

**frontend-minion + ux-strategy-minion's position**: The whole point of RFC 3161 is independent verification. If you hide it inside a details array, users won't see it. The verification page check list is the primary interface for journalists and legal professionals. A visible 4th row with "Independent time verification" directly communicates the value proposition.

**Resolution**: 4th check wins. The API is pre-1.0, the check count was never documented as stable, and the UX benefit is material. The `verified` predicate changes to tolerate `skip` status for absent timestamps.

### HTTP vs. HTTPS for TSA

**iac-minion**: HTTP is industry-standard because TSA responses are self-authenticating (CMS-signed). `http://timestamp.digicert.com` is the standard endpoint, tested by millions of code signing operations daily. Adding HTTPS enforcement code is YAGNI.

**security-minion**: Use HTTPS. The endpoint supports it. The cost is zero. Transport encryption prevents MITM observation even though the response is self-authenticating.

**Resolution**: Default to HTTPS URL, but don't add validation code to enforce it. YAGNI on the enforcement, agree on the default.

### ASN.1 Library vs. Hand-Rolled Codec

All specialists agreed on hand-rolling. The discussion was about guardrails:

**margo**: Cap at 64KB, name it `rfc3161.js` not `asn1.js`, don't attempt CMS cert chain validation. The plan estimates 150-250 lines.

**security-minion**: Strict bounds checking on every read, reject indefinite-length encoding, validate all tag bytes explicitly. Review for buffer safety.

**test-minion**: Known-answer tests with real TSA fixtures, not property-based testing. Test malformed inputs explicitly.

**Outcome**: The file grew to 545 lines (2.2x the estimate). Margo reviewed and confirmed this is proportional to the CMS structure depth, not over-engineering. The nested structure (ContentInfo > SignedData > EncapContentInfo > TSTInfo) requires more navigation code than anticipated.

## Code Review Findings and Resolution

Three parallel reviewers in Phase 5 found 4 actionable issues:

### 1. btoa Spread RangeError (code-review-minion, BLOCK)

`btoa(String.fromCharCode(...tokenBytes))` uses the spread operator which passes all bytes as function arguments. V8 has a call-stack argument limit. A large TSA response (~64KB) would throw RangeError, silently dropping the timestamp.

**Fix**: Loop-based string accumulation before btoa. Same pattern already used elsewhere in the codebase (signing.js line 533).

### 2. GeneralizedTime UTC Validation (code-review-minion, BLOCK)

`parseGeneralizedTime` accepted non-UTC timestamps without validation. A TSA omitting the `Z` suffix would produce a timestamp silently treated as UTC when it isn't. DER requires UTC for GeneralizedTime in RFC 3161.

**Fix**: Reject non-Z input with explicit error.

### 3. PKIStatus Multi-Byte Read (code-review-minion, ADVISE)

The original code took the last byte of the INTEGER value. For multi-byte values like `[0x01, 0x00]` (encoding 256), this returns 0 -- falsely accepting a TSA rejection. Values 0-5 are always single-byte in practice, but the logic was wrong.

**Fix**: Big-endian integer read.

### 4. Broken wacz.test.js Assertions (margo, BLOCK)

Three tests destructured `signedData.{keyId, signature, publicKey}` from the old v0.1.0 flat format. The code now produces v0.2.0 where those fields live inside `signedData.signatures[0]`.

**Fix**: Updated destructuring to navigate the signatures array.

## Human Interventions

This orchestration ran with all approval gates auto-skipped per user directive. The human chose:
- **To skip all gates** to test unattended execution speed
- **Not to intervene** on any specialist recommendation or code review finding -- all fixes were applied as recommended
- **Not to intervene** on the TSA provider selection or ASN.1 approach -- both aligned with prior architectural discussions

The human provided the evolution slug (`rfc3161-timestamps`) and sequence number guidance (check `docs/evolution/` for next available).

## Where to Read More

- Specialist planning contributions: `docs/history/nefario-reports/2026-03-16-160550-rfc3161-timestamps/` (scratch files)
- Phase 3.5 architecture review verdicts: same directory, `phase3.5-*.md` files
- Phase 5 code review findings: same directory, `phase5-*.md` files
- Original issue: GitHub #41
