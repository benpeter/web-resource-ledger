# UX Strategy Review: R2 Key Versioning

**Verdict: APPROVE**

---

## Assessment

### API Consistency

The plan maintains clean consistency with the existing API surface. The existing `/.well-known/signing-key` endpoint returns `{ algorithm, publicKey }` — the new `/.well-known/signing-keys` endpoint returns an array using the same shape per element. Plural/singular naming clearly signals the difference between "current key" and "all keys". The route table pattern in `src/index.js` handles both without ambiguity.

One minor observation: the plan specifies adding `keyId` to the `handleGetSigningKey()` response (the singular endpoint). This is backward-additive — existing consumers that only read `algorithm` and `publicKey` are unaffected. Consumers that want to resolve a key by `keyId` will now have a path to do so. This is the right call.

### Endpoint Naming Coherence

`/.well-known/signing-keys` is the correct name. It follows RFC 8615 well-known URI conventions and the plural form accurately describes the resource. Keeping the singular endpoint for backward compatibility is correct — deprecation can come later once consumers migrate.

### Backward Compatibility for Existing Consumers

The fallback chain (keyId in KV record -> current key -> all archived keys) covers all three real-world states:

1. New captures: resolved via keyId in KV record (fast, deterministic)
2. Legacy captures (no keyId in KV record): current key tried first, then archived keys (handles pre-versioning captures)
3. Rotation scenario: archived keys catch signatures made with the previous key

The constraint "archive before completeCapture()" eliminates the race window. The idempotent archive (same keyId overwrites same value) means retries are safe. This is a solid sequence.

### One Implementation Detail to Verify

The plan says `handleVerifyCapture()` reads `keyId` from the KV record and uses it to select the archived key. However, `verify.js` currently takes `(waczBytes, publicKeyBytes)` as a pure function — key resolution happens in the handler. The plan correctly keeps `verifyWacz()` unchanged, with key resolution in `handleVerifyCapture()`. Make sure the handler passes the resolved `publicKeyBytes` (not the keyId) into `verifyWacz()`. This is consistent with the existing security model where the public key comes from the server, never from the WACZ itself.

### Cognitive Load for Future Maintainers

The KV key namespace is clean: `signing-key:{keyId}` is unambiguous and won't collide with existing `cap_` prefixed capture records. The 8-hex-char fingerprint is short enough to log and display without truncation. Single-digit key counts over service lifetime means `listArchivedSigningKeys()` returning a full array is fine — no pagination complexity needed.

---

## Summary

The plan is coherent, backward-compatible, and minimal. No unnecessary complexity introduced. The scope boundary (no automated rotation scheduling, no HSM, no multi-tenant) is correctly drawn. Proceed to execution.
