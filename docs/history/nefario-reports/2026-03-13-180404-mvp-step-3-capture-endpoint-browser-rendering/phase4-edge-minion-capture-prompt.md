You are implementing the browser rendering capture module for the Web Resource Ledger Cloudflare Worker. This is the core component that navigates to a URL, takes a screenshot, captures rendered HTML, fetches HTTP headers, and stores artifacts in R2.

## Context
Working directory: /Users/ben/github/benpeter/web-resource-ledger
Read these files first:
- src/url-validation.js -- injectable dependency pattern (resolvers parameter)
- src/kv.js -- KV helper module (exists now)
- src/auth.js -- auth module (exists now)
- src/responses.js -- response helpers
- wrangler.toml -- bindings: BROWSER, BUCKET (R2), KV
- openapi.yaml -- the API contract
- package.json -- dependencies (you need to add @cloudflare/puppeteer)

## What to produce

### Install dependency
Run: `npm install @cloudflare/puppeteer`

### src/capture.js
The module has these exports:

**1. `performCapture(env, url, ip, captureId, renderer)`**
Orchestrates the full capture pipeline. Called from ctx.waitUntil() in the POST handler.

Parameters:
- env: Worker environment (KV, BUCKET, BROWSER bindings)
- url: validated URL string
- ip: resolved IP string (informational)
- captureId: the capture ID (e.g., cap_abc123...)
- renderer: injectable rendering function (defaults to `defaultRenderer`)

Pipeline:
1. Run browser capture and header fetch concurrently via Promise.allSettled()
2. On all success: store artifacts in R2, update KV to complete
3. On any failure: update KV to failed with error message and retryable flag
4. Top-level try/catch ensures KV is ALWAYS updated (never leave stuck pending)

```js
import { completeCapture, failCapture } from './kv.js';

export async function performCapture(env, url, ip, captureId, renderer = defaultRenderer) {
  try {
    const [renderResult, headerResult] = await Promise.allSettled([
      renderer(env.BROWSER, url),
      captureHeaders(url),
    ]);

    if (renderResult.status === 'rejected') {
      const { message, retryable } = categorizeError(renderResult.reason);
      await failCapture(env.KV, captureId, message, retryable);
      return;
    }

    const { screenshot, html } = renderResult.value;
    const headers = headerResult.status === 'fulfilled' ? headerResult.value : null;

    // Store in R2
    const prefix = `captures/${captureId}`;
    await Promise.all([
      env.BUCKET.put(`${prefix}/screenshot.png`, screenshot),
      env.BUCKET.put(`${prefix}/rendered.html`, html),
      headers ? env.BUCKET.put(`${prefix}/headers.json`, JSON.stringify(headers)) : Promise.resolve(),
    ]);

    const artifacts = {
      screenshot: `${prefix}/screenshot.png`,
      html: `${prefix}/rendered.html`,
      ...(headers ? { headers: `${prefix}/headers.json` } : {}),
    };

    await completeCapture(env.KV, captureId, artifacts);
  } catch (err) {
    // Catch-all: ensure KV is updated even on unexpected errors
    try {
      await failCapture(env.KV, captureId, 'Capture could not be completed', true);
    } catch { /* KV write failed -- nothing more we can do */ }
  }
}
```

**2. `defaultRenderer(browser, url)` (NOT exported -- module-scoped default)**
The real Puppeteer rendering function. Replaceable via the `renderer` parameter for testing.

```js
import puppeteer from '@cloudflare/puppeteer';

async function defaultRenderer(browserBinding, url) {
  const browser = await puppeteer.launch(browserBinding);
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Request interception for isolation and safety limits
    let subresourceCount = 0;
    let totalBytes = 0;
    const MAX_SUBRESOURCES = 200;
    const MAX_PAGE_BYTES = 50 * 1024 * 1024;
    let limitExceeded = null;

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (limitExceeded) { req.abort('blockedbyclient'); return; }
      subresourceCount++;
      if (subresourceCount > MAX_SUBRESOURCES) {
        limitExceeded = `Subresource limit exceeded (${MAX_SUBRESOURCES} max)`;
        req.abort('blockedbyclient');
        return;
      }
      req.continue();
    });

    page.on('response', (resp) => {
      const cl = resp.headers()['content-length'];
      if (cl) totalBytes += parseInt(cl, 10);
      if (totalBytes > MAX_PAGE_BYTES) {
        limitExceeded = `Page size limit exceeded (50MB max)`;
      }
    });

    // Navigate with 25s timeout (leaves 5s headroom in ctx.waitUntil 30s budget)
    await page.goto(url, { timeout: 25000, waitUntil: 'networkidle2' });

    if (limitExceeded) throw new Error(limitExceeded);

    // Cap screenshot height to prevent memory exhaustion
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    const maxHeight = 8000;
    if (pageHeight > maxHeight) {
      await page.setViewport({ width: 1280, height: maxHeight });
    }

    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    const html = await page.content();

    return { screenshot, html };
  } finally {
    await context.close();
    await browser.close();
  }
}
```

