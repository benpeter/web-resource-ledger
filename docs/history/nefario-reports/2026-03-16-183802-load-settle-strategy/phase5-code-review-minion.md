---
phase: load-settle-strategy
reviewer: code-review-minion
files-reviewed:
  - src/capture.js
  - test/fixtures.js
  - test/capture.test.js
  - openapi.yaml
---

# Code Review: load-settle-strategy

## Summary

The implementation is correct and well-structured. All five verification
points from the review brief pass. No blocking issues. Four nits, all
minor.

---

VERDICT: APPROVE

---

## FINDINGS

### Correctness

- [NIT] src/capture.js:459 -- `await new Promise(r => setTimeout(r, SETTLE_DELAY_MS))` uses a bare arrow parameter name `r`. Style is consistent with Cloudflare Workers idioms, but `resolve` is clearer in a project that documents its intent carefully.
  FIX: `await new Promise(resolve => setTimeout(resolve, SETTLE_DELAY_MS));`

- [NIT] src/capture.js:15 -- Header comment budget arithmetic reads "20s load + 3s settle + 8s consent ≈ 33s worst-case". 20 + 3 + 8 = 31, not 33. Arithmetic is off by 2.
  FIX: Either correct the sum to 31s or add the missing margin (e.g., "+2s post-processing → 33s worst-case") to make it precise.

### Verification checks (all pass)

1. **Settle delay on happy path only** -- PASS. The `await new Promise(r => setTimeout(r, SETTLE_DELAY_MS))` at line 459 appears after the `goto` try/catch block. The partial-capture return at lines 436-447 exits before reaching line 459. The settle delay is unreachable from the partial path.

2. **Second limitExceeded check after settle delay** -- PASS. The re-check `if (limitExceeded) throw new Error(limitExceeded)` at line 463 is correctly placed after the `setTimeout` at line 459, catching any bytes that arrived during the settle window.

3. **categorizeError template literals** -- PASS. Both timeout branches at lines 517 and 521 produce `Page did not finish loading within 20 seconds` (NAV_TIMEOUT_MS / 1000 = 20000 / 1000 = 20). The subresource message at line 524 produces `Page exceeded 200 subresource limit` (MAX_SUBRESOURCES = 200). All match their corresponding test assertions in capture.test.js lines 141, 290, 713, 727, 168.

4. **OpenAPI enum preserved for backward compat** -- PASS. `waitUntilReached` enum at openapi.yaml line 269 retains all three values: `[domcontentloaded, load, networkidle]`. The description correctly explains `networkidle` is legacy-retained. No enum values removed.

5. **Staged fallback structure unchanged** -- PASS. The partial-capture return shape at lines 436-447 is intact: `{ screenshot, html, partial: true, render: { waitUntilReached, timedOut, durationMs }, consent: null, screenshotBefore: null }`. No regression to the fallback structure.

### Testing

- [NIT] test/capture.test.js:574-605 -- The three inline renderer stubs (`partialRenderer`, `partialLoadRenderer`, `enrichedStubRenderer`) duplicate shape from test/fixtures.js. `partialLoadRenderer` and `enrichedStubRenderer` are test-local and reasonably sized, but `partialRenderer` is a narrower duplicate of the fixture at fixtures.js:75. Not a correctness issue -- just mild DRY drift that could confuse future editors about the canonical shape.
  FIX: Import `partialRenderer` from fixtures.js (it already exists there with the same shape) and keep only the test-local variants (`partialLoadRenderer`, `enrichedStubRenderer`) as inline stubs.

### OpenAPI

- [NIT] openapi.yaml:272-274 -- The `networkidle` enum description says "fewer than two open network connections for 500ms". Playwright's actual `networkidle` definition is zero open connections for 500ms (not fewer than two). The two-connection threshold is `networkidle0` (older Puppeteer terminology) vs `networkidle2`. The current prose is imprecise and could mislead API consumers reading the spec.
  FIX: Update to "no open network connections for 500ms" or add a clarifying note that this value is retained for backward compatibility only and will not be emitted by new captures.

### Security (in scope for this review)

No hardcoded secrets, no injection vectors introduced. The second `limitExceeded` guard at line 463 is the correct place to catch bytes delivered asynchronously during the settle window -- this is a positive security addition. The partial path correctly bypasses the settle delay, keeping the 2s post-timeout budget intact.

No issues to report.
