# Outcome: RFC 3161 Timestamp Integration

## What Was Built

Every WACZ bundle now includes an RFC 3161 timestamp response from DigiCert's TSA when the `TSA_URL` environment variable is configured. The `datapackage-digest.json` format evolves from v0.1.0 (flat `signedData`) to v0.2.0 (with `signatures` array). Verification validates both the Ed25519 self-signature and the TSA timestamp.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/rfc3161.js` | Created | Minimal DER encoder/decoder + TSA HTTP client (545 lines) |
| `src/wacz.js` | Modified | Signatures array format, TSA integration, v0.2.0 schema |
| `src/capture.js` | Modified | `timestampStatus` field in capture logging |
| `src/verify.js` | Modified | Dual-format support, 4th timestamp check, skip tolerance |
| `src/verify-page.js` | Modified | Timestamp check row, TSA crypto details |
| `wrangler.toml` | Modified | `TSA_URL` in vars and staging vars |
| `vitest.config.js` | Modified | `TSA_URL` test binding |
| `openapi.yaml` | Modified | v0.4.0 with timestamp check, signing.timestamp field |
| `README.md` | Modified | Check count and format references |
| `test/rfc3161.test.js` | Created | 17 tests for DER codec and TSA client |
| `test/verify.test.js` | Modified | 8 new v0.2.0 verification tests |
| `test/wacz.test.js` | Modified | Fixed for v0.2.0 format |
| `test/verify-integration.test.js` | Modified | Relaxed for 4-check response |

**Totals**: 13 files changed, +1413/-42 lines, 497 tests passing.

## Success Criteria Status

| Criterion | Status |
|-----------|--------|
| Capture pipeline requests RFC 3161 timestamp from TSA | Done (DigiCert HTTPS) |
| Timestamp stored as `type: "rfc3161"` in signatures array | Done |
| Verification endpoint validates both signatures | Done (4 checks) |
| Verification page shows timestamp status | Done ("Independent time verification") |
| ASN.1 parsing handles TSA response format | Done (hand-rolled DER codec) |
| Graceful degradation if TSA unreachable | Done (rfc3161 entry omitted, capture succeeds) |
| Tests cover key scenarios | Done (17 rfc3161 + 8 verify v0.2.0 tests) |

## Surprises

1. **rfc3161.js grew to 545 lines** vs. the planned 150-250. The CMS SignedData structure is deeply nested (ContentInfo > SignedData > EncapContentInfo > TSTInfo), requiring more navigation code than anticipated. Margo reviewed and confirmed this is proportional to the structure depth, not over-engineering.

2. **DER INTEGER sign-extension** was flagged by security-minion in Phase 3.5 review. When a nonce's high bit is set (~50% of the time), DER encodes it as 17 bytes with a leading 0x00. Without handling this, half of all timestamp requests would fail nonce validation. This was incorporated into Task 1 from the start.

3. **Code review found a btoa spread RangeError** in rfc3161.js. `btoa(String.fromCharCode(...tokenBytes))` hits V8's call-stack argument limit on large TSA responses. Fixed to use a loop before commit.

4. **Task 4 (index.js update) was a no-op**. The `signing: result.capture` assignment flows timestamp data through automatically. Margo had predicted this in Phase 3.5.

## Backlog Changes

Items to add to `docs/backlog.md`:
- **Certificate chain validation**: Full CMS signature verification for stored RFC 3161 tokens (deferred from this phase, requires offline tooling)
- **Multiple TSA redundancy**: Fallback to a second TSA if the primary is unavailable
- **v0.1.0 deprecation timeline**: When to stop producing v0.1.0 format (answered: already stopped -- all new captures use v0.2.0)