**3. `captureHeaders(url)` (exported for testing)**
Fetches HTTP response headers via Workers fetch.

ADVISORY (security): Add a scheme guard before the fetch call -- assert http: or https: scheme as defence-in-depth, independent of validateUrl.

```js
export async function captureHeaders(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported');
  }

  const resp = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: {
      'User-Agent': 'WRL/0.1 (Web Resource Ledger)',
      'Cache-Control': 'no-cache',
    },
    cf: { cacheTtl: 0 },
  });

  const headers = {};
  for (const [key, value] of resp.headers.entries()) {
    // SECURITY: strip Set-Cookie values (privacy)
    if (key.toLowerCase() === 'set-cookie') {
      headers[key] = '[redacted]';
    } else {
      headers[key] = value;
    }
  }

  return {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  };
}
```

**4. `categorizeError(error)` (NOT exported -- internal helper)**
Maps errors to user-facing messages and retryable flags:
- Timeout errors (message includes 'timeout' or 'Timeout'): `{ message: 'Page did not finish loading within 25 seconds', retryable: true }`
- Subresource limit: `{ message: 'Page exceeded 200 subresource limit', retryable: false }`
- Page size limit: `{ message: 'Page exceeded 50MB size limit', retryable: false }`
- Navigation errors: `{ message: 'Could not navigate to the target URL', retryable: true }`
- Default: `{ message: 'Capture could not be completed', retryable: true }`

IMPORTANT ADVISORY (from 3 reviewers -- lucy, margo, test-minion):
Do NOT implement `setRenderer(fn)` or `getRenderer()`. Do NOT create a module-scoped `_renderer` variable. The `renderer` parameter on `performCapture` is the ONLY injection mechanism. This follows the same pattern as validateUrl's `resolvers` parameter. Module-scoped mutable state is an anti-pattern in Workers shared scope.

SECURITY constraints:
- Never expose stack traces, internal error messages, or KV keys in error strings
- try/finally for browser context destruction (ALWAYS close even on error)
- redirect:'manual' on header fetch (never follow redirects to unvalidated URLs)
- Set-Cookie values redacted in captured headers

### test/capture.test.js (unit tests for capture orchestration)
Test performCapture with injectable renderer. Use real KV (from cloudflare:test env). Use fetchMock from cloudflare:test for the header capture outbound fetch.

```js
import { env, fetchMock } from 'cloudflare:test';
```

Test cases:
- Successful capture: stub renderer returns { screenshot, html }, fetchMock returns headers -> KV status transitions to complete, R2 artifacts written
- Failed capture (renderer throws timeout): KV transitions to failed with retryable=true
- Failed capture (renderer throws size limit): KV failed with retryable=false
- Header capture fails but render succeeds: capture still completes (headers optional, but R2 headers.json not written)
- Both fail: KV transitions to failed
- KV is always updated (never stuck pending): verify after every test
- Error messages are user-safe (no stack traces)

ADVISORY (test-minion): Also add direct unit tests for `captureHeaders`:
- Set-Cookie redaction (verify key.toLowerCase() comparison)
- Non-sensitive header preservation
- status and statusText capture
- redirect:'manual' behavior (fetchMock can verify this)

For stub renderer:
```js
const stubRenderer = async () => ({
  screenshot: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  html: '<html><body>test</body></html>',
});
```

For fetchMock:
```js
beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => {
  fetchMock.deactivate();
});
```

Verify R2 writes via env.BUCKET.get() in assertions.
Verify KV state via env.KV.get() in assertions (import getCapture from src/kv.js).

## What NOT to do
- Do not implement route handlers (Task 5)
- Do not implement rate limiting (Task 6)
- Do not write the evolution log (Task 7)
- Do not implement setRenderer/getRenderer (ADVISORY: removed by architecture review)
- Do not implement request interception for isPrivateIP re-check on cross-domain navigations (documented as TOCTOU gap in backlog -- Step 3 accepts this risk)
- Do not use page.goto with default timeout (must be 25000)

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced