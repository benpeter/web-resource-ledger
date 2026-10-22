# Phase 0110: Remove the alert-investigation pipeline

## Task

From the 2026-10-22 assessment and plan, decision D4:

> Alert investigation: fix the model id and raise the auth-failure threshold, or
> remove the workflow and rely on the Coralogix alert emails. My recommendation:
> remove it, since it was agent machinery and the alerts it handled were noise.

Ben, 2026-10-22: "D4 - ok".

Remove the pipeline end to end: the GitHub Actions workflow, the Worker endpoint
that started it, the Coralogix webhook that called the endpoint, and the secrets
only it used. Keep every alert and its email notification.
