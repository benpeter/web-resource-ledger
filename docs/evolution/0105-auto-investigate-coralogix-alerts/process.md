# Process: 0105 Auto-Investigate Coralogix Alerts

## TL;DR

Nefario orchestration with 5 planning specialists, 5 architecture reviewers, and 8 execution tasks across 3 batches with 2 approval gates. The key conflict -- separate Worker vs. route on existing Worker -- was resolved during synthesis by examining the Stripe webhook precedent. Architecture review caught a scope issue (resolve-to-GitHub-comment) that was deferred, and code review caught a critical value mismatch (`trigger` vs `triggered`) that would have broken every production webhook. 27 files changed, 1761 lines added, 22 new tests, all 1665 tests green.

## Phase 1: Meta-Plan

Nefario analyzed the task (GitHub Issue #139) and selected 8 specialists. Lucy reviewed the team and reduced it to 5, removing ai-modeling-minion (investigation prompt is a decision tree, not ML), ux-strategy-minion (GH issues are a devx concern), and observability-minion (premature for MVP). The remaining team: iac-minion, security-minion, devx-minion, test-minion, software-docs-minion.

## Phase 2: Specialist Planning

All 5 specialists ran in parallel. Key positions:

**iac-minion** recommended a separate lightweight Worker (`wrl-alert-receiver`) with its own wrangler.toml, KV namespace, and DNS record at `alerts.webresourceledger.com`. Argued for isolation: "the webhook handler has different auth, different rate limiting, and different failure modes than the capture pipeline." Also proposed 4-layer rate/cost controls and identified that only 6 of 10 alerts warrant auto-investigation.

**security-minion** identified prompt injection via log data as the highest-severity risk. Recommended: forward only structured metadata (alert ID, name, priority) in the dispatch payload, never raw logs. Claude Code should query Coralogix directly via MCP. Also recommended timing-safe auth, fine-grained PAT scoping, and output validation.

**devx-minion** designed the GitHub Issue output format: bold triage line at top (Classification | Confidence | Priority), one open issue per alert type with comment updates, severity mapping from P1-P4, and a recommendation against auto-closing issues.

**test-minion** proposed ~50 tests following billing.test.js patterns, with real KV for dedup and mocked GitHub API. Recommended alert storm simulation (10 webhooks -> 1 dispatch) and dry-run mode for workflow validation.

**software-docs-minion** identified the need for a new `auto-investigation.md` ops doc, YAML frontmatter on runbooks for programmatic mapping, and cross-referencing in the ops-runbook skill.

## Phase 3: Synthesis -- The Key Conflict

The synthesis phase produced the most important decision: **overriding iac-minion's separate Worker recommendation** in favor of routing on the existing Worker.

The argument:

1. The Stripe webhook at `POST /v1/stripe/webhook` already does exactly what the Coralogix handler needs: bypass middleware auth, verify a shared secret internally, dedup via KV, fire-and-forget side effects via `ctx.waitUntil`. This pattern works and is tested.

2. The middleware mismatch argument was overstated. The fetch handler's auth gates check path prefixes (`/v1/admin/`, `/v1/account/`, `/v1/billing/`, `/v1/captures`). A route at `/v1/webhooks/coralogix` falls through cleanly.

3. A separate Worker means: separate wrangler.toml, separate staging env, separate deploy pipeline, separate DNS record, separate 1Password item. For ~80 lines of handler code, this is over-engineering.

Other synthesis decisions:
- Minimal labels (6 alert + 1 meta) over devx-minion's full taxonomy
- Resolve webhooks acknowledged but not dispatched (no investigation on resolve)
- Deferred public-facing documentation updates until the system proves itself

## Phase 3.5: Architecture Review

5 reviewers ran in parallel. Results: 2 APPROVE, 3 ADVISE, 0 BLOCK.

**security-minion** (ADVISE): 4 findings. Most impactful: GITHUB_DISPATCH_TOKEN should be `actions:write` only (not `contents:read+write`), and alert data should use structural delimiters in the investigation prompt. Both incorporated.

**margo** (ADVISE): Flagged resolve-to-GitHub-comment as over-scoped for MVP. This aligned with lucy's finding. The feature was deferred entirely -- resolve webhooks now return `{ received: true, dispatched: false, reason: 'resolve' }` with no GitHub interaction.

**lucy** (ADVISE): Flagged the resolve scope issue (same as margo) and noted the evolution log should explain why a [consider]-tier backlog item was activated now.

**test-minion** and **ux-strategy-minion**: Both APPROVE.

## Phase 4: Execution

8 tasks in 3 batches. Two gate approvals by Lucy.

**Batch 1** (parallel): Task 1 (webhook handler), Task 5 (email delivery failures runbook), Task 6 (YAML frontmatter on 8 runbooks). Task 6's agent corrected 3 event names from the task prompt against the authoritative `alerts.md` (e.g., `capture.quarantined` -> `threatcheck.quarantine`).

**Gate 1**: Lucy approved Task 1 with 2 ADVISE notes. The `hit_count` falsy coercion (`|| ''` drops `0`) was fixed to use nullish coalescing (`?? ''`).

**Batch 2** (parallel): Task 2 (GH Actions workflow), Task 3 (tests), Task 4 (provisioning). Task 2's agent corrected the claude-code-action interface (the plan used a template with `max_turns` and `result` output which don't exist in the actual v1 interface). The agent also improved prompt injection defense by writing alert data to a JSON file and having Claude read it, rather than interpolating `${{ }}` values into the prompt.

**Gate 2**: Lucy approved with 3 ADVISE notes. The heredoc indentation issue (leading whitespace would render as code blocks in GitHub Issues) was fixed immediately.

## Phase 5-6: Verification

**Code review** caught 2 critical bugs:

1. **`alert_action` value mismatch**: The handler validated for `'trigger'`/`'resolve'` but Coralogix sends `'triggered'`/`'resolved'` (past tense). Every production webhook would have returned 400. The tests passed because the fixtures used the handler's (wrong) values. Fixed in handler, tests, fixtures, and workflow `if` condition.

2. **Wrong alert name in tests**: Tests used `[WRL] Worker Errors` but the allowlist has `[WRL] Worker Errors (5xx)`. Dedup tests would have tested the filter path instead of the dedup path. Fixed.

Additional findings fixed:
- Duplicate evolution directory (`0105-auto-investigate-alerts` vs `0105-auto-investigate-coralogix-alerts`) -- removed
- Out-of-scope changes to landing/site Workers -- reverted
- outcome.md described HMAC-SHA256 auth and 429/502 responses -- corrected to Bearer token and always-200

**Tests**: All 1665 tests pass (including 22 new webhook tests). Zero failures after fixes.

## What was NOT changed

- **timingSafeEqual duplication**: Now exists in 3 files (auth.js, stripe-webhook.js, coralogix-webhook.js). Code review flagged this but it matches codebase convention. Not refactored -- that's separate work.
- **Timing leak on length mismatch**: The `if (aBytes.byteLength !== bBytes.byteLength) return false` pattern leaks length info. Same pattern in auth.js. Not fixed -- codebase-wide issue, low practical risk for shared secrets.

## Where to read more

- Full specialist contributions: scratch directory (ephemeral, no longer available)
- Evolution log: `docs/evolution/0105-auto-investigate-coralogix-alerts/`
- Operator documentation: `docs/operations/auto-investigation.md`
- PR: benpeter/web-resource-ledger#263
