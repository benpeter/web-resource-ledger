## Task: Migrate src/capture.js from Puppeteer to Playwright with browser session reuse

You are implementing the core Playwright migration and session reuse logic in
src/capture.js for the WRL (Web Resource Ledger) project. This is a
Cloudflare Workers project using Browser Rendering.

### What to do

Rewrite src/capture.js to replace @cloudflare/puppeteer with
@cloudflare/playwright and implement browser session reuse. Also update
package.json dependencies and wrangler.toml rate limits.

#### 1. Package changes

In package.json:
- Remove "@cloudflare/puppeteer": "^1.0.6" from dependencies
- Add "@cloudflare/playwright": "^1.1.0" to dependencies

#### 2. Rate limit change

In wrangler.toml, change the GLOBAL_CAPTURE_LIMITER from:
  simple = { limit = 20, period = 60 }
to:
  simple = { limit = 200, period = 60 }

#### 3. Import changes in src/capture.js

Replace:
  import puppeteer from '@cloudflare/puppeteer';
With:
  import { connect, acquire, sessions, limits } from '@cloudflare/playwright';

#### 4. Session acquisition helper

Add a private getOrCreateSession(browserBinding) function that implements
session discovery and reuse:

  1. Call sessions(browserBinding) to list active sessions
  2. Filter to free sessions (those WITHOUT a connectionId property)
  3. If free sessions exist:
     a. Pick one at RANDOM (not first -- distributes contention)
     b. Try connect(browserBinding, sessionId) in try/catch
     c. On success, return the connected browser
     d. On failure (another worker claimed it), fall through
  4. If no free session or connect failed:
     a. Check limits(browserBinding).allowedBrowserAcquisitions > 0
     b. If allowed: acquire(browserBinding, { keep_alive: KEEP_ALIVE_MS })
        then connect(browserBinding, sessionId)
     c. If not allowed: throw with a message containing "session pool"
        (this string is matched by categorizeError)
  5. If all attempts fail, throw with a message containing "session pool"

NOTE: Do NOT add a wait/retry loop. Security review capped session wait at 0
to avoid eating into the 30s ctx.waitUntil budget. The function either gets
a session immediately or throws.

Use a KEEP_ALIVE_MS constant set to 120000 (2 minutes).

#### 5. Rewrite defaultRenderer

Replace the current defaultRenderer function. The new implementation:

a. Call getOrCreateSession(browserBinding) to get a connected browser.

b. Defensive orphan cleanup: On connect, close any existing contexts:
   for (const ctx of browser.contexts()) { await ctx.close(); }

c. Create a new context with viewport and service worker blocking:
   const context = await browser.newContext({
     viewport: { width: 1280, height: 720 },
     serviceWorkers: 'block',
   });

d. Set up request interception on the CONTEXT level (not page level).
   Use context.route() for both subresource limiting AND cross-domain
   navigation blocking:

   const targetOrigin = new URL(url).origin;
   let subresourceCount = 0;
   let totalBytes = 0;
   let limitExceeded = null;

   await context.route('**/*', async (route) => {
     // Cross-domain navigation blocking (closes TOCTOU gap)
     if (route.request().isNavigationRequest() &&
         new URL(route.request().url()).origin !== targetOrigin) {
       await route.abort('blockedbyclient');
       return;
     }
     if (limitExceeded) { await route.abort('blockedbyclient'); return; }
     subresourceCount++;
     if (subresourceCount > MAX_SUBRESOURCES) {
       limitExceeded = `Page exceeded ${MAX_SUBRESOURCES} subresource limit`;
       await route.abort('blockedbyclient');
       return;
     }
     await route.continue();
   });

e. Set up response monitoring on the page (after page creation):
   page.on('response', (resp) => {
     const cl = resp.headers()['content-length'];
     if (cl) totalBytes += parseInt(cl, 10);
     if (totalBytes > MAX_PAGE_BYTES) {
       limitExceeded = 'Page exceeded 50MB size limit';
     }
   });

f. Navigate with waitUntil: 'networkidle' (Playwright has no networkidle2):
   await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle' });

g. Cap screenshot height using page.setViewportSize() (not setViewport()):
   const pageHeight = await page.evaluate(() => document.body.scrollHeight);
   if (pageHeight > MAX_PAGE_HEIGHT) {
     await page.setViewportSize({ width: 1280, height: MAX_PAGE_HEIGHT });
   }

h. Screenshot and content APIs are identical:
   const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
   const html = await page.content();

i. Cleanup in try/finally -- this is the critical security invariant:
   } finally {
     await context.close();  // MUST close context before disconnecting
     await browser.close();  // disconnects (does NOT kill browser) for connect()-obtained sessions
   }

IMPORTANT: All route.abort() and route.continue() calls MUST be
awaited. In Puppeteer these were fire-and-forget; in Playwright they return
Promises. Missing await causes silent request stalls.

#### 6. Update categorizeError()

Add new error patterns for Playwright-specific errors and session reuse
errors. The updated function should check error.name for TimeoutError,
then check substrings for: page crashed, page was closed, browser has been
closed, Target closed, session pool.

#### 7. Update the header comment

Update the file's header comment to document the session reuse model and
BrowserContext isolation decision. Include:
- Session reuse model explanation (acquire/connect pattern)
- BrowserContext isolation guarantees (cookies, storage, cache, etc.)
- Accepted risks: browser-level shared state (DNS cache, TLS, HTTP/2 pools)
  is not observable through capture artifacts
- Single-tenant context: no cross-tenant data to leak
- Cloudflare gVisor provides account-level isolation
- Service Workers blocked to prevent route bypass
- context.close() in try/finally is MANDATORY
- Accepted gaps: same-domain DNS rebinding, cross-origin iframe sub-navigation
- Revisit if multi-tenant deployment is implemented

### Constraints

- Do NOT extract renderer to a separate module. Keep everything in src/capture.js.
- Do NOT add pre-warming, cron triggers, or Durable Object coordination.
- Do NOT change the performCapture() function signature or the renderer
  interface (browserBinding, url) => Promise<{screenshot, html}>.
- The keep_alive value should be a constant, not an env var (KISS).
- Keep the // tva marker in the file.
- Preserve all existing exports (performCapture, captureHeaders).

### Files to modify

- src/capture.js (primary -- all Playwright changes)
- package.json (dependency swap)
- wrangler.toml (rate limit change)

### Files to NOT modify

- src/index.js -- no changes needed
- test/ -- separate task
- docs/ -- separate task
