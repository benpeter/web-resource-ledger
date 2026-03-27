# Outcome: 0105 Auto-Investigate Coralogix Alerts

## Summary

Implemented automated Coralogix alert investigation: when a P1/P2 alert fires, the Worker receives the webhook, deduplicates it against open GitHub Issues, dispatches a `repository_dispatch` event, and a GitHub Actions workflow runs Claude Code against the relevant runbook to produce a diagnostic comment. 6 of 10 defined alert rules participate; P3-P4 alerts remain email-only.

## Files Created

| File | Description |
|------|-------------|
| `src/coralogix-webhook.js` | Webhook handler: Bearer token auth (timing-safe), payload validation, alert filtering, KV-based dedup, daily cap, `repository_dispatch` trigger |
| `.github/workflows/investigate-alert.yml` | Claude Code investigation workflow: downloads alert context, invokes `claude` CLI with runbook reference, posts findings as GitHub Issue comment |
| `scripts/create-investigation-labels.sh` | Idempotent script to create all `alert:{slug}` labels in the GitHub repository |
| `docs/operations/runbooks/email-delivery-failures.md` | New runbook for email delivery failure alerts (Resend bounce rate / DLQ) |
| `docs/operations/auto-investigation.md` | Operator documentation: architecture, setup steps, daily cap, filtering logic, manual trigger instructions |

## Files Modified

| File | Change |
|------|--------|
| `src/index.js` | Added import for `coralogix-webhook.js` and route entry for `POST /v1/webhooks/coralogix` |
| `wrangler.toml` | Added secret name comments for `CORALOGIX_WEBHOOK_SECRET` and `GITHUB_DISPATCH_TOKEN` |
| `vitest.config.js` | Added test bindings for `CORALOGIX_WEBHOOK_SECRET` and `GITHUB_DISPATCH_TOKEN` |
| `scripts/provision-alerts.sh` | Added webhook integration creation step and alert notification channel updates for the 6 participating alert rules |
| `test/fixtures.js` | Added `makeCoralogixAlertPayload` factory with configurable alert name, severity, and triggered value |
| `docs/operations/runbooks/*.md` (8 files) | Added YAML frontmatter (`alert_slug`, `severity`, `auto_investigate: true/false`) to all runbooks |
| `docs/operations/alerts.md` | Added webhook integration section with filtering table, daily cap note, and dedup behavior |
| `.claude/skills/ops-runbook/SKILL.md` | Added cross-reference to auto-investigation documentation |

## Tests

`test/coralogix-webhook.test.js` -- approximately 22 integration tests covering:
- Bearer token auth (valid, invalid, missing, non-Bearer scheme)
- Payload validation (required fields, alert_action enum)
- Alert filtering (allowlisted vs. non-allowlisted alert names)
- Resolve webhook acknowledgement (200, no dispatch)
- KV-based dedup (first dispatch, repeat dedup, TTL expiry, independent alerts, alert storm)
- Daily cap enforcement (cap reached → 200 with reason, cap not reached → dispatch proceeds)
- GitHub dispatch fire-and-forget (200 returned even when GitHub API fails)
- Test helper using `makeCoralogixAlertPayload` factory

## Infrastructure Requiring Manual Setup

The following steps must be completed by the operator before auto-investigation is live. None are automated.

| Action | Detail |
|--------|--------|
| `CORALOGIX_WEBHOOK_SECRET` | Generate a random 32-byte hex secret. Store in 1Password WRL vault (Production item). Deploy via `wrangler secret put CORALOGIX_WEBHOOK_SECRET`. |
| `GITHUB_DISPATCH_TOKEN` | Create a fine-grained GitHub PAT scoped to this repository with `actions:write` permission. Set 90-day expiry. Add to GitHub Actions repository secrets as `GITHUB_DISPATCH_TOKEN`. |
| `ANTHROPIC_API_KEY` | Add to GitHub Actions repository secrets. Required by the `claude` CLI in the investigation workflow. |
| `CORALOGIX_READ_KEY` | Future requirement if the Coralogix MCP server becomes available in CI. Not needed for initial deployment (Claude Code uses its locally configured MCP server). |
| Label creation | Run `scripts/create-investigation-labels.sh` once against the repository to create all `alert:{slug}` labels. |
| Alert provisioning | Run `scripts/provision-alerts.sh` to register the Coralogix webhook integration and update the notification channels on the 6 participating alert rules. |

## Backlog Changes

- Issue #139 (R41: Auto-investigate Coralogix alerts) -- **DONE**
- Deferred to parking lot: **Resolve-to-GitHub-comment** -- post a comment when Coralogix fires the resolve webhook; activate after investigation comments prove reliable in production
- Deferred to parking lot: **Coralogix MCP in CI** -- use direct Coralogix log queries inside the GitHub Actions workflow instead of relying on the operator's locally configured MCP server; activate when a Coralogix API key can be safely injected into CI

## Surface Consistency

- **OpenAPI spec**: No update needed. The webhook endpoint is internal (Coralogix-to-Worker), not part of the public capture API surface documented in the spec.
- **Docs site**: No update needed. This is internal operational infrastructure; the operator documentation lives in `docs/operations/`, not the public docs site.
- **Landing page**: No update needed.
- **MCP server**: No update needed. Alert investigation is separate from the capture MCP tools exposed to API consumers.
- **Legal pages**: No update needed. No new data collection and no new third-party service integration from a data-processing perspective.
