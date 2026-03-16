# Code Review: RFC 3161 Timestamp Integration

Reviewer: code-review-minion
Files reviewed: src/rfc3161.js, src/wacz.js, src/capture.js, src/verify.js,
src/verify-page.js, wrangler.toml, vitest.config.js

---

VERDICT: ADVISE

---

## FINDINGS

### [BLOCK] src/rfc3161.js:369 -- btoa spread on arbitrary-length token may OOM

```js
const token = btoa(String.fromCharCode(...tokenBytes));
```

`String.fromCharCode(...tokenBytes)` uses spread to pass potentially thousands
of bytes as function arguments. In V8 (Cloudflare Workers), a spread of ~65,000
elements can hit the call-stack argument limit and throw a RangeError, silently
dropping the timestamp from the capture (caught by the outer try/catch in
wacz.js). The MAX_RESPONSE_BYTES cap is 64 KB, which sits right at the danger
threshold.

FIX: Replace with a loop or TextDecoder-free approach:

```js
let binary = '';
for (let i = 0; i < tokenBytes.length; i++) {
  binary += String.fromCharCode(tokenBytes[i]);
}
const token = btoa(binary);
```

The same pattern is already used correctly in `verifyTimestamp` at line 236
(`Uint8Array.from(atob(tokenBase64), c => c.charCodeAt(0))`), so this is an
inconsistency worth fixing for the same robustness reason.

---

### [BLOCK] src/rfc3161.js:533 -- non-UTC GeneralizedTime silently produces wrong timestamp

`parseGeneralizedTime` (line 529) strips a trailing `Z` if present but does
not reject strings that omit `Z`, have timezone offsets (`+0200`), or carry
sub-second fractional formats other than `.fff`. DER requires UTC (trailing Z)
for GeneralizedTime in RFC 3161, but a misbehaving TSA could respond without
`Z`, causing the parsed ISO string to be interpreted as UTC when it is not.

FIX: Validate that the input ends with `Z` before parsing and throw on
non-UTC input:

```js
function parseGeneralizedTime(gt) {
  if (!gt.endsWith('Z')) {
    throw new Error(`DER: GeneralizedTime must use UTC (trailing Z), got: ${gt.slice(-4)}`);
  }
  const s = gt.slice(0, -1);
  // ... rest unchanged
```

This converts a silent data corruption into a verifiable error that surfaces
through the catch in `requestTimestamp`, where it is logged, and in
`verifyTimestamp`, where it returns `{ valid: false, reason: ... }`.

---

### [ADVISE] src/rfc3161.js:332-334 -- PKIStatus multi-byte encoding read is wrong

```js
const status = statusTlv.value[statusTlv.value.length - 1];
if (status !== 0) throw new Error(`TSA rejected request with PKIStatus ${status}`);
```

The comment "take the last byte" is an incorrect strategy for a multi-byte
DER INTEGER. A PKIStatus value of 0 encoded as two bytes `[0x00, 0x00]`
(valid DER for 0 with sign extension) would still read 0 correctly, but a
value like `[0x01, 0x00]` (which encodes 256) would return 0 -- falsely
accepting a rejected response. For PKIStatus, values are 0-5, so single-byte
encoding is virtually universal in practice, but the read logic should be
correct.

FIX: Read the value properly. For a small INTEGER, read as big-endian:

```js
let status = 0;
for (const b of statusTlv.value) status = (status << 8) | b;
if (status !== 0) throw new Error(`TSA rejected request with PKIStatus ${status}`);
```

---

### [ADVISE] src/rfc3161.js:506-509 -- nonce detection relies on tag, not position

```js
default:
  // nonce is an optional INTEGER at child 5 or later (after accuracy/ordering)
  if (childIdx > 4 && child.tag === 0x02) {
    nonceHex = [...child.value].map(b => b.toString(16).padStart(2, '0')).join('');
  }
```

RFC 3161 TSTInfo field ordering is fixed: version(0), policy(1),
messageImprint(2), serialNumber(3), genTime(4), accuracy(5 OPTIONAL),
ordering(6 OPTIONAL BOOLEAN), nonce(7 OPTIONAL INTEGER), tsa(8 OPTIONAL),
extensions(9 OPTIONAL). Accuracy is a SEQUENCE (0x30), ordering is a BOOLEAN
(0x01), tsa is a context-tagged CHOICE -- so an INTEGER at childIdx > 4 is
always the nonce in practice.

However, if a TSA omits accuracy but includes ordering, childIdx shifts:
nonce lands at index 6. If a TSA includes all optional fields before the
nonce, the tag heuristic still works because only the nonce is an untagged
INTEGER after genTime. The logic is effectively correct but the comment is
misleading about the child index range.

