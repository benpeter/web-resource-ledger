# Phase 0057: E2E Test Suite (Playwright)

Issue: #105

Build a Playwright-based end-to-end test suite that validates the critical
user journeys against the live staging environment. Tests should cover:

1. Capture submission and verification (golden path)
2. Batch capture endpoint
3. API key rotation lifecycle
4. Quota enforcement
5. Webhook delivery lifecycle
6. Verification page rendering

Tests run against `wrl-staging.benpeter.workers.dev` with real browser
rendering and real queue processing. A CI workflow triggers after each
staging deploy.

Budget: $60 | Act: 4 (act_last)
