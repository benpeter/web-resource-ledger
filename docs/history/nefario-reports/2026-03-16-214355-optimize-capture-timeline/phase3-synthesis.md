# Phase 3: Synthesis -- Optimize Capture Pipeline (#79)

## Delegation Plan

**Team name**: capture-timeline-opt
**Description**: Reduce median capture time for CMP-absent pages by 5s+ via adaptive settle delay (500ms quiescence / 3s cap), consent timeout reduction (8s to 2s), and graceful consent failure degradation. Three changes in two source files plus tests and OpenAPI schema.

### Task 1: Implement adaptive settle, consent timeout reduction, and graceful consent failure

- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task

    Optimize the WRL capture pipeline timing in three areas: adaptive settle delay,
    consent timeout reduction, and graceful consent failure handling. All changes
    are in `src/capture.js`, `src/consent.js`, `test/capture.test.js`,
    `test/fixtures.js`, and `openapi.yaml`.

    Work in the worktree at:
    `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/optimize-capture-timeline`

    ## Context

    Current capture budget: 20s (goto) + 3s (settle) + 8s (consent) + 2s (post) = 33s worst-case.
    For CMP-absent pages, the 3s fixed settle and 8s consent timeout are pure waste.
    Goal: median capture time for CMP-absent pages drops by at least 5s.

    Issue #79 success criteria:
    - Consent timeout reduced from 8s to 2s; all existing consent tests pass
    - Autoconsent failures degrade to consentStatus:'failed'/'error' instead of crashing
    - Settle delay adapts to network activity with 3s cap; pages that settle faster proceed earlier
    - Median capture time for CMP-absent pages drops by at least 5s
    - adobe.com captures succeed (currently TypeError crashes renderer)

    ## Change 1: Adaptive Settle Delay (src/capture.js)

    Replace the fixed `setTimeout(r, SETTLE_DELAY_MS)` on line 459 with an adaptive
    `waitForSettle(page)` function that monitors in-flight HTTP requests.

    ### Constants

    Remove `SETTLE_DELAY_MS = 3000`. Add:
    ```js
    const SETTLE_MAX_MS = 3000;      // hard cap (same as current worst case)
    const SETTLE_QUIESCE_MS = 500;   // idle window before early exit
    ```

    ### New function: `waitForSettle(page)`

    Add as an internal helper (not exported). Implementation:

    1. Track in-flight request count via `page.on('request')`, `page.on('requestfinished')`,
       `page.on('requestfailed')` event listeners.
    2. Ignore `websocket` and `eventsource` resource types (they never fire `requestfinished`).
    3. When inflight drops to 0, start a 500ms quiescence timer. If a new request arrives,
       cancel the timer.
    4. Hard cap: `setTimeout(() => done('cap'), SETTLE_MAX_MS)` fires regardless.
    5. On resolution, clean up all listeners via `page.removeListener()`.
    6. Return `{ settledMs: number, settledBy: 'quiesce' | 'cap' }`.
    7. Use `Math.max(0, inflight - 1)` as an underflow guard for requests that started
       before the listener was attached.
    8. Kick off initial quiescence check immediately (page may already be idle at load).

    Use the debugger-minion's proposed code from the planning phase as reference,
    but write it fresh -- do not copy blindly. Key reference:

    ```js
    function waitForSettle(page) {
      return new Promise((resolve) => {
        const start = Date.now();
        let inflight = 0;
        let quiesceTimer = null;
        const IGNORED_TYPES = new Set(['websocket', 'eventsource']);

        const capTimer = setTimeout(() => done('cap'), SETTLE_MAX_MS);

        function done(reason) {
          clearTimeout(capTimer);
          clearTimeout(quiesceTimer);
          page.removeListener('request', onRequest);
          page.removeListener('requestfinished', onComplete);
          page.removeListener('requestfailed', onComplete);
          resolve({ settledMs: Date.now() - start, settledBy: reason });
        }

        function checkQuiesce() {
          if (inflight <= 0) {
            if (!quiesceTimer) {
              quiesceTimer = setTimeout(() => done('quiesce'), SETTLE_QUIESCE_MS);
            }
          } else {
            if (quiesceTimer) {
              clearTimeout(quiesceTimer);
              quiesceTimer = null;
            }
          }
        }

        function onRequest(req) {
          if (IGNORED_TYPES.has(req.resourceType())) return;
          inflight++;
          if (quiesceTimer) {
            clearTimeout(quiesceTimer);
            quiesceTimer = null;
          }
        }

        function onComplete(req) {
          if (IGNORED_TYPES.has(req.resourceType())) return;
          inflight = Math.max(0, inflight - 1);
          checkQuiesce();
        }

        page.on('request', onRequest);
        page.on('requestfinished', onComplete);
        page.on('requestfailed', onComplete);

        checkQuiesce(); // page may already be idle
      });
    }
    ```

    ### Integration

    Replace line 459:
    ```js
    // Before:
    await new Promise(r => setTimeout(r, SETTLE_DELAY_MS));

    // After:
    const settle = await waitForSettle(page);
    ```

    Update the comment on lines 457-458 to reflect adaptive behavior.

    ### Render metadata

    Extend the `render` object in the return value (around line 490) to include
    settle telemetry:
    ```js
    render: {
      waitUntilReached: 'load',
      timedOut: false,
      durationMs: Date.now() - renderStart,
      settleMs: settle.settledMs,       // NEW
      settleReason: settle.settledBy,   // NEW
    },
    ```

    ### Header comment update

    Update the budget comment in the file header (line 15) to reflect:
    `0.5-3s settle` instead of `3s settle` and `2s consent` instead of `8s consent`.

    ## Change 2: Consent Timeout Reduction (src/consent.js)

    Change `CONSENT_TIMEOUT_MS` from `8000` to `2000` on line 30.

    That is the only change in consent.js. The 2s timeout is sufficient because:
    - autoconsent detection typically completes in <500ms
    - the 8s budget was speculative (inherited from the original implementation)
    - the CMP detection retry count (5 retries at ~200ms polling intervals = ~1s) fits in 2s

    ## Change 3: Graceful Consent Failure (src/capture.js)

    Wrap the `dismissCookieConsent(page)` call on line 474 in a try/catch with
    selective error propagation.

    ### Implementation

    ```js
    // Replace line 474: const consent = await dismissCookieConsent(page);
    let consent;
    try {
      consent = await dismissCookieConsent(page);
    } catch (err) {
      // Browser death errors: re-throw -- subsequent page operations will also fail
      const msg = err?.message ?? '';
      if (
        msg.includes('Target closed') ||
        msg.includes('page was closed') ||
        msg.includes('browser has been closed') ||
        msg.includes('Session expired') ||
        msg.includes('session has been closed') ||
        msg.includes('Protocol error') ||
        msg.includes('Connection refused') ||
        msg.includes('ECONNREFUSED')
      ) {
        throw err;
      }
      // Consent-specific failure: degrade gracefully
      consent = { status: 'error', cmp: null, durationMs: 0 };
    }
    ```

    ### captureSettings mapping

    Update the `result` computation (around line 160) to add the `'error'` case:

    ```js
    // Before:
    result: consent.status === 'dismissed' ? 'success' : (consent.status === 'none' ? 'notDetected' : 'failed'),

    // After:
    result: consent.status === 'dismissed' ? 'success'
          : consent.status === 'none' ? 'notDetected'
          : consent.status === 'error' ? 'error'
          : 'failed',
    ```

    ### Logging

    After the renderer returns in `performCapture()`, add a consent error log
    event. Place it after line 125 (where renderResult.value is destructured),
    among the existing post-render logging:

    ```js
    if (consent?.status === 'error') {
      await log(env, 4, 'capture', {
        event: 'capture.consent_error',
        captureId,
        tenantId,
        cip,
      });
    }
    ```

    This goes in `performCapture()`, NOT in the renderer. The renderer does not
    have access to env/captureId/tenantId/cip.

    ### consent.js header comment

    Update the status values list in the consent.js header comment (around line 11)
    to add:
    ```
     *   'error'     -- consent processing threw an unexpected error (caught in capture.js)
     ```

    Note: the `'error'` status is produced by capture.js's outer catch, not by
    consent.js itself. The header comment documents it for completeness since the
    consent object shape is the contract between the two files.

    ## Change 4: OpenAPI schema updates (openapi.yaml)

    ### RenderInfo schema (around line 257)

    Add two optional properties to the RenderInfo schema:

    ```yaml
        settleMs:
          type: integer
          minimum: 0
          description: >
            Milliseconds the renderer waited for network quiescence after the load
            event. May be less than the 3s cap when the page settled early.
          examples:
            - 520
        settleReason:
          type: string
          enum: [quiesce, cap]
          description: >
            How the settle phase ended. "quiesce" means the page had no in-flight
            requests for 500ms. "cap" means the 3s hard cap was reached.
    ```

    These are NOT in the `required` array (backward compatibility with older captures).

    ### ConsentHandling schema (around line 84)

    Add `'error'` to the `result` enum:

    ```yaml
        result:
          type: string
          enum: [success, notDetected, failed, error]
          description: >
            Outcome of the consent action. "error" indicates the consent library
            threw an unexpected error; consent state is unknown.
    ```

    ### renderQuality description

    Update the `renderQuality` description in CaptureRecord (around line 335) to
    say "adaptive settle delay (up to 3s)" instead of "3s settle delay".

    ## Change 5: Tests (test/capture.test.js and test/fixtures.js)

    ### test/fixtures.js

    Add a new fixture renderer for consent error:

    ```js
    /**
     * Renderer where consent processing threw an unexpected error.
     * Simulates the adobe.com TypeError scenario: consent crashes but capture completes.
     */
    export const consentErrorRenderer = async () => ({
      screenshot: PNG_BYTES,
      screenshotBefore: null,
      html: TEST_HTML,
      partial: false,
      render: { waitUntilReached: 'load', timedOut: false, durationMs: 3200 },
      consent: { status: 'error', cmp: null, durationMs: 0 },
    });
    ```

    Update existing fixture renderers to include settle telemetry in the render
    objects where they have `render:` fields:
    - `consentNotDetectedRenderer`: add `settleMs: 520, settleReason: 'quiesce'`
    - `dualScreenshotRenderer`: add `settleMs: 3000, settleReason: 'cap'`
    - `consentFailedRenderer`: add `settleMs: 1200, settleReason: 'quiesce'`
    - `enrichedStubRenderer` (in capture.test.js): add `settleMs: 500, settleReason: 'quiesce'`

    Do NOT change `partialRenderer` or `partialLoadRenderer` (partial captures
    skip the settle phase -- they have no settle fields).

    ### test/capture.test.js

    Add a new test section:

    ```js
    describe('performCapture -- consent error degradation', () => {
      it('capture completes when consent returns error status', async () => {
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);

        const record = await getCapture(env.KV, TEST_ID);
        expect(record.status).toBe('complete');
      });

      it('captureSettings.consent.result is "error"', async () => {
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);

        const record = await getCapture(env.KV, TEST_ID);
        expect(record.captureSettings.consent.result).toBe('error');
      });

      it('no screenshotBefore artifact in R2 (single screenshot)', async () => {
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);

        const before = await env.BUCKET.get(`captures/${TEST_ID}/screenshot-before.png`);
        expect(before).toBeNull();
      });

      it('renderQuality is full (consent error does not degrade render quality)', async () => {
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);

        const record = await getCapture(env.KV, TEST_ID);
        expect(record.renderQuality).toBe('full');
      });
    });
    ```

    Import `consentErrorRenderer` from `./fixtures.js` at the top of the test file.

    ### Settle telemetry test

    Add a test that verifies settle fields appear in the KV record:

    ```js
    describe('performCapture -- settle telemetry in render metadata', () => {
      it('records settleMs and settleReason from renderer', async () => {
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, enrichedStubRenderer);

        const record = await getCapture(env.KV, TEST_ID);
        expect(record.render.settleMs).toBe(500);
        expect(record.render.settleReason).toBe('quiesce');
      });
    });
    ```

    ## What NOT to change

    - `context.route('**/*')` handler -- keep settle tracking separate from security gate
    - Partial capture path (lines 404-452) -- has its own budget, no settle delay
    - `NAV_TIMEOUT_MS` (20s) -- validated in 0029
    - `categorizeError()` -- no new error categories needed
    - consent.js internal try/catch -- it's already comprehensive
    - WACZ bundling logic -- no changes needed
    - `_dismissWithBinding` / `_dismissWithPolling` internals -- only the timeout constant changes

    ## Run tests

    After all changes, run:
    ```bash
    cd /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/optimize-capture-timeline && npm test
    ```

    All existing tests must pass. New tests must pass.

    ## Files to modify (complete list)

    1. `src/capture.js` -- adaptive settle, consent try/catch, consent error log, render metadata, constants
    2. `src/consent.js` -- CONSENT_TIMEOUT_MS 8000 -> 2000, header comment update
    3. `test/capture.test.js` -- new consent error tests, settle telemetry test, import consentErrorRenderer
    4. `test/fixtures.js` -- new consentErrorRenderer, settle fields in existing renderers
    5. `openapi.yaml` -- RenderInfo settleMs/settleReason, ConsentHandling result enum, renderQuality description

