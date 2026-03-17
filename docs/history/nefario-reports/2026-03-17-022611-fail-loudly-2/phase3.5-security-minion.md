## Security Review Verdict: ADVISE

Two narrow findings. Neither blocks execution; both require a targeted change before merge.

---

### [security-1] cdxj.js surt_parse_fail logs attacker-influenced URL

**SCOPE**: Task 1, `src/cdxj.js` line 75 change

**CHANGE**: Plan adds `console.warn('wrl:cdxj.surt_parse_fail', url?.slice(0, 100))` to the `toSurt` fallback.

**WHY**: The `url` argument originates from WARC record metadata, which reflects URLs fetched by the headless browser during a capture. The target URL is validated at the API boundary before capture begins, but subresource URLs (iframes, redirects, injected resources) are not independently validated — they come from the page itself. A malicious page can serve resources with URLs containing newlines, control characters, or log-injection payloads, which would be emitted verbatim (up to 100 chars) to `console.warn`.

For Cloudflare Workers, `console.warn` flows to wrangler tail / Logpush — not to Coralogix and not rendered in HTML. The injection surface is limited (operator log streams only, no SQL or template rendering). Severity is low, but it should be explicit.

**TASK**: Change the `cdxj.js` warn to log only the URL's length and scheme, not the URL value itself:

```js
} catch (err) {
  const scheme = url?.slice(0, 20).replace(/[^\w:]/g, '_') ?? 'none';
  console.warn('wrl:cdxj.surt_parse_fail', { scheme, urlLen: url?.length ?? 0 });
  return url;
}
```

This gives operators enough to understand failure patterns (urn: vs http: vs data: URIs are the interesting distinction) without reflecting attacker-controlled characters into log streams.

---

### [security-2] signing.js error message may reflect key material length or format hints

**SCOPE**: Task 1, `src/signing.js` line 83 change

**CHANGE**: Plan adds `err?.message` to the `console.warn` for signing key validation failure.

**WHY**: WebCrypto engines (V8 / Cloudflare Workers runtime) produce error messages like `"DataError: Failed to import key"` that do not contain key bytes. However, `createPrivateKey` from `node:crypto` (line 61) can produce messages that include DER structure details when the input is malformed — e.g., `"error:1E08010C:DECODER routines::unsupported"` or occasionally byte offsets. These details help an attacker fingerprint what format the system expects if they can observe the log output.

The practical exploit path is limited: `console.warn` in a Worker goes to wrangler tail (authenticated operator access), not to API responses or Coralogix. But the synthesis plan explicitly states "The observability-minion verified that signing.js error messages from WebCrypto do not leak key material" — this claim is partially correct for WebCrypto but does not cover the `node:crypto` path, which is also exercised in this function (lines 61-63).

**TASK**: Add a `slice(0, 64)` truncation and strip the key-format prefix to prevent format oracle hints:

```js
} catch (err) {
  const msg = String(err?.message ?? '').replace(/^error:[0-9A-F:]+:/, '').slice(0, 64);
  console.warn('Signing key validation failed:', msg);
  return null;
}
```

The regex strips OpenSSL error codes (the format-revealing prefix) while preserving the human-readable suffix. Truncation bounds the output. The test added for malformed keys in `test/key-rotation.test.js` should also assert that `console.warn` is called with a message that does not contain the literal key string (use `vi.spyOn` on `console.warn`).

---

### Findings that were reviewed and cleared

- **log.js meta-logging**: `data?.event` is a static string (e.g., `'wrl:log_delivery_fail'`). Error messages are already truncated to 128 chars. No attacker-controlled values flow into these warns. Cleared.
- **index.js createCapture Coralogix event**: `captureId` is a UUID from `crypto.randomUUID()`, `tenantId` is the verified API key owner, `cip` is a 16-char HMAC hex. `errorMessage` is a KV SDK error, truncated to 256 chars. KV SDK errors do not reflect user-supplied URL content. Cleared.
- **consent.js _error field**: `err.constructor.name` and `err.message` are Playwright/browser error strings. The synthesis correctly notes these are Playwright framework messages, not user-URL echoes. The 256-char truncation is adequate. Cleared.
- **capture.js warns**: `err?.message` from session connect and cleanup failures are internal CDP/browser error strings. No user-supplied content flows into these paths. Cleared.
- **Log injection into Coralogix**: The existing `log()` INVARIANT comment correctly documents that callers are responsible for not passing attacker-controlled data. The only Coralogix event added by this plan (index.js capture.kv_create_fail) passes cleared fields per above. No log injection risk in structured Coralogix events.
