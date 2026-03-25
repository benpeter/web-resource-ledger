## Security Review: webhook-docs-payload-fixes

### Verdict: APPROVE

### Summary

The plan makes two code changes and one documentation change. Neither code change introduces new attack surface. The artifact URLs in Task 1 are deterministic public routes already accessible without auth (confirmed in `src/index.js:600`). The signature echo in Task 2 exposes the HMAC output and timestamp -- not the secret -- and is scoped to callers who are already authenticated and own the webhook. No secrets are leaked. No injection vectors are introduced.

### Findings

#### LOW: `sentPayload` echoes the captured URL back to an authenticated caller

- **Location**: `src/webhooks.js` ping handler, `sentPayload` field
- **Description**: The ping payload body (`pingPayload`) contains `data.webhookId` and is returned verbatim in the response. This is benign for the ping case. However, the plan's comment at line 88 of webhook-dispatch.js currently says "artifacts paths" are never included; after Task 1 lands, the comment correctly drops that clause. No PII issue here -- the webhookId is the caller's own resource.
- **Impact**: None. The caller supplied the webhookId; receiving it back is not a disclosure.
- **Remediation**: No action required.

#### INFORMATIONAL: Artifact URLs are always emitted even when artifacts are absent

- **Location**: Task 1 implementation (`buildWebhookPayload`, capture.complete block)
- **Description**: All three artifact URLs are included unconditionally. A consumer fetching `artifacts.html` for a capture that failed mid-render will receive 404. This is an intentional design choice per the plan ("better ergonomics than conditional presence") and the endpoint authorization model is unchanged.
- **Impact**: No security impact. 404 responses do not leak internal R2 keys or render paths. The artifact endpoint strips internal storage references before responding.
- **Remediation**: No action required. Document that 404 means the artifact was not produced (Task 3 docs update covers this).

#### INFORMATIONAL: `signatureHeader` staleness window note in docs is correct

- **Location**: Task 3 docs, Fix 8 troubleshooting entry
- **Description**: The plan correctly notes that ping response signature values expire after 300 seconds. This caveat appears in the troubleshooting section. The implementation plan warns against `JSON.stringify(JSON.parse(pingPayload))` in the Task 2 prompt, which is the right defense for HMAC correctness.
- **Impact**: None. The staleness guard is already enforced by the existing signature verification logic.
- **Remediation**: No action required. The documentation caveat is appropriate.

### What Was Checked

1. **Artifact URL injection**: `captureId` is constrained to `cap_[a-f0-9]{32}` by route regex at `src/index.js:74`. The `base` variable derives from `env.VERIFICATION_BASE_URL` (operator-controlled) or a hardcoded default. No user-controlled input flows into URL construction.

2. **Secret exposure in ping response**: Task 2 echoes `signatureHeader` (the HMAC output, format `t={ts},v1={hex}`) and `timestampHeader`. The webhook `secret` itself is not included. The Task 2 prompt explicitly states "Do NOT echo the webhook secret or any derivative of it."

3. **Access control on signature echo**: `handlePingWebhook` calls `verifyApiKey` with `requiredScope: 'capture'` before any response fields are computed. Unauthenticated callers cannot reach the echo fields.

4. **Artifact endpoint authorization**: Confirmed public per `src/index.js:600`. Adding URLs to the payload does not change the access model -- those URLs were already reachable by anyone with a captureId. The webhook recipient is a trusted party who presumably received the captureId in the payload.

5. **SSRF via `webhook.url`**: The ping handler fetches `webhook.url` which was validated at registration time. No new fetch targets are introduced by this plan.

6. **Information disclosure via `data.url`**: The captured page URL was already present in the payload before this change. Not in scope for this plan.
