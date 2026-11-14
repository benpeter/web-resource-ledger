# Prompt

Same session as phases 0133 to 0145, continuing the docs pass (benpeter/wrl-backlog#46)
on the security pages. The incident-response page described the auth-failure alert as
"more than 3 failures in 15 minutes", while 644 keyless MCP probes in 36 hours (phase
0144) had raised no alert. `scripts/provision-alerts.sh` showed why: the alert counts
more than 10 failures, and only those that presented a credential.
