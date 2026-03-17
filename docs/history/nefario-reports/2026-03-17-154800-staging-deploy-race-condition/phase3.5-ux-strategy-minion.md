# UX Strategy Review — staging-deploy-race-condition

**Verdict: ADVISE**

The plan is structurally sound for the operator persona (solo developer operating a deploy pipeline). The core mental model shift — from "push triggers two concurrent workflows" to "push triggers staging, which chains to production" — is clear and well-justified. Two documentation issues need attention before execution.

---

- [usability]: The rollback doc update (OPERATIONS.md Task 2, item 4) clarifies staging-smoke behavior but does not update the critical warning on line 62 that says "the next push to main re-deploys whatever is on main" — this warning is now more consequential, because a push to main now triggers the full two-stage chain, not just production. An operator reading the rollback section needs to understand that reverting a rollback requires a revert commit, otherwise the next push triggers staging AND production redeploy.
  SCOPE: OPERATIONS.md — Rollback > Option A > second Warning block (line 62)
  CHANGE: Add a sentence clarifying that "the next push to main" now triggers the full staging-then-production chain, not just production directly. The existing text is accurate but understates the consequence in the new model.
  WHY: An operator under incident pressure who reads "the next push re-deploys whatever is on main" may not realize they are also triggering a full staging redeploy and a staging smoke test before production. The mental model mismatch during a live incident is high-severity friction.
  TASK: 2

- [usability]: The Task 2 prompt instructs user-docs-minion to add "Manual (CLI): wrangler deploy --env staging for emergency bypass (does NOT trigger production pipeline)" to the new "Deploy to Staging" section. However, CONTRIBUTING.md already documents wrangler deploy --env staging as the standard manual staging method (line 49), without the "emergency bypass" framing. The two docs will describe the same command with different frames — CONTRIBUTING.md treats it as normal, OPERATIONS.md would treat it as exceptional.
  SCOPE: OPERATIONS.md new "Deploy to Staging" section (Task 2, item 2) and CONTRIBUTING.md "Staging & Deployment" section (Task 2, item 5)
  CHANGE: Align the framing. In OPERATIONS.md, label the wrangler CLI path as "bypass (skips the production chain)" rather than "emergency bypass." In CONTRIBUTING.md, note that the wrangler CLI path does not trigger the production pipeline. This gives operators a consistent mental model: CLI = staging only, Actions = staging + production chain.
  WHY: Inconsistent framing of the same command across two docs forces the operator to reconcile conflicting mental models. The cognitive cost is low in calm conditions but high during incident response, when operators satisfice on the first doc they open.
  TASK: 2
