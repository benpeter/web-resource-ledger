## Domain Plan Contribution: api-design-minion

### Recommendations

#### 1. Artifact URLs in `capture.complete` payload

**Shape:** Add an `artifacts` object with string URL values, keyed by artifact type. This follows the pattern already shown in the docs example at line 72-76 of `webhooks.md` and matches the existing route pattern `GET /v1/captures/{id}/artifacts/{type}`.

```json
"artifacts": {
  "screenshot": "https://api.webresourceledger.com/v1/captures/cap_.../artifacts/screenshot",
  "html": "https://api.webresourceledger.com/v1/captures/cap_.../artifacts/html",
  "headers": "https://api.webresourceledger.com/v1/captures/cap_.../artifacts/headers"
}
```

**Construction:** Reuse the same `base` variable already computed in `buildWebhookPayload()` (line 101-103). The pattern is `${base}/v1/captures/${captureRecord.captureId}/artifacts/${type}`.

**Which artifact types to include:** Only `screenshot`, `html`, and `headers`. Rationale:
- `screenshot-before` is an internal diff artifact, not useful to webhook consumers who want the current state.
- `wacz` is a derived bundle, not a primary artifact, and may not exist for all captures.
- These three are the ones the docs already promise and the ones consumers actually need for automation.

**Only on `capture.complete`:** Artifact URLs are meaningless on `capture.failed` (no artifacts exist) and `capture.quarantined` (artifacts may be partial or unsafe). Only add them to the `capture.complete` branch.

**Placement in the payload:** Add `artifacts` as a sibling of `captureId`, `status`, `url`, etc. inside `data`. This keeps the payload flat within `data` -- no extra nesting. The docs already show this shape, so this is aligning code to the documented contract.

**Update the comment on line 87-88** that currently says "artifacts paths" are NEVER included. Change it to document that `capture.complete` includes artifact URLs (not R2 keys, which remain excluded).

#### 2. Ping response signature echo

**Recommendation: Flat fields alongside existing response fields.**

The ping response currently returns `{ success, httpStatus, latencyMs }` (and optionally `detail` on failure). Add two fields:

```json
{
  "success": true,
  "httpStatus": 200,
  "latencyMs": 142,
  "signatureHeader": "t=1711108800,v1=abc123def456...",
  "timestampHeader": "1711108800"
}
```

**Why flat, not nested:**
- The ping response is a simple diagnostic object, not a domain entity. Nesting (`signature: { header, timestamp }`) adds structure where there is no semantic grouping that benefits the consumer.
- The field names mirror the actual HTTP header names conceptually (`X-WRL-Signature-256` -> `signatureHeader`, `X-WRL-Timestamp` -> `timestampHeader`), making the mapping obvious.
- Flat fields are easier to destructure in every language. The consumer's test is literally: "take `signatureHeader` from the response, pass it to my `verifyWebhookSignature()` function along with the known ping payload."
- This matches Stripe's approach: their webhook test endpoints return flat diagnostic fields.

**Why not use the actual header names as keys:** Header names contain hyphens and mixed case (`X-WRL-Signature-256`), which are awkward as JSON keys in most languages. camelCase JSON keys are the right convention here.

**Include the ping payload in the response:** For end-to-end verification testing, the consumer also needs the exact payload that was signed. Without it, they cannot reconstruct `${timestamp}.${body}` to verify. Add:

```json
{
  "success": true,
  "httpStatus": 200,
  "latencyMs": 142,
  "signatureHeader": "t=1711108800,v1=abc123def456...",
  "timestampHeader": "1711108800",
  "sentPayload": "{\"id\":\"evt_000...\",\"type\":\"ping\",\"createdAt\":\"...\",\"data\":{\"webhookId\":\"whk_...\"}}"
}
```

`sentPayload` is the exact JSON string that was signed and POSTed. This is critical: the consumer needs the byte-identical string to verify, not a parsed-and-re-serialized version. Return it as a string, not a nested object.

**On failure:** When `success` is false (target returned non-2xx or was unreachable), still include the signature fields. The consumer may want to verify signing works even if delivery failed. The signature was computed before the HTTP call, so it is always available.

**Naming alternatives considered and rejected:**
- `signature` / `timestamp` -- too generic, could be confused with the event's own fields
- `sentHeaders` (nested object) -- over-engineering for two fields
- `hmacSignature` / `hmacTimestamp` -- implementation detail leaking into API surface

#### 3. Finding #11: X-WRL-Delivery header on pings

