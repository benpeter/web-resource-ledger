# Decisions

- Cloudflare's analytics count killed runs but say nothing about what they
  ran. The captures come from Coralogix: a killed run logs nothing more, so
  its attempt has a `capture.dequeued` event and no outcome (success, partial,
  stage failure, retry, failure, dead letter) before the queue delivers it
  again. `scripts/lib/lost-attempts.js` finds those attempts;
  `scripts/lost-attempts.js` queries Coralogix for the killed hour plus 15
  minutes and prints time, account, page, capture and attempt.
- Checked against the kill on 2026-11-25: it names
  `cap_4d7364adf27f48d595dc1c6bb97b8de8`, attempt 2, merriam-webster.com
  /dictionary/evidence, account `gh-398734`. The other captures of that hour
  all logged an outcome.
- "Whose request": the account id, and for `gh-<id>` accounts the GitHub login
  from the public users API. No email address: the workflow has no access to
  D1, and the login is enough to know who it was.
- A new Coralogix team key, `wrl-gh-alert-query`, with the DataQuerying preset
  only, as `CORALOGIX_QUERY_KEY`. The existing keys can also manage alerts and
  stay out of GitHub.
- When Coralogix can't be read, the email says so and still goes out.
