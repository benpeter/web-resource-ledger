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

**wrangler.test.toml**: If you modify `wrangler.toml` (new bindings, changed
rate limits, new queues), regenerate `wrangler.test.toml` by copying
`wrangler.toml` and removing all `[[queues.consumers]]` sections. Queue
consumers cause miniflare to auto-consume messages during tests, crashing
the workerd runtime. CI will fail if `wrangler.test.toml` is stale.

### Error Signaling

If an unrecoverable error occurs, output a line starting with
"AUTONOMOUS_ERROR:" so the orchestrator can detect it.

### Backlog Updates

After completing the phase, update docs/backlog.md:
- Mark the completed item as done (strikethrough)
- Move any deferred work to the parking lot
- Record changes in outcome.md
