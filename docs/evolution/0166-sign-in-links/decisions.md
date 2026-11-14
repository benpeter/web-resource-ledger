# Decisions

- The buttons open `https://api.webresourceledger.com/ui?from=landing` (or
  `from=docs`), the sign-in page with both options. It passes `from` on to the
  GitHub link and to the emailed-link request, so sign-ups stay attributed to the
  site that sent them, as before.
- A signed-in visitor who clicks "Sign in" now lands in the dashboard; before, it
  ran the GitHub OAuth round trip again.
- `test/sign-in-links-sync.test.js`
  fails on any landing or docs page that links `/auth/login`, and checks that
  every "Sign in" and "Get started free" link opens `/ui` with its site's `from`.
- While checking the marketplace page's claim that qualified timestamps are a
  Settings switch, the handler's comment said turning them on needs a payment
  method (402). The code doesn't check one (the first 50 a month are free), so
  the page is right and the comment was stale. A test now covers the behaviour,
  and the unused payment-method read and both stale comments are gone.