- **Deliverables**:
  - Modified `src/capture.js` with waitForSettle(), consent try/catch, render metadata extension
  - Modified `src/consent.js` with 2s timeout
  - Modified `test/capture.test.js` with consent error and settle telemetry tests
  - Modified `test/fixtures.js` with consentErrorRenderer and settle fields
  - Modified `openapi.yaml` with new schema fields
  - All tests passing (existing + new)

- **Success criteria**:
  - `npm test` passes with zero failures
  - `SETTLE_DELAY_MS` constant removed, replaced by `SETTLE_MAX_MS` (3000) and `SETTLE_QUIESCE_MS` (500)
  - `CONSENT_TIMEOUT_MS` changed from 8000 to 2000
  - `waitForSettle(page)` function exists and is used in place of fixed setTimeout
  - `dismissCookieConsent(page)` call wrapped in try/catch with selective propagation
  - `consent.status === 'error'` maps to `captureSettings.consent.result === 'error'` in ternary
  - `render` object includes `settleMs` and `settleReason` fields
  - OpenAPI schema includes `settleMs`, `settleReason` in RenderInfo and `error` in ConsentHandling result enum
  - New tests verify consent error degradation path and settle telemetry

### Cross-Cutting Coverage

- **Testing**: Covered in Task 1 -- new unit tests for consent error degradation and settle telemetry; all existing tests must pass as regression gate. Phase 6 runs the full suite post-execution.
- **Security**: Covered in Task 1 prompt -- selective error propagation (re-throw browser death errors, only catch consent-specific), distinct 'error' status for evidence chain integrity. Based on security-minion's planning contribution.
- **Usability -- Strategy**: Not applicable. No user-facing interface changes. The API response shape adds new optional fields (backward compatible). No journey or cognitive load changes.
- **Usability -- Design**: Not applicable. No UI components.
- **Documentation**: Covered in Task 1 -- OpenAPI schema updates, source code header comment updates. Phase 8 handles any further documentation needs.
- **Observability**: Covered in Task 1 -- settle telemetry (settleMs, settleReason) in render metadata, consent_error log event at warning level. No new runtime services.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion -- settle telemetry fields and consent_error log event need review for consistency with existing log schema and render metadata patterns (Task 1 adds new fields to both)
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, user-docs-minion

