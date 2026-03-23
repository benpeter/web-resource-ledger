A Playwright-based end-to-end test suite validates the complete WRL user journey against a running environment. The suite covers signup through verification, batch operations, scheduled captures, webhooks, quota enforcement, and public share links. It runs as a separate CI workflow, catching integration regressions that unit tests miss.

Success criteria:
- Playwright test suite in `tests/e2e/` directory
- Test: signup via OAuth -> receive API key -> first capture -> poll until complete -> verify signature -> download WACZ
- Test: batch capture (POST /v1/captures/batch) -> 207 multi-status response -> poll individual capture statuses
- Test: scheduled capture creation -> cron trigger fires -> new capture appears in list
- Test: webhook delivery on capture completion -> retry on 5xx failure -> successful delivery on retry
- Test: quota enforcement -> capture rejected with 429 -> response includes upgrade guidance
- Test: share link generation -> public verification page loads without auth -> signature validates
- All tests pass against staging environment
- CI workflow (`e2e-tests.yml`) runs on push to main and on-demand, separate from unit test workflow
- Tests complete within 5 minutes total
- Test failures produce screenshots and trace files as artifacts
- Tests are independent (no ordering dependency, can run in parallel)

Scope:
- In: Playwright test suite, CI workflow, six user journey tests listed above, test fixtures/helpers, screenshot-on-failure, trace artifacts
- Out: Visual regression testing, performance benchmarking, load testing, accessibility testing (covered by Lighthouse in R19), mobile viewport testing

Constraints:
- Depends on R24 (OAuth signup must exist for the signup flow test)
- Tests run against staging, not production -- staging must be seeded or tests must handle setup/teardown
- Playwright browser binaries must be cached in CI to avoid download on every run
- Webhook test needs a publicly reachable endpoint for callback -- use a test webhook receiver (e.g., webhook.site or a Workers-based test endpoint)
- Scheduled capture test may need a mechanism to trigger the cron manually rather than waiting for the interval
