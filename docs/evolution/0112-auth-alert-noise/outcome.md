# Outcome

- `scripts/provision-alerts.sh`: Auth Failure Spike query excludes
  `reason:"missing_header"`, threshold 10 in 15 minutes. Applied to production
  Coralogix with the script.
- `docs/operations/alerts.md` and the auth-failure runbook match the alert and
  the code; the leftover "automated investigation" lines are gone.
- E4 closed: the cron logs are complete.