### Conflict Resolutions

No conflicts between specialists. Both debugger-minion and security-minion agreed on the scope (2 source files + tests), and their recommendations are complementary:
- debugger-minion owns adaptive settle design
- security-minion owns consent failure handling and error propagation strategy
- Both agreed consent.js internal catch needs no changes
- Both agreed the route handler should NOT be modified for settle tracking (start simple)

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Page events not firing in CF Workers runtime | Low | High | Existing `page.on('response')` on line 393 proves events work. 3s cap is fallback. |
| 2s consent timeout too aggressive for slow CMPs | Low | Medium | autoconsent detection typically <500ms; 5 retries at 200ms = 1s fits in 2s. Monitor via existing consentDurationMs telemetry. |
| 500ms quiescence too aggressive | Low | Low | Same window as Playwright's networkidle. Tunable constant. |
| Consent error swallows browser death | Low | High | Selective propagation re-throws session/protocol errors. |
| `removeListener` API difference in CF Playwright fork | Very low | Low | Standard API; fallback is page.close() in finally block cleans up anyway. |

### Execution Order

```
Batch 1: Task 1 (sole task, no dependencies)
```

No gates. Single batch. Estimated execution: one agent pass.

### Verification Steps

1. `npm test` -- all existing + new tests pass
2. Verify `SETTLE_DELAY_MS` is gone from codebase (grep)
3. Verify `CONSENT_TIMEOUT_MS === 2000` in consent.js
4. Verify `waitForSettle` function exists in capture.js
5. Verify consent try/catch with selective propagation around `dismissCookieConsent`
6. Verify `'error'` in ConsentHandling result enum in openapi.yaml
7. Verify `settleMs` and `settleReason` in RenderInfo schema in openapi.yaml
8. Budget check: new worst-case = 20s + 3s + 2s + 2s = 27s (fits 30s ctx.waitUntil)
9. Budget check: new fast-path = 5s + 0.5s + 2s + 2s = 9.5s (meets 5s+ improvement target for CMP-absent pages when goto is typical 2-5s)
