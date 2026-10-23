# Outcome

- Zone setting "Always Use HTTPS": on. Checked: `http://` on the apex, www,
  docs, api and staging answers 301 to the `https://` URL; the HTTPS endpoints
  answer as before.
- `landing/src/index.js`: HSTS header, www redirect to `https://`.
- `test/landing-worker.test.js`: 4 tests (3 red first).
- Whitepaper 5.1 says plain HTTP is redirected and every host sends HSTS.
- `docs/backlog.md`: the Transform Rule item is removed.
