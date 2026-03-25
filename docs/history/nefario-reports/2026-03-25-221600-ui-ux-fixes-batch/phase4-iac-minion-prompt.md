Configure a Coralogix alert to notify the operator when new tenant API keys are created. This is a zero-code-change task — the existing `admin.key_create` log event in `src/admin.js` already emits all required fields (tenantId, scopes, name, keyHashPrefix) to Coralogix via the structured logging pipeline.

Working directory: `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/curious-singing-ullman`

**What to do:**

Document the Coralogix alert configuration that needs to be created manually in the Coralogix dashboard. Write the configuration to a new section in the ops runbook.

Read `docs/ops-runbook.md` first to understand the existing structure and style, then add a new section.

The alert rule specification:
- **Name**: `WRL: New API Key Created`
- **Type**: Standard alert (log-based)
- **Query**: `event:"admin.key_create" AND responseStatus:201`
- **Application filter**: `wrl` (production only; exclude `wrl-staging` unless operator opts in)
- **Subsystem filter**: `admin`
- **Condition**: More than 0 occurrences in 1 minute (immediate)
- **Notification group fields**: `tenantId`, `name`, `scopes`, `keyHashPrefix`
- **Destination**: Email to operator (or Slack webhook)

**Files to modify:** `docs/ops-runbook.md` (add alert configuration section)

**What NOT to do:**
- Do not modify any source code (no changes to `src/admin.js`, `src/email-dispatch.js`, etc.)
- Do not add environment variables or wrangler.toml changes
- Do not build an email pipeline for this — the existing log event + Coralogix alert is sufficient
- Do not create new queue bindings or notification types

**Verification:** The documentation accurately describes the alert configuration. No code changes.
