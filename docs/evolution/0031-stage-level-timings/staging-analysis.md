# Stage-Level Timing Analysis — Staging Captures (2026-03-16)

## TL;DR

The consent stage dominates capture time. On 6 of 7 successful captures, the
autoconsent library's 8-second timeout fires without finding a CMP (consentStatus:
"none"), burning 8s on every capture for zero value. The only site with actual
consent dismissal (slashdot.org, consentmanager.net) completed consent in 1.8s.
Eliminating or reducing the consent timeout on CMP-absent pages would save ~8s
per capture — cutting median capture time from ~23s to ~15s.

Screenshots are the second largest time sink on content-heavy pages (up to 7.5s
on theguardian.com). Navigation is fast (0.8-7s). The 3s settle delay is fixed
overhead. Session acquisition varies widely (189ms-1.9s).

## Raw Data

| Site | Total (ms) | Session | Context | Nav | Settle | Consent | Screenshot | Content | Consent Status | CMP |
|------|-----------|---------|---------|-----|--------|---------|------------|---------|---------------|-----|
| tagesschau.de | 23,036 | 1,864 | 139 | 2,259 | 3,000 | 8,112 | 7,311 | 351 | none | — |
| theguardian.com | 23,406 | 1,587 | 336 | 2,239 | 3,000 | 8,449 | 7,505 | 290 | none | — |
| nytimes.com | 23,831 | 937 | 394 | 6,989 | 3,000 | 8,200 | 4,155 | 156 | none | — |
| reddit.com | 21,073 | 551 | 328 | 2,219 | 3,000 | 8,234 | 6,616 | 125 | none | — |
| wikipedia.org | 13,688 | 615 | 377 | 810 | 3,000 | 8,075 | 765 | 46 | none | — |
| bbc.com | 13,793 | 189 | 363 | 1,894 | 3,000 | 8,090 | 227 | 30 | none | — |
| slashdot.org | 12,283 | 1,237 | 221 | 2,055 | 3,000 | 1,845 | 3,879 | 46 | dismissed | consentmanager.net |
| **adobe.com** | **FAILED** | — | — | — | — | — | — | — | — | TypeError: Cannot read properties of null (reading 'accept') |

### Overhead gap (render.durationMs vs stage sum)

| Site | render.durationMs | Stage sum | Gap | Notes |
|------|-------------------|-----------|-----|-------|
| tagesschau.de | 23,036 | 23,036 | 0 | |
| theguardian.com | 23,406 | 23,406 | 0 | |
| nytimes.com | 23,831 | 23,831 | 0 | |
| reddit.com | 21,073 | 21,073 | 0 | |
| wikipedia.org | 13,688 | 13,688 | 0 | |
| bbc.com | 13,793 | 13,793 | 0 | |
| slashdot.org | 12,283 | 12,283 | 0 | |

Stage sums match durationMs exactly (expected — the stages are contiguous
intervals computed from the same Date.now() chain).

Note: `durationMs` in the Coralogix log is the **total capture duration**
(measured from `performCapture()` entry), which includes post-render work
(R2 writes, WACZ bundling, KV update). The gap between log `durationMs` and
`render.durationMs` is the post-render overhead.

| Site | Log durationMs | Render durationMs | Post-render overhead |
|------|---------------|-------------------|---------------------|
| tagesschau.de | 24,427 | 23,036 | 1,391 |
| theguardian.com | 24,855 | 23,406 | 1,449 |
| nytimes.com | 24,982 | 23,831 | 1,151 |
| reddit.com | 22,914 | 21,073 | 1,841 |
| wikipedia.org | 14,540 | 13,688 | 852 |
| bbc.com | 14,627 | 13,793 | 834 |
| slashdot.org | 13,307 | 12,283 | 1,024 |

Post-render overhead: 834ms-1,841ms. This is R2 artifact writes + WACZ
bundling + KV update + TSA timestamp request.

## Stage-by-Stage Analysis

### 1. Consent (8,075-8,449ms on 6/7 sites) — THE DOMINANT BOTTLENECK

The autoconsent library has an 8-second hard timeout (`CONSENT_TIMEOUT_MS` in
consent.js). On 6 of 7 sites, no CMP was detected (`consentStatus: "none"`),
but the library still waited the full 8 seconds before giving up.

**The only site with actual consent:** slashdot.org — detected consentmanager.net
and dismissed it in 1,845ms. This is the expected behavior.

**Impact:** 8s of dead wait on CMP-absent pages. For a 23s capture, that's 35%
of total time doing nothing.

**Root cause:** autoconsent's detection is wait-based (waits for CMP DOM elements
to appear, times out if they don't). There's no fast-path for "definitely no CMP
present."

**Recommendations:**
- **Quick win:** Reduce `CONSENT_TIMEOUT_MS` from 8s to 3-4s. CMPs that exist
  are detected within 2s (slashdot took 1.8s). An 8s timeout adds 4-6s of
  unnecessary wait for the common case (no CMP).
- **Medium-term:** Add a heuristic pre-check (scan for common CMP script URLs
  or DOM patterns) before invoking autoconsent. If no CMP signals found, skip
  consent entirely. Saves 3-8s per capture.
- **Long-term:** Make consent opt-in per capture request. Most archival use cases
  don't need consent handling.

### 2. Screenshots (227ms-7,505ms) — PROPORTIONAL TO PAGE SIZE

Screenshot time correlates with visual complexity and page height:

