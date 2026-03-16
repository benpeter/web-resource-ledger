# Lucy Review: RFC 3161 Timestamp Integration

**Verdict: ADVISE**

Proceed with noted adjustments. The implementation aligns well with issue #41's
success criteria and follows project conventions consistently. Two findings
require attention before merge; remaining items are advisory.

---

## Requirements Traceability

| # | Requirement (from prompt.md / issue #41) | Plan Element | Status |
|---|------------------------------------------|--------------|--------|
| 1 | Capture pipeline requests RFC 3161 timestamp from a reliable TSA | `src/rfc3161.js` requestTimestamp() + `src/wacz.js` Step 8.5 + `wrangler.toml` TSA_URL = DigiCert | PASS |
| 2 | Timestamp stored as new entry in signatures array (`type: "rfc3161"`) | `src/wacz.js` lines 115-119: signatures array with `{ type: 'rfc3161', token, tsa }` | PASS |
| 3 | Verification endpoint validates both self-signature and TSA timestamp | `src/verify.js` Check 4 (lines 193-213): verifyTimestamp call, skip/pass/fail logic | PASS |
| 4 | Verification page shows independent timestamp status | `src/verify-page.js`: CHECK_LABELS.timestamp, CHECK_DESCS.timestamp, TSA name/time in crypto details | PASS |
| 5 | ASN.1 parsing handles TSA response format correctly | `src/rfc3161.js`: DER codec (readTLV/writeTLV/childAt), TimeStampReq builder, TimeStampResp parser, TSTInfo extractor | PASS |
| 6 | Graceful degradation if TSA unreachable | `src/wacz.js` lines 102-108: try/catch around requestTimestamp, capture continues without timestamp | PASS |
| 7 | Tests: successful timestamp, TSA timeout, timestamp verification, malformed response | **See FINDING-1 below** | GAP |
| 8 | Out of scope: eIDAS, multiple TSA redundancy, WACZ-Auth full spec | No code for any of these. Parking lot references intact in backlog.md | PASS |

---

## Findings

### FINDING-1 [TRACE] -- No test file for rfc3161.js

**WHAT:** `src/rfc3161.js` declares `Tests: test/rfc3161.test.js` in its header
comment. No such file exists. No test file in `test/` imports from
`../src/rfc3161.js`. The prompt.md success criteria explicitly require tests
for: successful timestamp, TSA timeout, timestamp verification, and malformed
response.

**IMPACT:** The DER codec and TSA client are untested. The DER parsing logic
is ~320 lines of hand-written binary protocol handling -- exactly the kind of
code that benefits most from unit tests. The verify.test.js tests still use
v0.1.0 format bundles and have zero coverage of the timestamp check path.
The wacz.test.js file has no timestamp-related assertions.

**FIX:** Add `test/rfc3161.test.js` covering:
- `requestTimestamp()` with a mocked TSA returning a valid TimeStampResp
- `requestTimestamp()` with a mocked TSA timeout (AbortSignal)
- `verifyTimestamp()` with a valid token + matching hash
- `verifyTimestamp()` with a valid token + mismatched hash
- `verifyTimestamp()` with garbage/truncated base64

Also update `test/verify.test.js` to include at least one v0.2.0-format
bundle with an rfc3161 entry to exercise Check 4 in verifyWacz.

---

### FINDING-2 [CONVENTION] -- verify.test.js still hardcodes v0.1.0 format

**WHAT:** The test helper `buildTestWacz()` in `test/verify.test.js` (line 62)
builds bundles with `version: '0.1.0'` and the flat `signedData` shape. It does
not produce v0.2.0 bundles with the `signatures` array. The v0.2.0 code path
(lines 171-173, 194-213 of verify.js) is not exercised by any unit test.

**IMPACT:** The dual-format logic in verify.js (v0.1.0 flat vs v0.2.0
signatures array) has no test coverage for the new format. The selfSig
extraction, timestamp check, and the skip-tolerance logic (`checks.every(c =>
c.status === 'pass' || c.status === 'skip')`) are all untested in isolation.
Integration tests in verify-html.test.js exercise the full pipeline
(which now produces v0.2.0 bundles via wacz.js), but that is end-to-end
coverage, not a targeted verification of the format-handling logic.

**FIX:** Add a `buildTestWaczV2()` helper that produces v0.2.0 bundles with
the signatures array. Add tests for:
- v0.2.0 bundle with `type: "self"` only (no rfc3161) -> 4 checks, timestamp skip
- v0.2.0 bundle with `type: "self"` + `type: "rfc3161"` with valid token -> 4 checks, all pass
- v0.2.0 bundle with `type: "rfc3161"` containing invalid token -> timestamp fail -> verified: false

---

### FINDING-3 [CONVENTION] -- Header comment in wacz.js references stale step numbering

**WHAT:** `src/wacz.js` header comment (lines 1-15) does not mention RFC 3161
timestamps in its numbered step list. The actual code has a Step 8.5 (line 100:
"Request RFC 3161 timestamp") and the signatures array (lines 115-119) which are
significant behavioral additions. The header comment still describes a 6-step
process ending with "Zips all files."

**IMPACT:** Low. Convention violation only -- the header comment pattern in this
project is used as a module summary (see signing.js, warc.js, capture.js, kv.js,
verify.js). All of those modules have accurate header comments. wacz.js is now
the exception.

**FIX:** Update the header comment in wacz.js to include the timestamp step
and the signatures array format, consistent with the level of detail in other
module headers.

---

### FINDING-4 [COMPLIANCE] -- YAGNI assessment: DER 3-byte length encoding

