# Phase 0046: Coralogix Alerting Rules

Source: GitHub Issue #95 — R22: Coralogix alerting rules

## Task Description

**Outcome**: Coralogix alerting rules monitor WRL production health and notify the operator via email when key metrics breach thresholds. Alert definitions are documented in the repo and each alert has a corresponding runbook.

**Success criteria**:
- Alert: capture failure rate >10% over a 5-minute window triggers notification
- Alert: TSA (RFC 3161 timestamp) failure rate >50% over a 10-minute window triggers notification
- Alert: authentication failure spike >50 failures/hour triggers notification
- Alert: Worker error rate (non-2xx/4xx responses) >1% over a 5-minute window triggers notification
- All alerts send email to the operator address
- Alert definitions are documented in `docs/operations/alerts.md` with threshold rationale
- Each alert has a runbook in `docs/operations/runbooks/` describing diagnosis steps and remediation
- Alerts can be provisioned via Coralogix API or Terraform (documented, reproducible)
- No false-positive alerts during normal single-tenant operation

**Scope**:
- In: Four alert rules (capture failure, TSA failure, auth spike, error rate), email notification channel, alert documentation, runbooks, provisioning method
- Out: Slack/PagerDuty integration (email only for now), auto-remediation, custom dashboard (Coralogix built-in dashboards suffice), alerting for staging environment

**Constraints**:
- Coralogix send key and API key are in ~/.secrets (WRL_CORALOGIX_SEND_KEY, WRL_CORALOGIX_API_KEY)
- Structured logs already emit the fields needed for these alerts (status codes, TSA outcomes, auth results)
- Alert definitions should be idempotent -- running the provisioning script twice must not create duplicates