More importantly: if a TSA returns a malformed response where serialNumber
(child 3, also INTEGER) is encoded past index 4 for some reason, the nonce
could be mis-identified. This is an edge case in practice.

FIX: No code change required, but update the comment to be accurate:

```js
// nonce is the only untagged INTEGER (0x02) after genTime (child 4).
// accuracy (SEQUENCE), ordering (BOOLEAN), tsa (context-tagged) all
// have different tags, so tag 0x02 uniquely identifies the nonce.
if (childIdx > 4 && child.tag === 0x02) {
```

---

### [ADVISE] src/verify.js:223 -- `verified` predicate change is safe but needs scrutiny

```js
const verified = checks.every(c => c.status === 'pass' || c.status === 'skip');
```

The review question was: can `skip` appear without a co-occurring `fail` that
makes `verified: false` anyway?

Tracing all `skip` paths in verify.js:

1. `artifactHashes: skip` -- only on line 94, when `digestRaw` is missing.
   `bundleHash: fail` and `signature: fail` are both set in the same early
   return, so `verified` would be `false` regardless.

2. `timestamp: skip` -- only on line 199, when no `rfc3161` entry in
   signatures array. This is the new case. The other three checks may all
   `pass`. So `verified` can be `true` even with a `skip` on timestamp.

This is intentional and correct per the design (absent timestamp = tolerated,
present-but-invalid = blocked). The comment on line 220-222 documents this
accurately. No code change needed. The predicate change is safe.

---

### [ADVISE] src/verify.js:171-173 -- v0.2.0 signature lookup falls through to `signedData` on not-found

```js
const selfSig = version === '0.2.0'
  ? (signedData?.signatures ?? []).find(s => s.type === 'self')
  : signedData;
```

If a v0.2.0 WACZ has no `type: "self"` entry (malformed), `selfSig` is
`undefined`. The subsequent `selfSig?.signature ?? null` correctly produces
`null`, which triggers the `'signedData.signature missing'` failure path.
This is correct and the optional chaining handles the undefined case safely.

No issue, noting for completeness.

---

### [ADVISE] src/wacz.js:129 -- digestDoc missing `keyId` in signedData

The v0.2.0 `digestDoc.signedData` object (lines 122-132) does not include
`keyId`. Looking at wacz.test.js line 180-183, the test
`'datapackage-digest.json includes keyId in signedData'` expects
`digest.signedData.keyId` to be present. This test would fail with the new
v0.2.0 format unless `keyId` was moved or the test was updated.

Check whether `keyId` was intentionally dropped from signedData in v0.2.0 or
whether the test needs updating. If the test references the old v0.1.0 field
path, it will pass silently against the old format but fail against v0.2.0
WACZs once the test helper is updated. The wacz.test.js `buildTestWacz` still
builds v0.1.0 format (line 63: `version: '0.1.0'`), so this test exercises
the old path and the new path is untested.

FIX: Either add `keyId` to the v0.2.0 signatures array self-entry (as
`signatures[0].keyId`), or update wacz.test.js to reflect that `keyId` moved.
Confirm which is canonical for v0.2.0 downstream consumers.

---

### [ADVISE] src/verify-page.js:333 -- `signing` reads from `verifyData.signing` but API maps `result.capture` to `signing`

In `buildResult` (line 333) and `populate` (line 424), the code reads:
```js
var signing = verifyData.signing || {};
```

In `src/index.js` line 496, the verify response maps:
```js
signing: result.capture || null,
```

And `result.capture` (from `verifyWacz`) contains: `bundleHash`, `signature`,
`publicKey`, `signedAt`, and optionally `timestamp`. The verify-page.js code
reads `signing.bundleHash`, `signing.signedAt`, `signing.timestamp.tsa`,
`signing.timestamp.genTime` -- all of which map correctly to these fields.

This is consistent. The field rename from internal `capture` to API `signing`
is correct and verify-page.js consumes the API field name. No issue.

---

### [ADVISE] src/verify.js:196-213 -- `verifyTimestamp` exception not expected but caught defensively

```js
try {
  const result = verifyTimestamp(tsEntry.token, signedData.hash);
  ...
} catch {
  checks.push({ name: 'timestamp', status: 'fail', detail: '...' });
}
```

`verifyTimestamp` never throws (it wraps everything in try/catch and returns
`{ valid: false, reason }`). The outer catch is defensive dead code today. It
does not cause a bug, but documents that the caller is uncertain about the
callee's contract. The catch is cheap and safe to keep, but worth noting.

---

### [NIT] src/rfc3161.js:341 -- tokenTagOffset computation is fragile

```js
const tokenTagOffset = tokenTlv.end - tokenTlv.length - writeLength(tokenTlv.length).length - 1;
```

