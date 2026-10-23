# Outcome

- `POST /auth/email`, `GET` and `POST /auth/email/verify`
  (`src/email-login.js`), migration 0018 (`email_users`, `login_tokens`,
  `sessions` with `github_id` or `email`), sign-in email template.
- Login screen: an email field under "Sign in with GitHub"; `?from=` is now
  carried through both buttons so docs and landing signups stay attributed.
- Dashboard header and Settings show the email for email users.
- Docs: authentication guide, privacy policy (email sign-in data),
  subprocessors (Resend sends sign-in links), event catalog.
- Red tests committed first: test/email-login.test.js, 19 tests.
