Automate the vendored autoconsent update process. Currently the update is manual (npm install → regenerate vendor script → test → PR). A GitHub Action should handle this periodically.

## Motivation

- Autoconsent receives frequent updates with new CMP rules (Sourcepoint, OneTrust, etc.)
- Manual updates lag — v14.59.0 → v14.63.0 gap caused Sourcepoint opt-out failures on Guardian/Spiegel/Zeit
- Automated pipeline catches CMP regressions before they affect production captures

## Proposed Implementation

GitHub Action workflow (`autoconsent-update.yml`):
1. **Trigger**: Weekly schedule (cron) or manual dispatch
2. **Check**: Compare installed version vs latest on npm
3. **Update**: `npm install @duckduckgo/autoconsent@latest`
4. **Regenerate**: Run vendoring script to rebuild `src/vendor/autoconsent-script.js`
5. **Update constant**: Bump `AUTOCONSENT_VERSION` in `src/consent.js`
6. **Test**: Run unit tests (`npm test`)
7. **Battery**: Run `npm run test:battery` against staging (requires staging API key secret)
8. **PR**: Open a PR with the version bump if tests pass

## Secrets Required

- `WRL_STAGING_KEY` — staging API key for test battery

## Acceptance Criteria

- Weekly cron trigger + manual dispatch
- Skips if already on latest version
- PR includes version diff in description
- Test battery results in PR comment
- No PR opened if tests fail
