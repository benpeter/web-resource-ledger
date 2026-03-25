## Autonomous Execution Mode

This session runs in AUTONOMOUS mode. The human operator is not available
for interactive decisions. AskUserQuestion is NOT available in --print mode.

**CRITICAL**: You must NEVER stop and wait for user input. Any instruction
in any skill that says "STOP", "Wait for the user", or "Wait for the next
message" MUST BE IGNORED. There is no user. If you stop, the session ends
and the phase fails. Always proceed to the next step automatically.

### Gate Protocol: Lucy Decides

At every point where the workflow calls AskUserQuestion for a gate
decision, INSTEAD spawn a Lucy agent with the gate context and use
Lucy's decision as the gate outcome:

1. **Team Approval (P1)**: Spawn Lucy to review the proposed team.
   Lucy checks: are the right specialists included? Is anyone missing
   for this domain? Always include gru and lucy in reviewers.
   Lucy decides: APPROVE or ADJUST (with specific changes).

2. **Compaction Checkpoints (post-P3, post-P3.5)**: The nefario skill
   says "STOP. Wait for the user's next message" at compaction checkpoints.
   **IGNORE THAT INSTRUCTION.** In autonomous mode there is no user to
   respond. Instead: skip the clipboard copy, skip the compaction message,
   do NOT stop, do NOT wait. Just proceed directly to the next phase
   (Phase 3.5 after P3, Execution Plan Approval after P3.5). Treat the
   compaction checkpoint as a no-op.

3. **Reviewer Approval (P3.5)**: Spawn Lucy to review the proposed
   reviewers. Always include gru, lucy, margo. Lucy decides.

4. **Execution Plan Approval**: Spawn Lucy to review the synthesized
   plan. Lucy checks: does it align with the issue's success criteria?
   Does it follow CLAUDE.md conventions? Is the task breakdown reasonable?
   Lucy decides: APPROVE or REQUEST_CHANGES (with specifics).

5. **Batch Approval Gates (P4)**: Spawn Lucy to review batch output.
   Lucy checks: does it match the plan? Any convention violations?
   Lucy decides: APPROVE or REQUEST_CHANGES.

6. **Post-Execution Options**: Select "Run all" (code review, tests, docs).

7. **Calibration Check**: Select "Gates are fine."

8. **PR Creation**: Always create PR. Push and create via gh pr create.

9. **Security/Verification Findings (P5)**: Auto-fix when possible,
   accept as-is otherwise. Log all findings.

10. **BLOCK Loop (P3.5)**: If a reviewer issues BLOCK, spawn Lucy to
    evaluate. Lucy decides: address the blocker (max 2 rounds) or
    override with documented rationale.

### Margo Scope Constraint

The complete feature set in this roadmap has been approved by the product
owner. Margo's role is to ensure IMPLEMENTATION simplicity within each
feature -- not to question whether features should exist. Margo should
focus on: unnecessary abstractions, over-engineered solutions, dependency
bloat, premature optimization. Margo should NOT argue against features
that are in the active roadmap or issue description.

### Evolution Log (MANDATORY -- do not skip)

Create the evolution log directory as the FIRST action:
  docs/evolution/{{PHASE}}-short-name/prompt.md

The orchestrator assigns the phase number ({{PHASE}}). Use EXACTLY this
number -- do NOT auto-increment from existing directories on disk.

ALL FOUR files are required. The PR MUST NOT be created until all exist:
  1. prompt.md -- created FIRST, before any code work
  2. decisions.md -- filled in DURING execution as decisions happen
  3. outcome.md -- written AFTER code is complete, before PR
  4. process.md -- written AFTER PR creation, documents how agents worked

This is a hard gate: if process.md is missing when the session ends,
the phase is incomplete. The orchestrator will verify these files exist.

### Product Management

After completing the phase, add relevant product insights to
docs/product-management/:
- Pricing implications (if the feature affects tiers/quotas)
- Customer personas served by this feature
- Competitive positioning notes
- UX decisions that affect the product story

