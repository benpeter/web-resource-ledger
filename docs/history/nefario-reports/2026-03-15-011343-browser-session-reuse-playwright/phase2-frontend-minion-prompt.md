You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Migrate src/capture.js from @cloudflare/puppeteer to @cloudflare/playwright while implementing browser session reuse.

## Your Planning Question
What are the concrete API differences between @cloudflare/puppeteer and @cloudflare/playwright that affect src/capture.js? Specifically:
(a) How does page.route() replace page.setRequestInterception(true) + the request event listener pattern?
(b) What is the Playwright equivalent of req.abort('blockedbyclient') and req.continue()?
(c) How does page.goto() differ -- does Playwright use waitUntil: 'networkidle' instead of 'networkidle2'?
(d) Are there differences in page.screenshot(), page.content(), page.setViewport() (or page.setViewportSize())?
(e) How does BrowserContext creation and isolation differ?
(f) Does Playwright's page.route() provide full cross-domain navigation blocking that closes the TOCTOU gap?

## Context - Current defaultRenderer() function (src/capture.js lines 183-233):
```javascript
async function defaultRenderer(browserBinding, url) {
  const browser = await puppeteer.launch(browserBinding);
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    let subresourceCount = 0;
    let totalBytes = 0;
    let limitExceeded = null;
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (limitExceeded) { req.abort('blockedbyclient'); return; }
      subresourceCount++;
      if (subresourceCount > MAX_SUBRESOURCES) {
        limitExceeded = `Page exceeded ${MAX_SUBRESOURCES} subresource limit`;
        req.abort('blockedbyclient');
        return;
      }
      req.continue();
    });
    page.on('response', (resp) => {
      const cl = resp.headers()['content-length'];
      if (cl) totalBytes += parseInt(cl, 10);
      if (totalBytes > MAX_PAGE_BYTES) {
        limitExceeded = 'Page exceeded 50MB size limit';
      }
    });
    await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle2' });
    if (limitExceeded) throw new Error(limitExceeded);
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    if (pageHeight > MAX_PAGE_HEIGHT) {
      await page.setViewport({ width: 1280, height: MAX_PAGE_HEIGHT });
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

TOCTOU backlog items: Puppeteer request interception for cross-domain navigation blocking, DNS re-resolution gap.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution with Recommendations, Proposed Tasks, Risks/Concerns, Additional Agents Needed
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-frontend-minion.md
