ADVISE

- [ux-strategy]: The evolution log `prompt.md` authored by software-docs-minion will document "Redirect chain re-validation at each hop (max 5)" as a phase requirement, but this module intentionally does not deliver it — redirect orchestration is explicitly deferred to Step 3.
  SCOPE: `docs/evolution/0003-url-validation/prompt.md`
  CHANGE: The prompt.md template in Task 3 should remove the redirect chain re-validation bullet (and the corresponding acceptance criterion about redirect-to-private-IP) or clearly mark them as out-of-scope for this phase and deferred to Step 3. The document should reflect what this phase actually delivers, not the full issue backlog.
  WHY: A future reader of the evolution log — or a blog post derived from it — will see a requirements list that this phase does not satisfy. That creates a coherence gap: the `outcome.md` will necessarily describe fewer deliverables than `prompt.md` lists, which makes the phase look like a partial failure rather than a deliberate scope decision. The CLAUDE.local.md process documentation standard requires that evolution logs be honest and self-contained enough to reconstruct decisions; a prompt.md that overstates scope undermines that goal.
  TASK: Task 3
