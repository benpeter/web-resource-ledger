## Security Review: hashed-ip-logging delegation plan

**Verdict: APPROVE**

The plan correctly implements the design I recommended in the planning phase. No blocking issues. Minor notes below for the implementing agent.

---

### Crypto correctness

The two-step HMAC derivation is specified correctly:

```
dailyKey = HMAC-SHA256(IP_HASH_SEED, YYYY-MM-DD)
cip      = HMAC-SHA256(dailyKey, ip)
```

This matches the HKDF-like extract-then-expand pattern I recommended. The iac-minion must use `importKey` with `{ name: 'HMAC', hash: 'SHA-256' }` and `sign` for both steps -- the same pattern as `signing.js` uses for Ed25519, adapted for HMAC. The key usage array for the HMAC key must be `['sign']`. The seed material for step 1 must be encoded as UTF-8 bytes (TextEncoder) before importing -- not passed as a raw string.

The module-scope cache (`cachedKey`/`cachedDate`) is correct. One risk: Cloudflare isolate reuse means the cached key from a prior day could persist if `cachedDate` comparison is not exact. The date string must be the UTC date (`new Date().toISOString().slice(0, 10)`) -- not local time. The plan says this but the implementing agent must not drift to `toLocaleDateString()`.

64-bit truncation (16 hex chars) is acceptable at current traffic volume.

---

### Secret handling

`IP_HASH_SEED` flows only into Web Crypto API operations and is never logged, returned in responses, or exposed in error paths. The graceful degradation path (`return undefined` when seed absent) is correct and does not leak the absence in any user-visible response.

The seed is provisioned as a Cloudflare secret (wrangler secret put), consistent with how `SIGNING_KEY` and `CAPTURE_API_KEY` are handled. The GitHub Actions change adds it to both the `secrets` block and the `env` block -- correct.

The test seed (`'test-ip-hash-seed-for-vitest'`) is a hardcoded plaintext string in vitest.config.js. This is acceptable for test environments and consistent with how `CAPTURE_API_KEY` is handled in tests. It must not be used in production.

---

### Error message leakage

The `errorMessage` field logged from `renderResult.reason?.message` and `err?.message` is Playwright-generated. These messages can contain the target URL (e.g., `"Navigation to https://... failed"`). The target URL was already validated by `validateUrl()` before the capture started, so no attacker-controlled content can appear in this path that wasn't already validated. The 256-char truncation bounds the field size. This is acceptable.

The `errorName` field (`error.name`) is a class name string (e.g., `"TimeoutError"`, `"Error"`). No injection risk.

Neither field is user-facing -- they go to Coralogix only. The INVARIANT comment update in `log.js` correctly documents this reasoning.

---

### Injection vectors in new log fields

`cip` is the first 16 hex chars of an HMAC-SHA256 output. Output space is `[0-9a-f]{16}`. No injection risk regardless of what the attacker supplies as input -- the HMAC output is a fixed-length hex string.

`errorName` and `errorMessage` flow into `log()` which calls `JSON.stringify(data)`. JSON.stringify is safe against log injection when the target is a JSON-based sink (Coralogix). No additional encoding needed.

---

### One implementation note for iac-minion

The `computeCip` prompt says to encode the date string for step 1. Confirm the implementation encodes both the key material (seed as raw bytes via `importKey`) AND the message (date string via `TextEncoder`) before passing to `crypto.subtle.sign`. Passing a bare string to `sign()` will throw a `TypeError` in the Web Crypto API -- it requires `BufferSource`. The signing.js pattern uses `Uint8Array` consistently; follow that.

Suggested skeleton to validate against:

```js
const encoder = new TextEncoder();
const seedBytes = encoder.encode(env.IP_HASH_SEED);
const baseKey = await crypto.subtle.importKey(
  'raw', seedBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
);
const dailyKeyBytes = await crypto.subtle.sign('HMAC', baseKey, encoder.encode(date));
const dailyKey = await crypto.subtle.importKey(
  'raw', dailyKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
);
const cipBytes = await crypto.subtle.sign('HMAC', dailyKey, encoder.encode(ip));
const hex = [...new Uint8Array(cipBytes)].map(b => b.toString(16).padStart(2, '0')).join('');
return hex.slice(0, 16);
```

This is not prescriptive -- the iac-minion may structure it differently -- but the BufferSource constraint on `sign()` must be satisfied.

---

No blocking concerns. Proceed.
