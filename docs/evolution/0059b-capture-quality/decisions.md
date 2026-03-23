# Phase 0059b: Decisions

Decisions captured as they happen during implementation.

## D1: Error page detection — fail vs warn

**Decision:** Chromium error pages and blank pages fail the capture as
non-retryable. Bot protection indicators (Cloudflare challenge, "Access Denied")
are logged as warnings but do NOT auto-fail, since heuristics can false-positive
on legitimate pages.

**Rationale:** A capture of `chrome-error://chromewebdata/` is never useful —
failing loudly is strictly better than a false success. Bot protection is
harder: a Cloudflare challenge page might actually be the page's normal state
for WRL's user-agent, and the operator needs visibility, not a hard failure.

## D2: Subresource limit — 200 → 500

**Decision:** Raise to 500. The real resource cap is MAX_PAGE_BYTES (50 MB).
500 covers the vast majority of news sites. CPU cost of counting is negligible.

**Alternative considered:** Remove the limit entirely. Rejected — it's a
defence-in-depth measure against runaway pages that MAX_PAGE_BYTES alone
wouldn't catch (many small requests).

## D3: Lazy-load scrolling — conservative parameters

**Decision:** 150ms per viewport step, MAX_SCROLL_HEIGHT 12000px, stop if
document grows by >12000px during scrolling (infinite scroll protection).
Worst-case ~2.5s additional time.

**Alternative considered:** Faster scrolling (50ms). Rejected — some
IntersectionObserver implementations need a paint cycle to fire, and 150ms
is still fast enough to stay within the 30s budget.

## D4: Autoconsent version — v14.63.0

**Decision:** Update from v14.59.0 to v14.63.0. Critical fix: v14.61.0
includes Sourcepoint selector updates for Guardian/Spiegel/Zeit.

## D5: Phase numbering — 0059b

**Decision:** Use 0059b suffix to avoid collision with autonomous orchestrator
that may be allocating phase numbers on main.
