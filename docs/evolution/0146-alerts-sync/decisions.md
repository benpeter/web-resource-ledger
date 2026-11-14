# Decisions

- `scripts/provision-alerts.sh` is the source: it defines eleven rules. The public
  incident-response page and the whitepaper said nine and lacked Captures Dead-Lettered
  (added in phase 0123) and New API Key Created. Both pages now list all eleven.
- Thresholds follow the script: the auth spike is more than 10 rejected keys in 15
  minutes without counting keyless requests; quarantines fire at more than five (the
  whitepaper said five or more); Web Risk failures at more than two in 10 minutes (it
  said two).
- `docs/operations/alerts.md` said the auth spike counted missing headers, which its own
  query excludes. It now says so, and mentions the MCP crawlers behind most keyless
  requests until phase 0144.
- `test/alerts-sync.test.js` (sync suite) checks that every alert name in the script
  appears in the three docs. It doesn't check the numbers: they sit in prose, and the
  drift that happened started with missing alerts.
- Whether the rules in Coralogix still match the script wasn't checked: the Coralogix
  key on hand only queries logs.