**WHAT:** `writeLength()` in rfc3161.js (line 43) supports 3-byte length
encoding for values up to 16,777,215 bytes. The module caps TSA responses at
64 KB (`MAX_RESPONSE_BYTES = 65536`). The 2-byte encoding
(`0xffff` = 65535) is sufficient for the maximum supported response.

**IMPACT:** Negligible. Three extra lines of code. The comment on line 35
("sufficient for 64 KB responses") correctly documents 2-byte would suffice.
The 3-byte path is dead code under current constraints. Borderline YAGNI but
the cost is trivial.

**FIX:** Optional. Either remove the 3-byte branch and add a comment explaining
why 2-byte suffices, or keep it with the existing comment. Not blocking.

---

### FINDING-5 [SCOPE] -- signedData version bump to 0.2.0

**WHAT:** The `wacz.js` code (line 129) sets `version: '0.2.0'` in the
signedData block, and `verify.js` (line 116) dispatches on this version.
The prompt.md scope states "signatures array extension" is in scope, and
the prompt.md constraints note "The `signatures` array in
`datapackage-digest.json` was designed for this extension."

**ASSESSMENT:** The version bump is directly required by the format change.
It is not scope creep -- it is the mechanism by which the new format is
distinguished from legacy. The dual-format support in verify.js is backward
compatible. This is correctly scoped.

---

### FINDING-6 [COMPLIANCE] -- TSA_URL hardcoded as DigiCert in wrangler.toml

**WHAT:** `wrangler.toml` line 44 sets `TSA_URL = "https://timestamp.digicert.com"`
as a `[vars]` (non-secret) environment variable. This is configurable per
environment (staging also gets its own copy).

**ASSESSMENT:** Correct approach. The prompt.md recommends "DigiCert or
GlobalSign" and the implementation chose DigiCert. Making it a var rather than
a hardcoded constant allows changing TSA without code changes. The graceful
degradation means a bad URL simply results in captures without timestamps.
No issue.

---

### FINDING-7 [CONVENTION] -- vitest.config.js TSA_URL binding

**WHAT:** `vitest.config.js` line 28 adds `TSA_URL: 'https://timestamp.digicert.com'`
to the miniflare bindings. This means tests that exercise the full pipeline
(verify-html.test.js) will attempt real HTTP calls to DigiCert's TSA unless
fetchMock intercepts them.

**ASSESSMENT:** The verify-html.test.js already activates fetchMock
(`fetchMock.activate(); fetchMock.disableNetConnect();`) in its beforeEach,
which blocks all outbound HTTP. However, the fetchMock setup only intercepts
`TEST_ORIGIN` (`https://example.com`), not `timestamp.digicert.com`. Under
`disableNetConnect()`, the TSA call will be rejected by fetchMock, triggering
the graceful degradation path. This means integration tests never exercise
a *successful* timestamp path -- only the graceful-degradation path. This
reinforces FINDING-1: there is no test that exercises a successful timestamp
response.

**FIX:** Addressed by FINDING-1. When adding rfc3161 tests, include a
fetchMock interceptor for the TSA URL that returns a valid TimeStampResp DER
payload.

---

## CLAUDE.md Compliance Check

| Directive | Status |
|-----------|--------|
| YAGNI -- no speculative features | PASS. Only builds what issue #41 requires. Certificate chain validation explicitly deferred (rfc3161.js line 12, backlog parking lot). |
| KISS -- simple beats elegant | PASS. Hand-rolled DER codec is ~150 lines. No ASN.1 library dependency added. Purpose-built, not general-purpose (stated in header). |
| Lean and Mean -- minimize deps | PASS. Zero new dependencies. DER codec is hand-written. |
| Prefer vanilla JS | PASS. No frameworks added. |
| Latency <300ms | PASS. TSA call has 3s timeout (line 19) and is async/non-blocking on the capture response (runs in ctx.waitUntil). Verification-time timestamp check is synchronous DER parsing, sub-ms. |
| Header comment pattern | ADVISE. See FINDING-3. All other modules follow the pattern. |
| Module system (ESM) | PASS. Named exports, consistent with all other src/ modules. |
| `// tva` signature | PASS. Present in rfc3161.js (line 17). |
| Evolution log | Not yet created for 0024 (only prompt.md exists). Expected to be completed during wrap-up per CLAUDE.md rules. |

---

## Scope Assessment

The implementation is tightly scoped to issue #41. No adjacent features were
added. No new dependencies. No new API endpoints. The existing verification
endpoint, page, and capture pipeline were extended minimally. The openapi.yaml
changes document only the new timestamp check and signing.timestamp fields.
The README changes are limited to describing the fourth check.

The only additions beyond the strict issue scope are:
1. Dual-format support in verify.js (required for backward compatibility)
2. Version bump to 0.2.0 (required to distinguish the new format)
3. TSA_URL environment variable (required for configurability)

All three are directly necessary for the feature to function.

---

## Summary

The implementation is well-aligned with issue #41's success criteria and
follows project conventions. The primary gap is **missing tests** (FINDING-1
and FINDING-2): the rfc3161.js module has no test file despite being the most
complex new code, and verify.test.js does not exercise the v0.2.0 format path.
This is the only finding I would flag as requiring action before merge.
FINDING-3 (header comment staleness) is a minor convention fix. FINDING-4
(3-byte DER length) is informational.

**Blocking action:** Add `test/rfc3161.test.js` and v0.2.0-format tests in
`test/verify.test.js` to satisfy the prompt.md success criterion
"Tests cover: successful timestamp, TSA timeout, timestamp verification,
malformed response."
