## Delegation Plan

**Team name**: webhook-docs-payload-fixes
**Description**: Fix webhook documentation-vs-code discrepancies (issue #212), add artifact URLs to capture.complete payload, and echo signature fields in ping response for end-to-end verification testing.

### Conflict Resolution: Flat vs. Nested Signature Fields in Ping Response

**Chosen**: Flat fields (`signatureHeader`, `timestampHeader`, `sentPayload`) as siblings of `success`/`httpStatus`/`latencyMs`.
**Over**: Nested `signature` object (`signature: { header, timestamp, payload }`) proposed by ux-strategy-minion.
**Why**: The ping response is a diagnostic object, not a domain entity. The existing response is already flat (`success`, `httpStatus`, `latencyMs`). Adding a nested object breaks the pattern for two fields plus a string. Flat fields are simpler to destructure in every language. The "progressive disclosure" argument for nesting does not apply here -- the response is already small enough to scan in one glance. The ux-strategy-minion's concern about separating "did it work?" from "how to verify?" is valid conceptually but does not justify adding structure to a 6-field object. This aligns with the project's KISS philosophy.

### Conflict Resolution: Artifact URL Field Names

**Chosen**: Plain keys (`screenshot`, `html`, `headers`) with URL string values, matching the docs' existing pattern at lines 72-76.
**Over**: Suffixed keys (`screenshotUrl`, `htmlUrl`, `headersUrl`) proposed by test-minion.
**Why**: The existing docs already show `"screenshot": "https://..."` etc. The `artifacts` object is semantically "a map of artifact type to URL" -- the context makes the value type obvious. Suffixed names add noise. The API design principle from the Helix Manifesto: "Intuitive, Simple & Consistent."

### Task 1: Add artifact URLs to `capture.complete` payload
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are modifying `src/webhook-dispatch.js` in the WRL project to add artifact URLs to the `capture.complete` webhook payload. This addresses GitHub issue #212.

    ## What to do

    In the `buildWebhookPayload()` function (line 95), inside the `if (eventType === 'capture.complete')` block (line 113), add an `artifacts` object to the `data` object with three URL entries:

    ```js
    if (eventType === 'capture.complete') {
      data.completedAt = captureRecord.completedAt;
      data.artifacts = {
        screenshot: `${base}/v1/captures/${captureRecord.captureId}/artifacts/screenshot`,
        html: `${base}/v1/captures/${captureRecord.captureId}/artifacts/html`,
        headers: `${base}/v1/captures/${captureRecord.captureId}/artifacts/headers`,
      };
      // ... existing changeDetection block stays as-is
    }
    ```

    The `base` variable is already computed on lines 101-103 and used for `verificationUrl`. Reuse it.

    Also update the comment block at lines 84-88. Change:
    ```
     *   capture.complete: captureId, status, url, completedAt, verificationUrl
    ```
    to:
    ```
     *   capture.complete: captureId, status, url, completedAt, verificationUrl, artifacts
    ```

    And change:
    ```
     * Fields NEVER included: R2 keys, render metadata, hashed IPs, attempt count,
     * internal service names, artifacts paths.
    ```
    to:
    ```
     * Fields NEVER included: R2 keys, render metadata, hashed IPs, attempt count,
     * internal service names.
    ```

    Always include all three artifact types (screenshot, html, headers) regardless of what the capture actually produced. The URLs are deterministic routes that return 404 for missing artifacts -- this is better ergonomics than conditional presence.

    ## What NOT to do
    - Do NOT add artifacts to `capture.failed` or `capture.quarantined` payloads
    - Do NOT include `screenshot-before` or `wacz` artifact types
    - Do NOT modify any other function in this file
    - Do NOT touch any other files

    ## Files
    - Edit: `src/webhook-dispatch.js`

    ## Success criteria
    - `buildWebhookPayload('capture.complete', record, env)` returns JSON with `data.artifacts.screenshot`, `data.artifacts.html`, `data.artifacts.headers` as full URLs
    - URLs follow the pattern `{base}/v1/captures/{captureId}/artifacts/{type}`
    - `capture.failed` and `capture.quarantined` payloads remain unchanged (no `artifacts` key)
    - Existing tests still pass (run `npx vitest run test/webhook-dispatch.test.js`)
- **Deliverables**: Updated `src/webhook-dispatch.js` with artifact URLs in capture.complete payload
- **Success criteria**: Artifacts object present only on capture.complete, URLs use base variable, existing tests pass

### Task 2: Echo signature fields in ping response and add X-WRL-Delivery header
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are modifying `src/webhooks.js` in the WRL project to echo signature fields in the ping response and add the missing `X-WRL-Delivery` header. This addresses GitHub issue #212.

    ## What to do

    ### 2a: Add X-WRL-Delivery header to ping request

    In `handlePingWebhook()` (line 273), the fetch call at line 301 sends headers but omits `X-WRL-Delivery`. Add it using the fixed ping event ID:

    ```js
    const resp = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WRL-Webhook/1.0',
        'X-WRL-Event': 'ping',
        'X-WRL-Delivery': 'evt_00000000000000000000000000000000',  // ADD THIS
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: `t=${timestamp},v1=${signature}`,
      },
      body: pingPayload,
      signal: AbortSignal.timeout(5000),
    });
    ```

    This ensures pings send the same headers as real dispatches (see `handleWebhookMessage` in webhook-dispatch.js line 322 for comparison). The fixed ID matches the one already used in the ping payload body.

    ### 2b: Echo signature fields in ping response

    Add three fields to the ping response: `signatureHeader`, `timestampHeader`, and `sentPayload`. These let callers verify their signature verification code end-to-end.

    The values are already computed before the fetch call:
    - `signatureHeader` = the full `t={timestamp},v1={signature}` string (line 308 pattern)
    - `timestampHeader` = `String(timestamp)` (the value sent in X-WRL-Timestamp)
    - `sentPayload` = `pingPayload` variable (the raw JSON string, NOT parsed)

    Update both response paths:

    **Success path (line 337):**
    ```js
    return jsonResponse({
      success,
      httpStatus,
      latencyMs,
      signatureHeader: `t=${timestamp},v1=${signature}`,
      timestampHeader: String(timestamp),
      sentPayload: pingPayload,
    });
    ```

    **Failure path (line 335):**
    ```js
    return jsonResponse({
      success: false,
      httpStatus: null,
      latencyMs,
      detail,
      signatureHeader: `t=${timestamp},v1=${signature}`,
      timestampHeader: String(timestamp),
      sentPayload: pingPayload,
    });
    ```

    CRITICAL: `sentPayload` MUST be the `pingPayload` variable (a string). Do NOT parse and re-serialize it. The consumer needs the exact bytes that were signed to verify the HMAC. `JSON.stringify(JSON.parse(pingPayload))` may reorder keys.

    ## What NOT to do
    - Do NOT modify any other handler functions in webhooks.js
    - Do NOT add any new imports
    - Do NOT touch webhook-dispatch.js
    - Do NOT echo the webhook secret or any derivative of it

    ## Files
    - Edit: `src/webhooks.js`

    ## Success criteria
    - Ping response JSON includes `signatureHeader`, `timestampHeader`, `sentPayload` on both success and failure paths
    - `signatureHeader` matches the pattern `t=\d+,v1=[a-f0-9]{64}`
    - `sentPayload` is a string (not a parsed object)
    - `X-WRL-Delivery` header is sent on the outbound ping request
    - Existing tests still pass (run `npx vitest run test/webhook-crud.test.js`)
- **Deliverables**: Updated `src/webhooks.js` with signature echo fields and X-WRL-Delivery header
- **Success criteria**: All three signature fields present in both response paths, X-WRL-Delivery header added

### Task 3: Fix webhook documentation to match code behavior
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: yes
- **Gate reason**: Documentation is the user-facing contract. The combined docs changes touch every example in the file, add a new event type section, and rewrite the ping response. Incorrect docs mislead consumers. User should review the final shape before it ships.
- **Gate rationale**: |
    Chosen: Comprehensive single-pass documentation update covering all 11 findings from issue #212
    Over: Incremental updates per-finding (would require multiple review passes and risk inconsistency between examples)
    Why: All findings are in one file, interdependent (e.g., field name fixes affect multiple examples), and small enough to review as a unit
- **Prompt**: |
    You are updating `site/content/webhooks.md` in the WRL project to fix all documentation-vs-code discrepancies identified in GitHub issue #212. Tasks 1 and 2 have already modified the code -- this task aligns the docs to the now-correct code.

    ## What to do

    Apply ALL of the following changes to `site/content/webhooks.md`. Read the current file first.

    ### Fix 1: `capture.complete` example (lines 60-80)

    Replace the entire JSON block with the correct payload shape. The code in `src/webhook-dispatch.js` `buildWebhookPayload()` produces:

    ```json
    {
      "id": "evt_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "type": "capture.complete",
      "createdAt": "2026-03-22T12:05:00.000Z",
      "data": {
        "captureId": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
        "status": "complete",
        "url": "https://example.com",
        "completedAt": "2026-03-22T12:05:00.312Z",
        "verificationUrl": "https://api.webresourceledger.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
        "artifacts": {
          "screenshot": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot",
          "html": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html",
          "headers": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers"
        }
      }
    }
    ```

    Changes from current docs:
    - `data.id` -> `data.captureId` (code uses `captureId`)
    - Remove `data.createdAt` (not sent by code)
    - Remove `renderQuality` (not sent by code)
    - `verifyUrl` -> `verificationUrl` (code uses `verificationUrl`)
    - `artifacts` object stays but with correct URL pattern (Task 1 now adds these to the code)

    ### Fix 2: Add change detection subsection

    After the `capture.complete` JSON example, add:

    ```markdown
    #### Change detection (conditional)

    When a previous capture exists for the same URL, the payload includes a `changeDetection` object:

    ```json
    {
      "id": "evt_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "type": "capture.complete",
      "createdAt": "2026-03-22T12:05:00.000Z",
      "data": {
        "captureId": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
        "status": "complete",
        "url": "https://example.com",
        "completedAt": "2026-03-22T12:05:00.312Z",
        "verificationUrl": "https://api.webresourceledger.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
        "artifacts": {
          "screenshot": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot",
          "html": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html",
          "headers": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers"
        },
        "changeDetection": {
          "changed": true,
          "previousCaptureId": "cap_f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3",
          "diffUrl": "https://api.webresourceledger.com/v1/captures/cap_f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3/diff/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
          "summary": {
            "htmlChanged": true,
            "screenshotChanged": true,
            "headersChanged": false
          }
        }
      }
    }
    ```

    This is progressive disclosure: the primary example stays clean for the common case, change detection is shown separately for users who need it.

    ### Fix 3: `capture.failed` example (lines 86-101)

    Replace the JSON block:

    ```json
    {
      "id": "evt_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
      "type": "capture.failed",
      "createdAt": "2026-03-22T12:05:10.000Z",
      "data": {
        "captureId": "cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
        "status": "failed",
        "url": "https://example.com/missing-page",
        "failedAt": "2026-03-22T12:05:10.000Z",
        "error": "Navigation timeout after 30000ms",
        "retryable": true,
        "verificationUrl": "https://api.webresourceledger.com/v1/verify/cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7"
      }
    }
    ```

    Changes: `data.id` -> `data.captureId`, remove `data.createdAt`, add `verificationUrl` (code sends it for all event types).

    ### Fix 4: Add `capture.quarantined` section

    After the `capture.failed` section, add:

    ```markdown
    ### `capture.quarantined`

    Fired when a capture is flagged for review due to content policy or safety concerns. Artifacts may be partial or inaccessible.

    ```json
    {
      "id": "evt_c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
      "type": "capture.quarantined",
      "createdAt": "2026-03-22T12:06:00.000Z",
      "data": {
        "captureId": "cap_c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
        "status": "quarantined",
        "url": "https://example.com/flagged-page",
        "quarantineReason": "content_policy",
        "quarantinedAt": "2026-03-22T12:06:00.000Z",
        "verificationUrl": "https://api.webresourceledger.com/v1/verify/cap_c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8"
      }
    }
    ```

    Keep it brief. The code path exists in `buildWebhookPayload()` (line 133-136) and `capture.quarantined` is in VALID_EVENTS.

    ### Fix 5: Retry behavior label (line 221)

    Change:
    ```
    If your endpoint does not return a 2xx response, WRL retries with exponential backoff:
    ```
    To:
    ```
    If your endpoint does not return a 2xx response, WRL retries with a fixed schedule of increasing delays:
    ```

    The delays are `[60, 300, 900]` -- a predetermined constant array, not an exponential formula.

    ### Fix 6: List response example (around line 267-278)

    Add `updatedAt` to the list response JSON example. The code (webhooks.js line 203) explicitly includes `updatedAt` in the list mapping. Add it after `createdAt`:

    ```json
    "createdAt": "2026-03-22T12:00:00.000Z",
    "updatedAt": "2026-03-22T12:00:00.000Z",
    "active": true
    ```

    ### Fix 7: Ping response example (lines 245-251)

    Replace the ping response JSON block with the new shape (Task 2 added these fields):

    ```json
    {
      "success": true,
      "httpStatus": 200,
      "latencyMs": 142,
      "signatureHeader": "t=1711108800,v1=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a1b2c3d4e5f6a7b8c9d0e1f2a3b4",
      "timestampHeader": "1711108800",
      "sentPayload": "{\"id\":\"evt_00000000000000000000000000000000\",\"type\":\"ping\",\"createdAt\":\"2026-03-22T12:00:00.000Z\",\"data\":{\"webhookId\":\"whk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6\"}}"
    }
    ```

    Update the paragraph below the example to explain the new fields:

    "The ping sends a synthetic event with `type: "ping"` signed with your webhook secret. The response includes `signatureHeader`, `timestampHeader`, and `sentPayload` so you can verify your signature verification logic end-to-end: take `sentPayload` and `timestampHeader`, combine as `{timestampHeader}.{sentPayload}`, HMAC-SHA256 with your hex-decoded secret, and compare to the `v1=` value in `signatureHeader`. A ping failure (non-2xx response from your endpoint) does not affect webhook active status -- it is informational only."

    ### Fix 8: Add signature verification debugging to Troubleshooting

    Add a new troubleshooting entry after the existing signature verification one:

    ```markdown
    **Ping succeeds but signature verification fails in my handler.**

    Use the `signatureHeader`, `timestampHeader`, and `sentPayload` fields from the ping response to isolate the issue:

    1. Check that `sentPayload` matches the raw body your endpoint received (byte-for-byte). If your framework parses and re-serializes JSON, the body will differ.
    2. Verify `timestampHeader` matches the `t=` value in `signatureHeader`.
    3. Reconstruct the signed payload as `{timestampHeader}.{sentPayload}` and HMAC-SHA256 it with your hex-decoded secret. The result should match the `v1=` value.

    Note: The signature values in the ping response are valid only within the 300-second staleness window. Do not save them as permanent test fixtures.
    ```

    ### Fix 9: Update registration example events array

    In the registration example (line 28), add `capture.quarantined` as a comment or note. Either update the example's events array to show all three:
    ```json
    "events": ["capture.complete", "capture.failed", "capture.quarantined"],
    ```
    Or add a note below the example listing all valid event types. Choose whichever fits better with the existing tone.

    ## What NOT to do
    - Do NOT change any code files
    - Do NOT modify the Verifying signatures section's code examples (Node.js/Python) -- they are correct
    - Do NOT add collapsible/accordion elements
    - Do NOT restructure the document's overall heading hierarchy

    ## Files
    - Edit: `site/content/webhooks.md`

    ## Success criteria
    - Every JSON example matches the actual code behavior in `src/webhook-dispatch.js` and `src/webhooks.js`
    - `capture.quarantined` has its own section with payload example
    - `changeDetection` shown as a conditional sub-example under `capture.complete`
    - Retry label says "fixed schedule" not "exponential backoff"
    - List response includes `updatedAt`
    - Ping response shows all signature echo fields
    - Troubleshooting has a signature debugging entry using ping response fields
- **Deliverables**: Updated `site/content/webhooks.md` with all corrections
- **Success criteria**: All JSON examples match actual code output, all event types documented, retry label correct

### Task 4: Add tests for artifact URLs and ping signature echo
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    You are adding tests for two new features in the WRL webhook system (GitHub issue #212): artifact URLs in capture.complete payload and signature echo in ping response.

    ## What to do

    ### 4a: Artifact URL tests in `test/webhook-dispatch.test.js`

    Add to the existing `describe('buildWebhookPayload')` block, after the existing `verificationUrl` tests (around line 198). Follow the exact pattern of the existing tests (import `buildWebhookPayload`, call with `makeCaptureRecord()`, parse JSON, assert on fields).

    Add these tests:

    ```js
    it('capture.complete payload includes artifacts with screenshot, html, headers URLs', () => {
      const record = makeCaptureRecord({ status: 'complete', completedAt: '2024-01-01T00:00:00.000Z' });
      const parsed = JSON.parse(buildWebhookPayload('capture.complete', record, {}));
      expect(parsed.data.artifacts).toBeDefined();
      expect(parsed.data.artifacts.screenshot).toContain(record.captureId);
      expect(parsed.data.artifacts.screenshot).toContain('/artifacts/screenshot');
      expect(parsed.data.artifacts.html).toContain(record.captureId);
      expect(parsed.data.artifacts.html).toContain('/artifacts/html');
      expect(parsed.data.artifacts.headers).toContain(record.captureId);
      expect(parsed.data.artifacts.headers).toContain('/artifacts/headers');
    });

    it('capture.complete artifacts URLs use VERIFICATION_BASE_URL when set', () => {
      const record = makeCaptureRecord({ status: 'complete', completedAt: '2024-01-01T00:00:00.000Z' });
      const parsed = JSON.parse(buildWebhookPayload('capture.complete', record, { VERIFICATION_BASE_URL: 'https://custom.example.com' }));
      expect(parsed.data.artifacts.screenshot).toMatch(/^https:\/\/custom\.example\.com/);
      expect(parsed.data.artifacts.html).toMatch(/^https:\/\/custom\.example\.com/);
      expect(parsed.data.artifacts.headers).toMatch(/^https:\/\/custom\.example\.com/);
    });

    it('capture.failed payload does not include artifacts', () => {
      const record = makeCaptureRecord({ status: 'failed', failedAt: '2024-01-01T00:00:00.000Z', error: 'render_timeout', retryable: false });
      const parsed = JSON.parse(buildWebhookPayload('capture.failed', record, {}));
      expect(parsed.data.artifacts).toBeUndefined();
    });

    it('capture.quarantined payload does not include artifacts', () => {
      const record = makeCaptureRecord({ status: 'quarantined', quarantineReason: 'content_policy', quarantinedAt: '2024-01-01T00:00:00.000Z' });
      const parsed = JSON.parse(buildWebhookPayload('capture.quarantined', record, {}));
      expect(parsed.data.artifacts).toBeUndefined();
    });
    ```

    Key: assert URL **contains** captureId and artifact path, not exact URL string. This is resilient to base URL changes.

    ### 4b: Ping signature echo test in `test/webhook-crud.test.js`

    Add to the existing `describe('POST /v1/webhooks/:id/ping')` block, after the existing shape test (around line 382). Follow the existing pattern using `seedWebhook`, `ping()`, and `SELF.fetch`.

    ```js
    it('response includes signatureHeader, timestampHeader, and sentPayload for verification', async () => {
      const id = 'whk_' + 'b'.repeat(32);
      await seedWebhook(env.DB, id, { tenantId: 'default' });

      const res = await ping(id);
      expect(res.status).toBe(200);
      const body = await res.json();
      // Signature echo fields -- present regardless of whether delivery succeeded
      expect(typeof body.signatureHeader).toBe('string');
      expect(body.signatureHeader).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
      expect(typeof body.timestampHeader).toBe('string');
      expect(body.timestampHeader).toMatch(/^\d+$/);
      expect(typeof body.sentPayload).toBe('string');
      // sentPayload must be valid JSON (the ping event body)
      const payload = JSON.parse(body.sentPayload);
      expect(payload.type).toBe('ping');
      expect(payload.data.webhookId).toBe(id);
    });
    ```

    Note: The ping fetch will fail (TEST_WEBHOOK_URL is not real), but the handler returns signature fields on both success and failure paths. The existing test at line 369 already handles this -- the new test follows the same pattern.

    ### 4c: Run full test suite

    After writing the tests, run `npx vitest run` to confirm all tests pass (both new and existing).

    ## What NOT to do
    - Do NOT modify any source files (src/)
    - Do NOT add new test helpers or fixtures beyond what already exists
    - Do NOT add integration tests that require a real webhook endpoint
    - Do NOT duplicate existing test coverage

    ## Files
    - Edit: `test/webhook-dispatch.test.js`
    - Edit: `test/webhook-crud.test.js`

    ## Success criteria
    - 4 new tests in webhook-dispatch.test.js (3 artifact URL tests + 1 quarantined negative test)
    - 1 new test in webhook-crud.test.js (ping signature echo)
    - All existing tests continue to pass
    - `npx vitest run` exits 0
- **Deliverables**: New test cases in both test files, passing test suite
- **Success criteria**: All new tests pass, no regressions in existing tests

### Cross-Cutting Coverage

- **Testing**: Covered by Task 4 (test-minion). Artifact URL unit tests and ping signature echo integration test.
- **Security**: Not separately included. No new attack surface: artifact URLs are public deterministic routes (already auth-free per index.js:600), signature echo reveals nothing the authenticated caller cannot compute themselves, no secrets are echoed. The existing HMAC signing implementation is unchanged.
- **Usability -- Strategy**: Covered during planning (Phase 2 consultation). ux-strategy-minion's JTBD analysis drove the decision to include signature echo in ping response and influenced field naming. No further execution task needed.
- **Usability -- Design**: Not included. No UI components produced -- this is an API + docs change.
- **Documentation**: Covered by Task 3 (user-docs-minion). Comprehensive docs update covering all 11 findings from issue #212.
- **Observability**: Not included. No new runtime components. Existing webhook logging is unchanged.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - user-docs-minion: Task 3 is the highest-risk task (user-facing documentation contract). Documentation accuracy is the primary goal of issue #212.
    Review focus: verify all JSON examples in the updated docs match the actual code output field-for-field.
- **Not selected**:
  - ux-design-minion: No UI components produced.
  - accessibility-minion: No web-facing HTML/UI.
  - sitespeed-minion: No web-facing runtime code changes.
  - observability-minion: No new runtime components or logging changes.

### Decisions

- **Flat vs. nested signature echo**
  Chosen: Flat fields (`signatureHeader`, `timestampHeader`, `sentPayload`) as top-level siblings
  Over: Nested `signature` object (ux-strategy-minion) -- adds structural complexity to a 6-field diagnostic object
  Why: Matches existing flat response shape, simpler destructuring, KISS principle. The progressive disclosure argument does not justify nesting for two fields.

- **Artifact URL key names**
  Chosen: Plain keys (`screenshot`, `html`, `headers`)
  Over: Suffixed keys (`screenshotUrl`, `htmlUrl`, `headersUrl`) (test-minion)
  Why: Matches existing docs pattern, the `artifacts` object context makes value type obvious, less noise.

- **Always include all three artifact types**
  Chosen: Always include screenshot, html, headers URLs regardless of what the capture produced
  Over: Conditionally including only artifacts that exist (api-design-minion raised this option)
  Why: URLs are deterministic routes, 404 for missing artifacts is a clear signal, conditional presence forces consumers to handle presence/absence which is worse ergonomics.

- **`capture.quarantined` documentation**
  Chosen: Document as a full event type with payload example (user-docs-minion recommendation)
  Over: Document as "accepted but unstable" (api-design-minion's conservative option)
  Why: The code path exists, it is in VALID_EVENTS, and it has unique fields (quarantineReason, quarantinedAt). Users who subscribe to it need a reference. Brief section -- no more verbose than capture.failed.

### Risks and Mitigations

1. **`sentPayload` string integrity**: The ping response must return `pingPayload` as the raw string variable, not re-serialized. If the implementation accidentally does `JSON.stringify(JSON.parse(pingPayload))`, key order may change, breaking verification. **Mitigation**: Task 2 prompt explicitly warns about this. Phase 5 code review will catch it.

2. **`changeDetection.diffUrl` endpoint may not exist yet**: The payload builds a URL like `/v1/captures/{prev}/diff/{current}`. If this endpoint does not exist, the URL 404s. **Mitigation**: The docs show the URL as part of the payload (it is what the code sends). If the endpoint does not exist, that is a separate issue. The docs accurately reflect the payload.

3. **Backward compatibility**: Adding `artifacts` to capture.complete and new fields to ping response are additive (new fields in existing JSON). No existing consumer should break. Consumers with strict schema validation (reject unknown fields) may need warning. **Mitigation**: Low risk -- JSON APIs conventionally add fields.

4. **Staleness window trap**: Developers may save ping response signature values as test fixtures. They will expire after 300 seconds. **Mitigation**: Task 3 docs update includes a caveat about the staleness window.

### Execution Order

```
Batch 1 (parallel):
  Task 1: Artifact URLs in webhook-dispatch.js
  Task 2: Ping signature echo in webhooks.js

  [No gate -- additive code changes, low blast radius]

Batch 2 (parallel, blocked by Batch 1):
  Task 3: Documentation update          [APPROVAL GATE]
  Task 4: Tests for new functionality

  [Gate on Task 3 -- docs are the user-facing contract]

Post-execution:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (npx vitest run)
  Phase 8: Documentation assessment
```

### External Skills

No external skills used in this plan. The discovered ops-runbook skill is not relevant to docs/code alignment work.

### Verification Steps

1. `npx vitest run` -- all tests pass (old + new)
2. Manual review: read `site/content/webhooks.md` and confirm every JSON example field-for-field matches the output of `buildWebhookPayload()` and `handlePingWebhook()` in the source code
3. Verify `capture.quarantined` is documented with correct fields from code line 133-136
4. Verify ping response docs show `signatureHeader`, `timestampHeader`, `sentPayload`
5. Verify troubleshooting section includes ping-based signature debugging workflow
