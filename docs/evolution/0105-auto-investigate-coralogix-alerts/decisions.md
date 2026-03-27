# Decisions: 0105 Auto-Investigate Coralogix Alerts

## 1. Route on existing Worker vs. separate Worker

**Decision:** Add the Coralogix webhook handler to the existing capture Worker (`src/index.js`).

**Rationale:** The Stripe webhook handler (Phase 0058) proved this pattern works at production scale. Middleware auth gates use path prefixes (`/v1/webhooks/*`) and do not interfere with the new `/v1/webhooks/coralogix` route. A separate Worker would add disproportionate infrastructure overhead -- a second wrangler.toml, separate secrets provisioning, separate deploy pipeline -- for approximately 80 lines of handler code. The pattern is already established; there is no architectural reason to deviate.

## 2. `repository_dispatch` vs. `workflow_dispatch` vs. queue relay

**Decision:** Use GitHub `repository_dispatch` to trigger the investigation workflow.

**Rationale:** `repository_dispatch` provides a programmable JSON payload, a clean HTTP trigger from the Worker, and allows keying the concurrency group on the dedup key to prevent alert storms from spawning parallel investigations. `workflow_dispatch` requires a branch ref and offers no payload schema. A queue relay (Cloudflare Queue → consumer → GitHub API) adds latency and complexity without adding reliability for an event type that fires rarely and where idempotency is handled at the GitHub Issues layer anyway.

## 3. 6 of 10 alerts auto-investigate

**Decision:** Filter by actionability -- only 6 of the 10 defined alert rules trigger auto-investigation. P3-P4 alerts remain email-only.

**Rationale:** Auto-investigation adds value when the finding is actionable and the alert warrants urgent attention. P1 and P2 alerts (high capture failure rate, TSA failure, queue DLQ events, auth anomaly, Web Risk API outage, billing pipeline failure) meet this bar. P3-P4 alerts (approaching quota, slow captures, elevated 4xx) are informational; spawning a GitHub Issue and a Claude Code investigation for every slow-capture alert would create noise and erode trust in the mechanism. Filtered dispatch keeps the investigation queue signal-to-noise ratio high.

## 4. Payload sanitization

**Decision:** Only structured metadata from the alert is forwarded to the GitHub `repository_dispatch` payload. Claude Code queries Coralogix directly via MCP for log content.

**Rationale:** Coralogix alert payloads contain log-derived content (error messages, URLs, stack traces) that an attacker could manipulate to perform prompt injection via `${{ }}` GitHub Actions expression interpolation. Forwarding only structured fields (alert name, slug, severity, timestamp, triggered value, threshold) eliminates this vector. Claude Code then queries Coralogix directly through its MCP server, where log content is data -- not instructions evaluated in a template context.

## 5. One issue per alert type with comment updates

**Decision:** Use `alert:{slug}` labels to dedup: if an open issue with the matching label exists, post a comment to it rather than opening a new issue.

**Rationale:** Alert storms (the same condition triggering multiple times in quick succession) would otherwise create a flood of duplicate GitHub Issues. One issue per alert type makes the investigation history readable and prevents notification fatigue. The `gh issue list --label alert:{slug} --state open` check is a single shell command with no additional infrastructure.

## 6. No auto-close on resolution

**Decision:** When Coralogix fires a "resolve" webhook, acknowledge with 200 but take no GitHub action.

**Rationale:** Operators must confirm resolution. Auto-closing an issue based on a metric crossing back below threshold does not mean the root cause was found or addressed -- it may mean the alert was flapping, or the metric recovered temporarily. Trust in auto-investigation requires operational experience: once the team is confident the system produces reliable findings, auto-close can be added. Shipping it on day one inverts that trust-building sequence.

## 7. Resolve-to-GitHub-comment deferred

**Decision:** The architecture review (margo + lucy) flagged resolve-to-comment as over-scoped for MVP. The resolve webhook path exists and returns 200 but posts nothing to GitHub.

**Rationale:** The primary value of this phase is investigation on trigger, not lifecycle tracking. Adding resolve comments before establishing that investigation comments are useful creates maintenance surface with unproven return. Defer until the investigation workflow has been running in production for several alert cycles.

## 8. Alert data via file, not prompt interpolation

**Decision:** Alert context is written to `/tmp/alert-context.json` and read by Claude Code as structured data, not interpolated into the investigation prompt via `${{ }}` expressions.

**Rationale:** GitHub Actions expression syntax evaluates `${{ }}` in the workflow YAML context. Log-derived strings in alert payloads could contain sequences that, when interpolated, alter the instructions passed to Claude Code. Writing alert context to a temp file and reading it as JSON data eliminates this injection vector entirely. The investigation prompt references the file path; it never directly embeds alert field values.

## 9. Why this [consider]-tier backlog item was activated now

**Decision:** Activate Issue #139 ahead of other [consider]-tier items in the Operations parking lot.

**Rationale:** Three preconditions already existed: (1) the runbooks are written and validated (Phase 0046), (2) the Coralogix MCP server is installed and configured, (3) the alert definitions are provisioned and firing correctly in production. The gap between "human follows runbook" and "Claude Code follows runbook" was smaller than any other backlog item. The investigation prompt is a formalization of what the operator already does manually -- the runbook steps translate directly into MCP queries. Additionally, the system is read-only (investigation and reporting only, no auto-remediation), so the blast radius is bounded: the worst outcome is a misleading GitHub Issue, not a production change.
