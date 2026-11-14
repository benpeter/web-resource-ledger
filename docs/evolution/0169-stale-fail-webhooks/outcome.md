# Outcome

- Red first (740d75d), then green (3785a82).
- `src/stale-captures.js`: after marking captures failed, `reportStaleFailure`
  dispatches `capture.failed` webhooks and the `capture_failure` email for each.
- Tests: `test/stale-captures.test.js`, a webhook with `retryable: true` and the
  failure email for a capture pending 25 hours.
- Docs: `site/content/webhooks.md` (when `capture.failed` and
  `capture.quarantined` fire, examples), `site/content/notifications.md`,
  `openapi.yaml` (`retryable` and `quarantineReason` descriptions, the event
  type description, three failed examples), `docs/INTERNALS.md`, CHANGELOG.

## Backlog changes

- None.
