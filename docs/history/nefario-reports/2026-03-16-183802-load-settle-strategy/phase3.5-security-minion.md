# Security Review: load-settle-strategy

## Verdict: ADVISE

---

[security]: The 3-second settle delay adds a fixed, unconditional window where the page's JavaScript continues executing with full access to the capture context (DOM, cookies, storage). This is not new attack surface the capture service introduces, but it is an intentional extension of attacker-controlled code execution time. The existing security posture (cross-domain blocking, subresource limits, context isolation) remains intact. The risk is marginal and already accepted by the current design (network connections already lived for 20s under networkidle). However, one implementation detail warrants a flag.

**SCOPE**: `src/capture.js` -- settle delay placement and `limitExceeded` check interaction
**CHANGE**: Adding `await page.waitForTimeout(SETTLE_DELAY_MS)` after the `limitExceeded` throw check on the happy path
**WHY**: The `limitExceeded` flag is set by a response event listener that fires asynchronously. The plan correctly places the check at line 454 (`if (limitExceeded) throw`), then runs the settle delay. However, during the settle delay itself, the response listener continues running -- additional responses can arrive and push `totalBytes` past `MAX_PAGE_BYTES`. These post-settle responses are never re-checked: the code proceeds directly to screenshot, `page.content()`, and R2 upload without a second `limitExceeded` guard. An adversarial page could intentionally delay large responses (e.g., chunked streaming responses, lazy-loaded media) to fire during the settle window, bypassing the size cap.
**TASK**: After the settle delay completes, add a second `limitExceeded` check before proceeding to the screenshot phase:
```js
await page.waitForTimeout(SETTLE_DELAY_MS); // or Promise-based fallback
if (limitExceeded) throw new Error(limitExceeded);
// then: viewport height check, screenshots, etc.
```
This is a two-line addition that closes the window entirely. The existing pattern at line 454 is the model.

---

All other security properties are unchanged:
- The settle delay uses no user-controlled duration (constant only).
- `categorizeError()` message derivation from the constant is safe and improves consistency.
- No new I/O, no new network requests, no new external data flows.
- Context isolation (`context.close()` in finally) is unaffected.
- No secrets, credentials, or internal details enter new code paths.
- The OpenAPI enum change is backward-compatible and introduces no schema injection surface.
