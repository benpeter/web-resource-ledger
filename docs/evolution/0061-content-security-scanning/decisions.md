# Phase 0061: Content Security Scanning -- Decisions

## D1: Google Web Risk over Safe Browsing v4

**Chosen**: Google Web Risk Lookup API (commercial)
**Over**: Google Safe Browsing Lookup API v4
**Why**: Safe Browsing v4 ToS explicitly prohibits commercial use. WRL has
Stripe billing -- using Safe Browsing would violate the ToS. Web Risk is the
commercial equivalent with 100K free lookups/month, sufficient for current
scale. security-minion flagged this during planning.

## D2: Quarantine via flag column, not status value

**Chosen**: `quarantined INTEGER DEFAULT 0` flag column + API-layer status mapping
**Over**: Adding `'quarantined'` to the `captures.status` CHECK constraint
**Why**: D1/SQLite cannot ALTER TABLE to modify CHECK constraints. The
existing `CHECK(status IN ('pending','rendering','complete','failed'))` is
immutable. `rowToCapture()` maps `quarantined=1` to `status: 'quarantined'`
at the API layer, keeping the D1 schema clean. data-minion identified this
constraint during planning.

## D3: Fail-open on API degradation

**Chosen**: Captures proceed with `threatCheck: "unavailable"` when Web Risk API fails
**Over**: Fail-closed (reject captures when API is unavailable)
**Why**: WRL is a capture tool, not a security gateway. Blocking all captures
because of a third-party API outage is worse than temporarily unscreened
captures. The daily re-scan cron provides a safety net -- any captures made
during degraded windows get re-checked within 24 hours.

## D4: Provider-agnostic naming

**Chosen**: `threatCheck` in API responses, `threat-check.js` in code
**Over**: `safeBrowsing`, `webRisk`, or `googleWebRisk` naming
**Why**: Decouples the public API from the specific threat intelligence
provider. If WRL switches providers later, the API contract doesn't change.
"Web Risk" only appears in operational docs (runbooks, alerts) where
operators need to know the specific service.

## D5: HTTP 451 for quarantined artifact access

**Chosen**: HTTP 451 (Unavailable For Legal Reasons)
**Over**: HTTP 403 (Forbidden) or HTTP 410 (Gone)
**Why**: RFC 7725 defines 451 specifically for content restricted for legal
reasons. Quarantined captures aren't access-denied (403) or deleted (410) --
they're restricted because the URL was flagged as malicious. The issue spec
explicitly called for 451.

## D6: Dedicated daily cron for rescan

**Chosen**: Separate cron trigger at `0 3 * * *` (production) / `0 4 * * *` (staging)
**Over**: Piggybacking on the existing per-minute schedule cron
**Why**: Sub-hour crons get only 30 seconds of CPU time on Cloudflare Workers.
A daily cron (>=1 hour interval) gets 15 minutes of CPU, sufficient for
re-scanning up to 500 URLs per invocation. iac-minion confirmed the CPU
budget distinction during planning.

## D7: Injectable lookup dependency for testing

**Chosen**: `checkUrl(url, env, { lookup })` with injectable fetch function
**Over**: Mocking global `fetch` or using MSW
**Why**: Follows the established pattern from `src/url-validation.js`. Zero
network calls in unit tests via simple stub injection. 16 tests verify all
code paths without any external dependencies.

## D8: One-way quarantine (no auto-un-quarantine)

**Chosen**: Once quarantined, captures stay quarantined even if URL is later clean
**Over**: Auto-un-quarantine when rescan returns safe
**Why**: Prevents oscillation attacks where a URL alternates between malicious
and clean to evade permanent quarantine. Un-quarantine requires a deliberate
operator action (future backlog item). security-minion strongly advocated for
this during planning.

## D9: Serial URL processing in rescan

**Chosen**: Serial processing of up to 500 URLs per cron tick
**Over**: Parallel batching with Promise.allSettled
**Why**: Web Risk API has a 6000 req/min rate limit. At WRL's current scale,
serial processing completes well within the 15-minute CPU budget. Parallel
processing adds complexity (rate limiting, backpressure) for no practical
benefit yet. YAGNI per margo's review.
