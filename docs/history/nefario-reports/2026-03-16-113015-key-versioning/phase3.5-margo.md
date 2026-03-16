# Margo Complexity Review: R2 Key Versioning

## Verdict: ADVISE

The plan is proportional to the problem. Key versioning is essential complexity
-- without it, rotating the signing key silently invalidates every previously
signed WACZ bundle, which is a data integrity failure in a system whose purpose
is data integrity. The plan correctly keeps the change surface small (5 existing
files, 2 new KV helpers, 1 new endpoint) and introduces zero new dependencies.
The design decisions are sound: `verifyWacz()` stays pure, key resolution stays
server-side, KV is appropriate storage for single-digit key counts.

Two items warrant attention before execution. Neither blocks the work.

---

## Finding 1: `/.well-known/signing-keys` list endpoint may be YAGNI

**What**: The plan adds a new `GET /.well-known/signing-keys` endpoint that
enumerates all archived public keys via KV prefix scan.

**Why this looks accidental**: The success criteria say "/.well-known/signing-keys
endpoint serves historical public keys" -- but the security-minion's own analysis
(phase2, section 5) flags this as "optional, deferrable" and recommends
considering whether it needs to exist for MVP at all. The security-minion
suggests a point-lookup endpoint (`/.well-known/signing-keys/{keyId}`) as a
lower-risk, lower-complexity alternative. The synthesis plan includes the list
endpoint anyway.

**YAGNI test**: Who needs this endpoint today? Server-side verification uses
`record.wacz.keyId` to look up a specific key -- it never enumerates. The only
consumer would be an external/third-party verifier, and the prompt's scope
section explicitly excludes multi-tenant key management. A point-lookup by
`keyId` serves third-party verifiers equally well (they have the `keyId` from
the WACZ) without requiring a KV list scan, a response cap, or the information
disclosure considerations the security-minion raised.

**Simpler alternative**: Either (a) defer the list endpoint entirely -- the
existing `/.well-known/signing-key` (singular) already serves the current key,
and point-lookup by `keyId` can be added when an actual consumer exists; or
(b) replace the list endpoint with a point-lookup
`GET /.well-known/signing-keys/{keyId}` that does a single KV get. Both are
strictly simpler and avoid the KV prefix scan, response capping, and enumeration
concerns.

**Impact if deferred**: Zero. No current consumer needs to enumerate all keys.
The `keyId` is embedded in every WACZ for offline verifiers who can then request
that specific key.

**Recommendation**: Build the point-lookup (`/.well-known/signing-keys/{keyId}`)
instead of the list endpoint. This satisfies the third-party verifier use case
with a single KV get instead of a prefix scan, eliminates the enumeration
concern, and removes 1 KV helper function (`listArchivedSigningKeys`) and its
tests.

---

## Finding 2: `listArchivedSigningKeys` KV helper is coupled to Finding 1

**What**: The plan adds three KV functions: `archiveSigningKey`,
`getArchivedSigningKey`, and `listArchivedSigningKeys`. The first two are
essential (archive on sign, lookup on verify). The third exists solely to serve
the list endpoint.

**Why this looks accidental**: `listArchivedSigningKeys` does a KV prefix scan
(`kv.list({ prefix: 'signing-key:' })`). It has no other caller. If the list
endpoint is deferred or replaced with point-lookup per Finding 1, this function
has zero consumers.

**Simpler alternative**: Drop `listArchivedSigningKeys` and its tests. If the
list endpoint is built later, add the function then. Two functions
(`archiveSigningKey` + `getArchivedSigningKey`) cover all requirements.

---

## Finding 3: Legacy fallback -- the "try all archived keys" path is unnecessary complexity

**What**: The synthesis plan (decision 6) says: "Legacy fallback: no keyId in KV
record -> try current key first, then all archived keys."

**Why this looks accidental**: The security-minion explicitly recommends against
this. Their analysis (section 4) says: "Do not silently fall back to the current
key for all cases. Be explicit." And further: after a key rotation, legacy
bundles "cannot be verified because the signing key is gone." Trying all archived
keys is a brute-force key search that (a) grows linearly with key count, (b)
masks the real problem (legacy record missing `keyId`), and (c) contradicts the
security-minion's guidance.

The correct behavior the security-minion prescribed: if `record.wacz.keyId` is
absent, try the current key (safe before first rotation). If that fails, return
`verified: false` with an honest message. No key enumeration.

**Simpler alternative**: Legacy fallback = try current key only. If it fails,
return `verified: false` with detail "signing key for this capture is no longer
available." This is 3 lines of code instead of an enumeration loop, and it is
the behavior the security-minion prescribed.

---

## What the plan gets right

- **`verifyWacz()` stays pure**: `(waczBytes, publicKeyBytes)` signature is
  unchanged. Key resolution in the handler. This is the critical design
  constraint and the plan nails it.
- **Zero new dependencies**: all crypto is Web Crypto API. No new packages.
- **KV is appropriate**: single-digit key count over service lifetime. No need
  for a database, no need for anything fancier.
- **Archive BEFORE `completeCapture()`**: eliminates the race window the
  security-minion flagged. Synchronous, not `waitUntil()`. Correct.
- **Two-task execution order**: implementation then tests, sequential dependency.
  Clean and minimal.
- **keyId = 16 hex chars**: the synthesis adopted the security-minion's
  recommendation to use 16 chars instead of 8. Good.
- **Backward compatibility via KV record, not WACZ contents**: server-side
  trust model preserved.

---

## Complexity budget tally

| Item | Column | Cost |
|------|--------|------|
| `computeKeyId()` in signing.js | managed | 0 (utility function, no abstraction) |
| 2 KV helpers (archive + get) | managed | 1 (new abstraction in existing module) |
| `listArchivedSigningKeys` KV helper | managed | 1 (if kept; 0 if dropped per Finding 2) |
| keyId in signedData and KV record | managed | 0 (data field additions, no new abstraction) |
| Verification key resolution in handler | managed | 1 (new logic path in existing handler) |
| `/.well-known/signing-keys` endpoint | managed | 2 (new route + handler + KV scan; 1 if point-lookup) |
| **Total** | | **5** (or **3** with simplifications) |

Budget of 3 is proportional to the problem (key rotation resilience for a
signing system). Budget of 5 is acceptable but carries unnecessary items.

---

## Summary

The plan is well-scoped and the core design is correct. Three items add
unnecessary complexity: the list endpoint (replace with point-lookup or defer),
the `listArchivedSigningKeys` helper (drop if list endpoint is deferred), and
the "try all archived keys" fallback (replace with current-key-only fallback per
security-minion guidance). None of these block execution -- they are refinements
that reduce the implementation surface without losing any required capability.