This reverse-engineers the tag byte offset from `.end` by subtracting value
length, length-encoding bytes, and the tag byte. It is technically correct
but hard to audit. The pattern elsewhere (e.g., `outerValueStart = outerTlv.end
- outerTlv.length`) is cleaner. A helper that returns `tagOffset` from
`readTLV` would remove the need for this calculation, but it is a refactor
concern not a bug.

---

### [NIT] test/verify.test.js:118 -- check count assertion will fail for v0.2.0 WACZs

```js
expect(result.checks).toHaveLength(3);
```

This test uses a v0.1.0 WACZ helper, so it correctly expects 3 checks. When
tests are added for v0.2.0 WACZs, the equivalent assertion must be
`toHaveLength(4)`. The existing test is correct for its scope, but the test
suite has a coverage gap: there are no tests exercising the 4-check path
(v0.2.0 with or without a timestamp entry). The `verifyTimestamp` function
itself also has no test file (`test/rfc3161.test.js` does not exist).

FIX (test-minion handoff): Add tests for:
- `verifyWacz` with a v0.2.0 WACZ (no TSA entry) -- expects 4 checks, timestamp is skip, `verified: true`
- `verifyWacz` with a v0.2.0 WACZ (valid TSA token) -- expects timestamp pass
- `verifyWacz` with a v0.2.0 WACZ (corrupted TSA token) -- expects timestamp fail, `verified: false`
- `verifyTimestamp` unit tests (DER parsing, nonce stripping, hash mismatch)
- `buildTimeStampReq` / `parseGeneralizedTime` unit tests

---

### [NIT] wrangler.toml:44 -- TSA_URL in [vars] is public plaintext

`TSA_URL = "https://timestamp.digicert.com"` is a public, non-secret URL.
Putting it in `[vars]` is correct. No issue. Noting this is the right call
versus using `wrangler secret put` (which is for secrets only).

---

## Backward Compatibility Assessment

v0.1.0 WACZ files (3 checks, `signature`/`publicKey` at signedData top level)
continue to verify correctly. The normalization path at verify.js:171-173
detects version and reads `signedData` directly for v0.1.0. All 3 existing
check types and their pass/fail logic are unchanged. The `verified` predicate
change (`every(pass || skip)`) does not affect v0.1.0 results because v0.1.0
WACZs never produce a `skip` status -- the only `skip` path reachable without
a co-occurring `fail` is the new `timestamp: skip` which only runs for
v0.2.0.

Backward compatibility: confirmed intact.

---

## Cross-Module Integration Assessment

- `wacz.js` calls `requestTimestamp(env.TSA_URL, bundleHash)` correctly. The
  bundleHash is already in `"sha256:{hex}"` format (produced by `sha256()` in
  warc.js), matching the expectation in `requestTimestamp`.
- `verify.js` calls `verifyTimestamp(tsEntry.token, signedData.hash)` where
  `tsEntry.token` is the base64-encoded raw token stored by `wacz.js`, and
  `signedData.hash` is the bundleHash. Both match the function's parameter
  expectations.
- `capture.js` reads `timestampStatus` from `buildWacz`'s return value and
  logs it at line 202. The field is correctly conditional on `waczInfo` being
  non-null.
- Integration is consistent across all three call sites.

---

## DER Buffer Safety Summary

- `readLength`: bounds-checks offset before reading, bounds-checks multi-byte
  length before reading all bytes. Safe.
- `readTLV`: bounds-checks offset, validates `valueStart + length <= buf.length`.
  Safe.
- `childAt`: iterates with `pos < valueEnd`, uses validated `readTLV` at each
  step. Safe.
- `parseTSTInfo`: iterates with `pos < ve` using validated `readTLV`. Safe.
- `extractTSTInfo`: all navigation uses `childAt` and validated `readTLV`. Safe.
- No reads beyond declared lengths observed.

One concern: `parseAndValidate` calls `readTLV(der, 0)` on the full response
buffer and then passes the same `der` buffer plus offsets to `extractTSTInfo`.
The `childAt` calls use `der` (full buffer) with `valueStart`/`valueEnd` bounds
derived from the outer TLV, so bounds are preserved. Safe.

---

## Security Assessment

- No hardcoded secrets found.
- TSA URL comes from `env.TSA_URL` (wrangler var), not user input.
- Error messages in `verifyTimestamp` return `err.message` from DER parsing
  errors (line 248). DER parse errors from a malformed stored token include
  offset values like `"DER: TLV at offset 42 declares length 9999..."`. These
  leak structural information about stored tokens. For the verify path this is
  low risk (the token came from our own TSA response), but the message is
  returned in the check detail field. The existing security test in verify.test.js
  confirms hash values are not leaked; DER structure offsets are a lower-risk
  class of information.
- `btoa(String.fromCharCode(...tokenBytes))` spread at line 369 (already noted
  as BLOCK above) is the only meaningful risk in the new module.
