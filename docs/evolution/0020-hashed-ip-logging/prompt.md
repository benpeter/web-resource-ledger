Combined task from GitHub issues #36 and #52. Both touch logging in capture.js.

## Issue #36: R6: Hashed IP logging for abuse correlation

Outcome: Brute-force correlation and abuse detection are possible without storing raw IP addresses, maintaining GDPR compatibility.

Success criteria:
- All log entries include HMAC-SHA256 hash of CF-Connecting-IP instead of raw IP
- Hash key rotates daily (derived from date + secret seed)
- Same IP within same day produces same hash (enables correlation)
- Different days produce different hashes (limits tracking window)
- Existing Coralogix log structure preserved (new field, not replacement)

Scope:
- In: HMAC function, daily key derivation from secret seed, integration into existing structured log entries, tests
- Out: IP geolocation, rate limiting changes, Coralogix dashboard updates

## Issue #52: fix: categorizeError swallows actual Playwright error messages

Problem: When concurrent captures exhaust the browser session pool, categorizeError() in src/capture.js doesn't match the actual error thrown by Cloudflare Playwright. The error falls through to the generic catch-all: "Capture could not be completed". The actual error message from Playwright is lost.

Fix:
1. Log the raw error.message and error.name in the capture.stage.fail event (alongside the categorized message)
2. Add error patterns to categorizeError() for common Playwright session errors
3. Consider logging error.message in the catch-all path too

Scope:
- src/capture.js: categorizeError() + log calls
- test/capture.test.js: add test cases for new error patterns

---
Combined in one PR. Evolution slug: hashed-ip-logging. Sequence: 0019.