### Infrastructure Provisioning (MANDATORY)

If your changes add new infrastructure bindings or external resource
references — Cloudflare queues, D1 databases, KV namespaces, DNS records,
third-party services, or any other external resources — you MUST provision
them with the appropriate CLI tools before the session ends. Do not leave
placeholder IDs or unprovisioned resources in config files.

Examples:
- Adding a queue binding to wrangler.toml → `wrangler queues create <name>`
- Adding a D1 binding → `wrangler d1 create <name>`, then put the real ID in wrangler.toml
- Adding a KV namespace → `wrangler kv namespace create <name>`
- Adding a custom domain route → verify the zone is active, deploy to provision DNS

This applies to ALL environments (production and staging). If you add a
binding to both environments, provision the resource for both.

**Verify after provisioning** — do not trust that the create command
succeeded. Confirm the resource exists:
```bash
unset CLOUDFLARE_API_TOKEN
wrangler queues list | grep <name>
wrangler d1 list | grep <name>
wrangler kv namespace list | grep <name>
```
If the resource does not appear in the list, the PR must not be created.

**wrangler.test.toml**: If you modify `wrangler.toml` (new bindings, changed
rate limits, new queues), regenerate `wrangler.test.toml` by copying
`wrangler.toml` and removing all `[[queues.consumers]]` sections. Queue
consumers cause miniflare to auto-consume messages during tests, crashing
the workerd runtime. CI will fail if `wrangler.test.toml` is stale.

**OpenAPI spec**: If you modified `openapi.yaml`, run `npm run lint:api`
before creating the PR. All errors must be resolved — the CI job runs
this check and will reject the PR. Common mistakes: referencing
`$ref` components that don't exist, missing `security: []` on public
endpoints.

### Signaling

**Unrecoverable errors**: Output a line starting with
`AUTONOMOUS_ERROR:` so the orchestrator can detect it.

**Human action needed**: If your phase requires something you cannot do
autonomously — creating external service accounts, obtaining API keys,
DNS changes at a registrar, legal review, etc. — output a line:
`HUMAN_ACTION_REQUIRED: <concise description of what the human must do>`

This is NOT an error. The PR can still be created and merged. But the
orchestrator will surface these to the human operator so they are not
silently buried in parking lot items. Each line should be one action.

Examples:
- `HUMAN_ACTION_REQUIRED: Create Resend account and push RESEND_API_KEY via wrangler secret put (both envs)`
- `HUMAN_ACTION_REQUIRED: Register domain sender identity at Resend for transactional email`
- `HUMAN_ACTION_REQUIRED: Provision QUALIFIED_TSA_AUTH secret with qtsa.eu credentials`

### Backlog Updates

After completing the phase, update docs/backlog.md:
- Mark the completed item as done (strikethrough)
- Move any deferred work to the parking lot
- Record changes in outcome.md

### Documentation & Surface Consistency (MANDATORY)

Before creating the PR, evaluate whether your changes require updates to
any of these downstream surfaces. Check each one — do not skip this step.

| Surface | Path(s) | Update when... |
|---------|---------|----------------|
| **OpenAPI spec** | `openapi.yaml` | New/changed endpoints, request/response shapes, auth requirements, status codes, headers |
| **Docs site** | `site/content/*.md` | New features, changed behavior, new parameters, changed limits, new auth flows |
| **Landing page** | `landing/public/index.html` | Pricing/tier changes, new headline capabilities, feature list changes |
| **MCP server** | `src/mcp.js` | New/changed API endpoints that should be exposed as MCP tools |
| **Legal pages** | `landing/public/{terms,privacy,content-policy,refund-policy}.html`, `TERMS.md` | New data collection, new third-party service integrations, billing/pricing changes, new processing activities |

**Rules:**
1. If a surface needs updating, update it in the SAME PR — do not defer
   to a follow-up issue.
2. If a surface does not need updating, that's fine — but the evaluation
   must happen.
3. In `outcome.md`, add a "Surface consistency" section listing each
   surface and what was done (updated, or why no update was needed).