| Site | screenshotMs | Bundle size | Notes |
|------|-------------|-------------|-------|
| bbc.com | 227 | 269 KB | Simple layout |
| wikipedia.org | 765 | 1.5 MB | Moderate content |
| slashdot.org | 3,879 | 4.3 MB | Long page, consent = 2 screenshots |
| nytimes.com | 4,155 | 1.9 MB | Image-heavy |
| reddit.com | 6,616 | 7.4 MB | Infinite scroll candidate |
| tagesschau.de | 7,311 | 7.9 MB | Image-heavy news |
| theguardian.com | 7,505 | 8.5 MB | Largest bundle |

The 7+ second screenshots are for full-page PNGs of content-heavy pages.
`MAX_PAGE_HEIGHT` is 8000px — these pages are likely near that cap.

**Note:** `screenshotMs` includes both before-consent and after-consent
screenshots (summed). For slashdot.org (the only site with consent dismissed),
this is two full-page screenshots. For all others, it's just the before-consent
screenshot (the after-consent screenshot is skipped when no CMP is found).

**Recommendations:**
- Consider viewport-only screenshots instead of full-page for captures where
  full-page is not required.
- WebP/AVIF instead of PNG would reduce both capture time and storage.
- Lower `MAX_PAGE_HEIGHT` if above-the-fold content is sufficient.

### 3. Navigation (810ms-6,989ms) — VARIES BY SITE

| Site | navigationMs | Notes |
|------|-------------|-------|
| wikipedia.org | 810 | Fast, simple HTML |
| bbc.com | 1,894 | Moderate |
| slashdot.org | 2,055 | Moderate |
| tagesschau.de | 2,259 | Moderate |
| theguardian.com | 2,239 | Moderate |
| reddit.com | 2,219 | SPA, client-side rendering |
| nytimes.com | 6,989 | Slowest — heavy JS, paywalled |

Most sites load in 2-3s. nytimes.com is the outlier at 7s (likely paywall
interstitials and heavy JS bundles). Navigation time is largely determined by
the target site's performance — not much WRL can optimize here.

### 4. Settle Delay (3,000ms on all sites) — FIXED OVERHEAD

The 3s settle delay is constant. It exists to let analytics/ad scripts finish
loading after the `load` event fires. This is 13-22% of total capture time.

**Recommendations:**
- Consider making this configurable per-capture or adaptive (detect when
  network activity has stopped).
- For sites that complete network activity quickly, this is wasted time.

### 5. Session Acquisition (189ms-1,864ms) — HIGH VARIANCE

| Site | sessionAcquireMs | Notes |
|------|-----------------|-------|
| bbc.com | 189 | Hot session available |
| reddit.com | 551 | |
| wikipedia.org | 615 | |
| nytimes.com | 937 | |
| slashdot.org | 1,237 | |
| theguardian.com | 1,587 | |
| tagesschau.de | 1,864 | Cold start or contention |

Variance suggests session pool contention. The 8 captures were submitted in
rapid succession, likely competing for sessions. In production with lower
concurrency, this should stabilize at 100-300ms.

### 6. Context Setup (139ms-394ms) — CONSISTENT, LOW

Browser context creation, route setup, and page creation. Under 400ms for all
sites. Not a bottleneck.

### 7. Content Extraction (30ms-351ms) — PROPORTIONAL TO DOM SIZE

`page.content()` is fast. tagesschau.de at 351ms is the outlier (large rendered
DOM). Not a concern.

## adobe.com Failure Analysis

```
event: capture.stage.fail
stage: browser_render
errorName: TypeError
errorMessage: Cannot read properties of null (reading 'accept')
```

This error occurs in `consent.js` — autoconsent detects a CMP on adobe.com but
fails when trying to call `.accept()` on a null reference. This is a bug in
autoconsent's handler for adobe.com's specific CMP implementation.

No stage timings are available because the error occurs mid-render (during
consent), crashing the entire renderer. The error is categorized as
"Capture could not be completed" (retryable: true) because `categorizeError()`
doesn't match this specific message pattern.

**Recommendation:** Wrap the consent dismissal in a try/catch within
`defaultRenderer()` so that consent failures degrade gracefully (capture
continues without consent handling) instead of crashing the entire render.
This would allow adobe.com to be captured successfully as a "consent failed"
capture.

## Budget Analysis

The 30s `ctx.waitUntil` budget breakdown for a typical heavy capture
(tagesschau.de, 24.4s total):

```
|-- Session (1.9s, 8%) --|-- Context (0.1s) --|-- Nav (2.3s, 9%) --|
|-- Settle (3.0s, 12%) --|-- Consent TIMEOUT (8.1s, 33%) --|
|-- Screenshot (7.3s, 30%) --|-- Content (0.4s) --|
|-- Post-render: R2 + WACZ + KV + TSA (1.4s, 6%) --|
                                                        Total: 24.4s / 30s budget
```

**5.6s of remaining budget.** If consent timeout is reduced from 8s to 3s, the
budget headroom doubles to ~10.6s, providing a meaningful safety margin for
slow-loading sites.

## Priority Recommendations

1. **Reduce consent timeout** (8s → 3-4s): Saves 4-5s per capture on the common
   path (no CMP). Minimal risk — real CMPs are detected in <2s.

2. **Graceful consent failure**: Wrap consent in try/catch so autoconsent bugs
   (like the adobe.com crash) degrade to "consent failed" instead of crashing
   the entire capture.

3. **Adaptive settle**: Replace fixed 3s delay with network-idle detection
   (with 3s cap). Could save 1-2s on simple sites.

4. **Screenshot format**: Evaluate WebP for reduced I/O time on large pages.

5. **Consent opt-in**: Make consent handling configurable per capture request
   for use cases that don't need it.
