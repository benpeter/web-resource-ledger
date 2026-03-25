# Decisions — Phase 0081: Webhook Docs & Payload Fixes

## D1: Flat vs Nested Signature Echo in Ping Response

**Chosen**: Flat fields (`signatureHeader`, `timestampHeader`, `sentPayload`)
**Over**: Nested `signature` object (ux-strategy-minion proposal)
**Why**: KISS — the existing ping response is a flat object (`success`, `httpStatus`,
`latencyMs`). Adding a nested object for three fields creates inconsistency.
api-design-minion argued flat fields match the existing response shape and are
simpler to destructure.

## D2: Artifact URLs Always Present (Not Conditional)

**Chosen**: Always include all three artifact URLs (screenshot, html, headers)
in `capture.complete` regardless of what was actually stored
**Over**: Only include URLs for artifacts that exist in R2
**Why**: Consumers can try the URL and get a 404 if missing. This is simpler than
conditional field presence which forces consumers to check `if (data.artifacts?.screenshot)`
before using the URL. The artifact types are fixed (not extensible), so always
including all three is predictable and stable.

## D3: `sentPayload` as Raw String

**Chosen**: Echo `sentPayload` as the raw JSON string (not a parsed object)
**Over**: Parsed JSON object in the response
**Why**: The whole point is that consumers need the exact bytes to verify the HMAC
signature. If the server re-serialized the payload, key ordering or whitespace
might differ, causing verification to fail. The raw string is the signing input.

## D4: Document `capture.quarantined` (Not Remove)

**Chosen**: Fully document the quarantined event type with its own docs section
**Over**: Remove from `VALID_EVENTS` since undocumented
**Why**: The code path exists, it's in `VALID_EVENTS`, `buildWebhookPayload()`
handles it with `quarantineReason` and `quarantinedAt`. Removing working
functionality to avoid documenting it violates "more code, less blah blah."

## D5: Retry Schedule Label

**Chosen**: "a fixed schedule of increasing delays (60s, 300s, 900s)"
**Over**: "exponential backoff" (previous docs wording)
**Why**: The retry intervals are [60, 300, 900] — a fixed array, not computed
exponential values. Calling this "exponential" is technically inaccurate and
sets the wrong expectation for consumers implementing retry logic.

## D6: Ping Event ID — Set Fixed Value Instead of Null

**Chosen**: Set `X-WRL-Delivery: evt_00000000000000000000000000000000` on pings
**Over**: Omit the header (code was sending `null`)
**Why**: The all-zeros ID matches the `id` field in the ping payload body. A null
header value is confusing — consumers parsing the signature header alongside
delivery ID would get an unexpected `null`. The sentinel value is self-documenting.

## D7: diffUrl Pattern in changeDetection

**Chosen**: `{base}/v1/captures/{previousCaptureId}/diff/{currentCaptureId}`
**Why**: Matches the actual code in `buildWebhookPayload()` which uses
`captureRecord.changeSummary.previousCaptureId` as the base and current
`captureId` as the comparison target. Lucy caught this during Task 3 review.
