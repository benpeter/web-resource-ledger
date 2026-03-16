You are implementing three tightly-coupled changes to optimize the capture pipeline.

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/optimize-capture-timeline

## Changes Required

### Change 1: Consent timeout reduction (consent.js)
- Line 30: Change `const CONSENT_TIMEOUT_MS = 8000;` to `const CONSENT_TIMEOUT_MS = 2000;`
- Update the module header comment if it mentions 8s anywhere
- That's it for consent.js. No other changes.

### Change 2: Adaptive settle delay (capture.js)
Replace the fixed settle delay at line 459:
```js
await new Promise(r => setTimeout(r, SETTLE_DELAY_MS));
```
with a `waitForSettle(page)` function that:
1. Counts in-flight requests via `page.on('request')`, `page.on('requestfinished')`, `page.on('requestfailed')`
2. Ignores `websocket` and `eventsource` resource types (they stay open forever)
3. Resolves when 0 non-ignored requests are in-flight for 500ms (SETTLE_QUIESCENCE_MS)
4. Hard caps at 3000ms (SETTLE_MAX_MS) regardless of activity
5. Returns `{ settleMs: number, settleReason: 'idle'|'cap', pendingAtCap: number }` for telemetry

Add the settle telemetry to the render metadata object returned by defaultRenderer:
```js
render: {
  waitUntilReached: 'load',
  timedOut: false,
  durationMs: Date.now() - renderStart,
  settleMs: settle.settleMs,
  settleReason: settle.settleReason,
}
```

Also add settleMs and settleReason to the capture.success log event (around line 226):
```js
settleMs: render?.settleMs ?? null,
settleReason: render?.settleReason ?? null,
```

Remove the SETTLE_DELAY_MS constant (no longer needed). Add SETTLE_MAX_MS = 3000 and SETTLE_QUIESCENCE_MS = 500.

Update the header comment budget calculation: the old one says "3s settle + 8s consent" — update to "3s settle(max) + 2s consent".

IMPORTANT: The limitExceeded re-check at line 463 must still happen AFTER the settle completes. Move it after waitForSettle().

### Change 3: Graceful consent failure (capture.js)
Wrap the `dismissCookieConsent(page)` call (line 474) in try/catch:
```js
let consent;
try {
  consent = await dismissCookieConsent(page);
} catch (err) {
  // Re-throw browser death errors -- subsequent page calls will also fail
  const msg = String(err?.message ?? err ?? '');
  if (
    msg.includes('Target closed') ||
    msg.includes('page was closed') ||
    msg.includes('browser has been closed') ||
    msg.includes('Session expired') ||
    msg.includes('session has been closed') ||
    msg.includes('Protocol error')
  ) {
    throw err;
  }
  // Consent-specific errors degrade gracefully
  consent = { status: 'failed', cmp: null, durationMs: 0 };
}
```

NOTE: Use 'failed' (NOT 'error') for the degraded consent status. The margo review determined that a separate 'error' status is YAGNI. The consent_error log event provides operator distinguishability.

Add a log event in performCapture() when consent degrades. After the renderer returns, check if we should log a consent error. The best way: have the renderer return a flag when consent was caught externally. Add a `consentError` boolean to the render result:

Actually, simpler approach: In the catch block, set a sentinel on the consent object:
```js
consent = { status: 'failed', cmp: null, durationMs: 0 };
consent._errorCaught = true; // internal flag, not persisted
```

Then in performCapture(), after getting renderResult, check:
```js
if (consent?._errorCaught) {
  await log(env, 4, 'capture', {
    event: 'capture.consent_error',
    captureId, tenantId, cip,
    errorClass: err?.constructor?.name,
    errorMessage: String(err?.message ?? '').slice(0, 256),
  });
}
```

Wait -- performCapture doesn't have access to the caught error. Better approach:

In defaultRenderer, when consent throws, include error info in the consent object:
```js
consent = {
  status: 'failed',
  cmp: null,
  durationMs: 0,
  _error: { name: err?.constructor?.name ?? 'Unknown', message: String(err?.message ?? '').slice(0, 256) },
};
```

Then in performCapture (around line 230, after the success path), add:
```js
if (consent?._error) {
  await log(env, 4, 'capture', {
    event: 'capture.consent_error',
    captureId, tenantId, cip,
    errorClass: consent._error.name,
    errorMessage: consent._error.message,
  });
}
```

The `_error` property is NOT included in captureSettings (it's not destructured into it). It's just a transport mechanism from renderer to orchestrator for logging purposes.

### Change 4: Tests (test/capture.test.js)
Add a new describe block for consent error handling:
```js
describe('performCapture -- consent error in renderer', () => {
  // Renderer that simulates consent throwing a TypeError (adobe.com scenario)
  const consentErrorRenderer = async () => ({
    screenshot: PNG_BYTES,
    html: TEST_HTML,
    partial: false,
    render: {
      waitUntilReached: 'load',
      timedOut: false,
      durationMs: 4000,
      settleMs: 500,
      settleReason: 'idle',
    },
    consent: { status: 'failed', cmp: null, durationMs: 0, _error: { name: 'TypeError', message: 'Cannot read properties of null' } },
    screenshotBefore: PNG_BYTES,
  });

  it('capture completes when consent throws', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('sets renderQuality to full despite consent error', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.renderQuality).toBe('full');
  });

  it('captureSettings shows consent result as failed', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.captureSettings.consent.result).toBe('failed');
  });
});
```

Add settle telemetry to the enrichedStubRenderer (lines 596-605 in capture.test.js):
```js
const enrichedStubRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
  partial: false,
  render: {
    waitUntilReached: 'load',
    timedOut: false,
    durationMs: 3500,
    settleMs: 500,
    settleReason: 'idle',
  },
});
```

Add a test that settle telemetry passes through to KV:
```js
it('stores settle telemetry in render metadata', async () => {
  mockHeaderFetch();
  await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
  await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, enrichedStubRenderer);
  const record = await getCapture(env.KV, TEST_ID);
  expect(record.render.settleMs).toBe(500);
  expect(record.render.settleReason).toBe('idle');
});
```

DO NOT modify partial renderer fixtures (partialRenderer, partialLoadRenderer at lines 574-594). They don't need settle fields.

### Change 5: OpenAPI (openapi.yaml or similar)
If there's an OpenAPI spec, update it:
- Add settleMs/settleReason to the capture metadata response schema
- Update any timing descriptions that mention 8s consent timeout

### What NOT to change
- Do NOT modify consent.js internal try/catch (line 68)
- Do NOT add a new 'error' consent status value
- Do NOT modify partial renderer fixtures
- Do NOT change the route() handler
- Do NOT add new dependencies

## Running Tests
After making all changes, run: `npx vitest run` to verify all tests pass.

## Important
- Read each file before modifying it
- Make minimal, focused changes
- Follow existing code style (2-space indent, single quotes, no semicolons at end of function declarations)
- The code uses semicolons at end of statements but not after closing braces of function declarations
