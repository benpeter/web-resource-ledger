## Gru Review — API Surface Consistency

**Verdict: APPROVE**

Reviewed against the live source code in `src/webhook-dispatch.js` and `src/webhooks.js`.

### Field naming patterns

All new fields are camelCase, consistent with every existing field in the codebase (`captureId`, `completedAt`, `verificationUrl`, `quarantineReason`, `webhookId`). No issues.

### Artifact URL keys (`screenshot`, `html`, `headers`)

The choice of plain keys over suffixed keys (`screenshotUrl` etc.) is consistent with the existing docs pattern already in `site/content/webhooks.md` lines 72-76. The `artifacts` object is semantically typed as "map of artifact type to URL" — the context makes the value type unambiguous. Consistent with the KISS principle applied elsewhere in this codebase.

### Artifact URL construction pattern

The plan reuses the `base` variable already computed at lines 101-103 of `webhook-dispatch.js` for `verificationUrl`. The URL pattern `/v1/captures/{captureId}/artifacts/{type}` is parallel to the existing `/v1/verify/{captureId}` and `/v1/captures/{prev}/diff/{current}` patterns already in the payload builder. Consistent.

### Flat signature echo in ping response

The existing ping response is flat: `{ success, httpStatus, latencyMs }` and `{ success: false, httpStatus: null, latencyMs, detail }`. Adding `signatureHeader`, `timestampHeader`, `sentPayload` as flat siblings is exactly the right call — it extends the existing flat shape rather than introducing a nested object to a six-field diagnostic response. Flat destructuring is simpler for consumers. Field names are camelCase and unambiguous.

### One observation (not a blocker)

The failure path response has `detail` as a field but the success path does not. The new fields are added to both paths symmetrically, which is correct. The asymmetry of `detail` is pre-existing and not introduced by this plan.

### Summary

All naming, nesting, and URL construction decisions are internally consistent and aligned with the established surface. No changes required.
