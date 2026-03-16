# Decisions: Optimize Capture Pipeline (#79)

## D1: Adaptive settle mechanism — in-flight request counter

**Decision**: Use page.on('request'/'requestfinished'/'requestfailed') with
a 500ms quiescence window and 3s hard cap. Ignore websocket and eventsource
resource types.

**Rationale**: Playwright's built-in `networkidle` hangs indefinitely on sites
with persistent connections (analytics beacons, ad trackers, websockets). That's
why it was replaced with a fixed 3s delay in 0029-load-settle-strategy. The
in-flight request counter preserves the reliability of the fixed cap while
recovering time on pages that settle quickly.

**Alternatives rejected**:
- `page.waitForLoadState('networkidle')`: Rejected in 0029 because it hangs
  on persistent connections. Still rejected.
- Fixed 1s delay: Too short for sites with heavy post-load analytics.
- Counting TCP connections instead of HTTP request/response pairs: Would be
  fooled by persistent connections the same way networkidle is.

**Evidence**: The @cloudflare/playwright v1.1.2 type definitions confirm
page.on('request'), page.on('requestfinished'), and page.on('requestfailed')
are available. The existing code already uses page.on('response') at line 393.

## D2: Consent timeout — 2s (down from 8s)

**Decision**: Reduce CONSENT_TIMEOUT_MS from 8000 to 2000.

**Rationale**: Stage-level timing analysis (0031) showed:
- 6 of 7 tested sites had no CMP, burning the full 8s timeout
- slashdot.org with consentmanager.net completed consent in 1.8s
- 2s provides margin for real CMPs while eliminating 6s of waste on CMP-absent pages

**Alternatives rejected**:
- 1s: Too tight for slower CMPs with multi-step flows.
- 5s: Still wastes 3s on CMP-absent pages.
- Dynamic timeout based on CMP detection: Over-engineered for the data.

## D3: Consent error handling — collapse to 'failed', not new 'error' status

**Decision**: The outer try/catch around dismissCookieConsent() uses
status:'failed' (not a new 'error' value). A separate `capture.consent_error`
log event with errorClass/errorMessage provides operator distinguishability.

**Rationale**: security-minion recommended a new 'error' status for evidence
chain integrity. margo flagged this as YAGNI — it propagates across OpenAPI,
fixtures, tests, and the captureSettings ternary for no behavioral difference.
The log event provides the same operator signal without API surface expansion.

Resolved in favor of margo: the user's success criteria explicitly say
"degrade to consentStatus: 'failed'", and the Helix Manifesto favors
simplicity. The `capture.consent_error` event at log level 4 (warning)
provides all the distinguishability operators need.

**Alternatives rejected**:
- New `'error'` consent status: Would add a fourth result value to the
  captureSettings mapping, OpenAPI enum, and test fixtures. Provides
  marginally better evidence chain distinguishability at the cost of
  expanding the API contract.

## D4: Selective error propagation — re-throw browser death errors

**Decision**: The consent try/catch re-throws errors containing known
browser-death patterns (Target closed, page was closed, browser has been
closed, Session expired, session has been closed, Protocol error). Only
consent-library-specific errors degrade gracefully.

**Rationale**: If the browser session is dead, subsequent page.screenshot()
and page.content() calls will also fail. Swallowing a dead-session error
would delay the inevitable and produce confusing error traces. The patterns
match the existing categorizeError() function's browser lifecycle checks.

**Alternatives rejected**:
- Catch all errors: Would mask browser death, delaying inevitable failure.
- Only catch TypeError: Too narrow — autoconsent can throw other error types.
