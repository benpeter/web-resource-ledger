# Decisions

- Why: every account needed a GitHub account. The users who captured
  evidence of one seller or listing (insurance claims, marketplace disputes)
  are mostly not developers.
- The link opens a page with a "Sign in" button; the POST from that page
  uses the token. Mail scanners and link previews open links in emails, and
  a token used on GET would be gone before the person clicks.
- The POST must come from WRL's own origin (Origin header, or
  Sec-Fetch-Site when Origin is absent). Without that, another site could
  sign a visitor into the attacker's account with a token the attacker
  requested (login CSRF).
- Tokens: 32 random bytes, base64url, 15 minutes, single use, stored as
  SHA-256 hex in `login_tokens`. Using one is a single conditional UPDATE,
  so two clicks can't both succeed. Expired and used tokens are deleted when
  new ones are created.
- Rate limits: 3 links per address and 10 per IP an hour, keyed by hashes
  in KV. The per-address limit stops WRL from being used to flood someone's
  inbox; the per-IP limit caps account creation from one client. The global
  AUTH_RATE_LIMITER still applies to all `/auth/*` routes.
- Accounts: an address that signed in by email before keeps its account. A
  first-time address that is the verified notification email of exactly one
  account joins that account, so a GitHub user can also sign in by email
  without getting a second, empty account. GitHub only reports verified
  primary emails, and manual addresses are verified by link, so "verified"
  means the person controlled the inbox. If two accounts share the address,
  WRL creates a new one rather than guess.
- New email accounts get tenant id `em-<16 hex>`, a first API key (24 hours,
  same as GitHub signups) and the address as their verified notification
  email.
- Sessions: migration 0018 rebuilds `sessions` so a row has either a
  `github_id` or an `email` (CHECK). D1 applies a migration in one
  transaction, and the copy keeps every existing session.
- The sign-in email is sent directly through Resend, not the email queue,
  so the person learns at once if it couldn't be sent (502). Addresses are
  never logged.
- Events stay under `oauth.*`, next to the GitHub sign-in events.
- Not done: no email-change flow for email-only accounts (they can set a
  different notification address, which doesn't change the sign-in
  address), and no way to merge two accounts.
