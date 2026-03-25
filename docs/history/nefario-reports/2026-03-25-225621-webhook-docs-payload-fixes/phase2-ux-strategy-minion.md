## Domain Plan Contribution: ux-strategy-minion

### Recommendations

**The core JTBD**: "When I just registered a webhook, I want to confirm my signature verification code works, so I can trust that live events will be processed correctly."

The current ping response (`{success, httpStatus, latencyMs}`) answers "did my server respond?" but not "did my server verify the signature correctly?" These are two different jobs. The developer must currently cross-reference their server logs with the ping call to debug verification failures -- that is a second system, a context switch, and often a different team's infrastructure.

**What to echo back in the ping response -- and what NOT to:**

1. **Echo the exact signature header value** (`t=...,v1=...`). This is the single highest-value addition. A developer whose verification fails can take this value, feed it into their verification function locally (with their stored secret and the known ping payload), and isolate whether the bug is in their header parsing, HMAC computation, or body handling. Without it, they are debugging blind.

2. **Echo the timestamp** as a discrete field (not just embedded in the signature string). Timestamp comparison is the most common silent failure -- the 300-second staleness window means a developer's clock skew or timezone misunderstanding causes a pass-then-fail pattern that is maddening to debug. Surfacing the exact timestamp WRL used lets them compare directly.

3. **Echo the raw payload that was signed** (the JSON body sent to the target). This eliminates the other major verification failure mode: the developer's framework parses and re-serializes the body before passing it to HMAC, changing whitespace or field order. If they can see the exact bytes WRL signed, they can diff against what their endpoint received.

4. **Do NOT echo the delivery ID or event header**. These are not signature-relevant and add noise. The developer does not need them to debug verification. Keep the response minimal.

5. **Do NOT echo the secret or any derivative of it**. This should be obvious, but the boundary must be explicit in the implementation spec.

**Proposed response shape:**

```json
{
  "success": true,
  "httpStatus": 200,
  "latencyMs": 142,
  "signature": {
    "header": "t=1711108800,v1=a1b2c3d4...",
    "timestamp": 1711108800,
    "payload": "{\"id\":\"evt_00000000000000000000000000000000\",\"type\":\"ping\",\"createdAt\":\"...\",\"data\":{\"webhookId\":\"whk_...\"}}"
  }
}
```

**Why nest under `signature`**: Progressive disclosure. The top-level fields answer "did it work?" at a glance (the primary job for most pings). The `signature` object is there when the developer needs to debug verification (the secondary job). Scanning the response, the developer sees `success: true` first and only digs into `signature` when something is wrong. This also keeps backward compatibility clean -- existing consumers ignore new fields.

**Why `payload` as a string, not parsed JSON**: The entire point is to give the developer the exact bytes that were signed. If we parse it back to an object, the JSON serializer may reorder keys or change whitespace, which is the exact bug the developer is trying to diagnose. String-escaped JSON is ugly but correct. The docs should call this out explicitly.

**Why `timestamp` appears twice** (once in `header`, once as a discrete integer): The header value requires string parsing to extract the timestamp. Developers debugging clock-skew issues need to compare timestamps instantly. Giving them an integer they can subtract from `Date.now()/1000` in their console eliminates a parsing step during a frustrating debugging session. The cognitive cost of the redundancy is near zero (it is clearly the same value); the friction saved is real.

### Proposed Tasks

1. **Add `signature` object to ping response** -- nest `header`, `timestamp`, and `payload` (as raw JSON string) under a `signature` key. Keep existing top-level fields unchanged for backward compatibility.

2. **Document the ping response signature fields** in the webhooks docs Testing section. Add a "Debugging signature verification" subsection showing how to use the echoed values: take `signature.payload` and `signature.timestamp`, combine as `{timestamp}.{payload}`, HMAC with your secret, compare to the `v1=` value from `signature.header`.

3. **Add the missing `X-WRL-Delivery` header to the ping request itself** (the request sent to the target). The ping currently omits this header, but real dispatches include it. This discrepancy means a developer's endpoint that validates required headers will reject pings but accept live events -- or vice versa. The ping should match the real dispatch shape exactly (using the zeroed-out event ID already in the payload).

4. **Add a "Ping response" subsection to the Troubleshooting section** with a worked example: "If your endpoint returns 200 but verification fails, compare these three values..."

### Risks and Concerns

**Payload echo size**: The ping payload is small (fixed structure, ~150 bytes). Echoing it as a string adds negligible response size. For real event payloads this would be a concern, but pings are synthetic and controlled -- no risk here.

**Security of echoing the signature**: The signature is computed from a secret the caller already possesses (they registered the webhook). Echoing the signature in the API response to the same authenticated caller reveals nothing they could not compute themselves. This is safe.

**Backward compatibility**: Adding new fields to a JSON response is non-breaking for any well-behaved client. Nesting under `signature` further isolates the change. No existing integration should break.

**Staleness window trap**: The echoed timestamp will be "fresh" when the ping response arrives, but if a developer saves it and replays it later for testing, it will be stale. The docs should note that the signature values are valid only within the 300-second window -- do not hardcode them into test fixtures.

### Additional Agents Needed

- **Implementation agent** to modify `handlePingWebhook` in `src/webhooks.js` -- the change is small (capture the values already computed on lines 285-293, include them in the response on line 337).
- **Docs agent** to update `site/content/webhooks.md` Testing and Troubleshooting sections with the new response shape, worked debugging example, and the staleness caveat.
- No additional UX review needed -- this is a straightforward "show me what you computed" transparency pattern.
