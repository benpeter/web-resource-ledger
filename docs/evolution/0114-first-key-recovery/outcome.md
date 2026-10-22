# Outcome: Phase 0114

- `FIRST_KEY_TTL_SECONDS` (24 hours) in `src/oauth.js`, used for the
  `first_key:` KV entry.
- `GET /v1/account/first-key` sends `First Key Shown` or `First Key Missing`
  and explains a missing key.
- Welcome screen: `showWelcomeKey()` and `showMissingKey()` in
  `src/ui/ui-welcome.js`; a missing key offers "Create a new key" in place.
- Tests: `test/first-key.test.js` (9), committed red first.
