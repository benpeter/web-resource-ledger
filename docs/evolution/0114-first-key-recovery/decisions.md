# Decisions: Phase 0114

- 24 hours instead of 1. The key is still shown once and deleted on read. A
  stolen session could create a key in Settings anyway, so the longer window
  adds no new way in.
- The welcome screen creates the replacement through the existing
  `POST /v1/account/keys` (name `primary`, scopes `capture` and `read`, the
  same as the first key). No new endpoint. If that fails (key limit, network),
  the screen falls back to the Settings link it showed before.
- Continue works without a key: the dashboard capture form uses the session,
  so a user who only wants the dashboard isn't stopped.
- Two Pirsch events, `First Key Shown` and `First Key Missing`, sent from
  `GET /v1/account/first-key` with the visitor's request context and no
  account ids, skipped for tenants in `ANALYTICS_EXCLUDE_TENANTS` (phase 0113).
  Their ratio says whether the 24 hours is enough.
- The 404 detail now says the key is kept for 24 hours and shown once.
