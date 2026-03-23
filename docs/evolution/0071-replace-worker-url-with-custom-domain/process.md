# Process: Replace Worker URL with Custom Domain

## TL;DR

Mechanical URL replacement across 12 files, completed in one execution task with zero approval gates. The nefario orchestration's main value was the Phase 3.5 architecture review, which caught two items the plan missed: 4 additional openapi.yaml example URLs and a GitHub OAuth callback URL registration requirement. Total: 37 string replacements, 1 server entry removal, 80/83 tests passing.

## How the team worked

### Phase 1: The zero-specialist decision

Nefario's meta-plan recommended consulting 0 specialists — unusual for a nefario orchestration but defensible for a task with an explicit file list and mechanical success criterion. The meta-plan agent read all 12 target files to confirm scope before making the recommendation. Lucy reviewed and approved: "genuinely mechanical... a specialist would add overhead without improving the outcome."

This is the fastest meta-plan resolution in the project's history. No team adjustment rounds needed.

### Phase 2-3: Empty planning, direct synthesis

With no specialists, Phase 2 was a no-op and synthesis produced a single-task plan: one frontend-minion agent, bypassPermissions mode, all 12 files in a single pass. The plan included file-by-file instructions with line numbers drawn from the meta-plan agent's codebase analysis.

### Phase 3.5: Where the orchestration earned its keep

Five mandatory reviewers ran in parallel. Two found real issues:

**security-minion** identified that the GitHub OAuth App's callback URL allowlist would need `https://api.webresourceledger.com/auth/callback` added — an out-of-band infrastructure change that no code review or test would catch. The OAuth flow derives `redirect_uri` dynamically from `request.url.origin`, so once users arrive via the custom domain, GitHub rejects the callback unless it's registered. This would have caused silent login failures in production.

**test-minion** caught that the synthesis plan's openapi.yaml instructions only covered the legacy server entry (lines 16-17) but missed 4 additional occurrences in webhook event example values (lines 1028-1031). The grep verification would have caught these at runtime, but the agent would have had no instructions for how to handle them. lucy independently flagged the same issue.

**ux-strategy-minion** approved and noted that the migration "strictly reduces cognitive load" — the custom domain is self-describing while the workers.dev URL leaks infrastructure.

**margo** approved: "right-sized for the problem."

### Phase 4: Execution

Single batch, single agent, no gates. frontend-minion completed all replacements and ran verification. The grep returned 0 matches. The test suite showed 80/83 passing with 3 pre-existing failures from a missing `asn1js` dependency in the worktree environment.

### Post-execution: Clean pass

Code review (lucy + margo) both APPROVE. Both independently verified staging URLs were untouched, exclusion rules respected, and no files outside the approved list were modified. Documentation assessment found 0 actionable items since docs/mcp.md was updated as part of the execution task.

## Where agents disagreed

No disagreements. The task was sufficiently mechanical that all agents converged on the same assessment. The only "disagreement" was between the plan (which missed openapi.yaml example URLs) and two reviewers who caught the gap — but this was a factual correction, not a judgment call.

## Human interventions

None. This ran in fully autonomous mode with Lucy serving as the gate decision-maker.

## What was deliberately left alone

- **Staging URLs** (`wrl-staging.benpeter.workers.dev`) — kept per issue instructions, pending a future staging subdomain
- **Historical records** (`docs/history/`, `docs/evolution/`) — immutable build diary
- **GitHub OAuth callback registration** — flagged by security-minion as out-of-band follow-up, not a code change

## Where to read more

- Meta-plan and all phase outputs: `docs/history/nefario-reports/2026-03-23-045435-replace-worker-url-with-custom-domain/`
- Evolution log: `docs/evolution/0071-replace-worker-url-with-custom-domain/`