Set it to the fixed `evt_00000000000000000000000000000000` ID that is already used in the ping payload. Omitting the header creates an inconsistency (live events always have it, pings do not), which makes consumer verification code branch unnecessarily. Using the fixed ID keeps the header present and predictable.

### Proposed Tasks

**Task 1: Add artifact URLs to `capture.complete` payload**
- File: `src/webhook-dispatch.js`, `buildWebhookPayload()` function
- Add `data.artifacts` object with `screenshot`, `html`, `headers` URLs using `${base}/v1/captures/${captureRecord.captureId}/artifacts/${type}`
- Only in the `capture.complete` branch (line 113-127)
- Update the comment on lines 87-88 to reflect the new inclusion
- Dependencies: None
- Deliverable: Updated function, passing tests

**Task 2: Echo signature fields in ping response**
- File: `src/webhooks.js`, `handlePingWebhook()` function (lines 273-338)
- Add `signatureHeader`, `timestampHeader`, and `sentPayload` to both success and failure response paths
- Set `X-WRL-Delivery` header to the fixed event ID on the outbound ping request (line 301-309)
- Dependencies: None
- Deliverable: Updated function, passing tests

**Task 3: Documentation corrections (findings 3-10)**
- File: `site/content/webhooks.md`
- Fix `data.id` -> `data.captureId` in all examples
- Remove `data.createdAt` and `renderQuality` from examples
- Add `verificationUrl` to `capture.failed` example
- Add `changeDetection` documentation for `capture.complete`
- Document `capture.quarantined` event type (or document that it exists but is not yet stable -- check with product intent)
- Document `updatedAt` in list response example
- Fix "exponential backoff" label
- Add `signatureHeader`, `timestampHeader`, `sentPayload` to ping response example
- Dependencies: Tasks 1 and 2 (final payload shapes must be settled first)
- Deliverable: Updated docs matching actual code behavior

**Task 4: Tests**
- Verify `buildWebhookPayload()` for `capture.complete` includes `artifacts` with correct URLs
- Verify `buildWebhookPayload()` for `capture.failed` does NOT include `artifacts`
- Verify ping response includes `signatureHeader`, `timestampHeader`, `sentPayload`
- Verify `sentPayload` can be used with `signatureHeader` and `timestampHeader` to pass signature verification
- Dependencies: Tasks 1 and 2
- Deliverable: New/updated test cases in `test/webhook-dispatch.test.js` and `test/webhooks.test.js`

### Risks and Concerns

1. **Backward compatibility of `capture.complete` payload:** Adding `artifacts` is an additive change (new field in an existing object). This is safe -- no existing consumer will break. However, consumers who parse strictly (reject unknown fields) may need warning. The docs should mention this addition as a new field.

2. **`sentPayload` as a string, not object:** This is intentional and load-bearing. If `sentPayload` were returned as a parsed JSON object, the consumer would need to re-serialize it to verify the signature, and re-serialization is not guaranteed to produce the same byte string. Returning it as a raw string ensures byte-identical verification. The implementation must use the `pingPayload` variable directly (line 286), not re-parse it.

3. **`capture.quarantined` decision (finding #4):** The issue says "document or remove." This is a product decision, not an API design decision. If quarantine is a real feature path, document it minimally ("this event type exists but the payload shape may change"). If it is dead code, remove it from `VALID_EVENTS`. Either way, do not leave it silently accepted but undocumented.

4. **Artifact URL availability assumption:** The payload promises three artifact URLs, but does every `capture.complete` actually have all three? If a capture was configured without screenshot capture, the URL would 404. Two options:
   - Only include artifacts that actually exist in the capture record (check `captureRecord.artifacts`)
   - Always include all three (the URLs are valid routes; the consumer gets a 404 for missing ones)

   I recommend: always include all three. The URLs are deterministic and auth-free (per `index.js:600`). A 404 is a clear signal. Conditionally including them forces consumers to handle presence/absence, which is worse ergonomics.

5. **`env.VERIFICATION_BASE_URL` usage:** The artifact URLs will use the same `base` variable as `verificationUrl`. If `VERIFICATION_BASE_URL` is misconfigured or unset in some environment, both verification and artifact URLs break together. This is existing risk, not new risk.

### Additional Agents Needed

None -- this is a straightforward code + docs alignment task. The security aspects (HMAC signing, no secret leakage) are already handled by the existing implementation. No new auth flows, no schema spec files, no MCP changes.
