# user-docs-minion Review

**Verdict: ADVISE**

The docs examples are correct on field presence and names. Two issues worth noting before execution — neither blocks, but one should be addressed.

---

## Issue 1 (ADVISE — fix before shipping): `capture.failed` example places `verificationUrl` last

**What the code does**: `verificationUrl` is set on the base `data` object at line 110 of `webhook-dispatch.js`, before the event-type branch. So in the serialized output, the actual key order is:

```
captureId, status, url, verificationUrl, failedAt, error, retryable
```

**What the docs example shows** (Fix 3):

```
captureId, status, url, failedAt, error, retryable, verificationUrl
```

JSON consumers must not rely on key order, so this is not a contract bug. But it is misleading: a developer reading the docs alongside the code will see a discrepancy and wonder if something is wrong. The `capture.complete` example has the same ordering issue (`completedAt` shown before `verificationUrl`; code puts `verificationUrl` first).

**Recommendation**: Reorder both examples to match actual serialization order. This costs one minute and prevents confusion for developers who verify examples against real payloads.

---

## Issue 2 (ADVISE — low priority): `capture.complete` example is missing `changeDetection: null` note

The primary `capture.complete` example omits `changeDetection` entirely, which is correct — it is conditional. Fix 2 adds it as a subsection. The subsection correctly explains it as conditional. No action needed, but make sure the introductory text for the `capture.complete` section explicitly says changeDetection is absent when there is no prior capture, so users do not assume it is always present and silently ignore it.

---

## Verified correct

- All field names match code: `captureId` (not `id`), `verificationUrl` (not `verifyUrl`), `failedAt`, `quarantineReason`, `quarantinedAt`, `signatureHeader`, `timestampHeader`, `sentPayload` — all correct.
- `capture.complete` base data fields: `captureId`, `status`, `url`, `verificationUrl`, `completedAt` — correct.
- `capture.failed` base data fields: `captureId`, `status`, `url`, `verificationUrl`, `failedAt`, `error` (conditional on truthiness), `retryable` — the docs example shows `error` as present, which is fine for an example with a non-empty error value.
- `capture.quarantined` fields: `captureId`, `status`, `url`, `verificationUrl`, `quarantineReason`, `quarantinedAt` — correct, matches lines 133–136.
- `artifacts` object keys: `screenshot`, `html`, `headers` with URL string values — correct per synthesis decision and Task 1 spec.
- List response fields: `id`, `url`, `events`, `name`, `active`, `createdAt`, `updatedAt` — correct per lines 196–204. Adding `updatedAt` in Fix 6 is the right change.
- Ping response shape: `success`, `httpStatus`, `latencyMs`, `signatureHeader`, `timestampHeader`, `sentPayload` — matches Task 2 spec. Failure path adds `detail`. Correct.
- `sentPayload` reconstruction formula `{timestampHeader}.{sentPayload}` — confirmed against `webhook-signing.js` line 49: `${timestamp}.${body}`. Correct.
- Retry description fix ("fixed schedule" not "exponential backoff") — confirmed against `webhookRetryDelay()` schedule `[60, 300, 900]`.
- `X-WRL-Delivery` header name — confirmed against `webhook-dispatch.js` line 322.
