Create `.github/workflows/autoconsent-update.yml` — a GitHub Actions workflow that automatically checks for autoconsent updates, regenerates vendor files, runs tests, and opens a PR.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/streamed-munching-dragon

Key details from synthesis and review advisories:
- Triggers: cron Monday 06:00 UTC + workflow_dispatch
- 3 jobs: update-and-test, battery, open-pr
- IMPORTANT (security advisory): Set `permissions: contents: read` at workflow level. Only the `open-pr` job gets `permissions: contents: write, pull-requests: write`.
- IMPORTANT (security advisory): Validate version strings match semver before using in shell commands
- SHA-pinned actions: checkout@11bd71901bbe5b1630ceea73d27597364c9af683, setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020, upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
- For download-artifact v4, look up the correct SHA
- Battery uses staging environment with WRL_STAGING_CAPTURE_API_KEY secret, mapped to WRL_KEY env var
- Battery failures are advisory (continue-on-error), not blocking
- Use body-file pattern for PR creation (temp file, not heredoc pipe)
- Close stale autoconsent PRs when opening newer version
- Correct releases URL: https://github.com/nicedigital/nicedigital-autoconsent -> https://github.com/nicedigital/nicedigital-autoconsent/releases -> WRONG. Actual repo is https://github.com/nicedigital/nicedigital-autoconsent... wait, the package is @duckduckgo/autoconsent. Let me check the actual repo URL.
