# Decisions -- Phase 0108

## Removed

- "Agent Framework" section. It told every session to use despicable-agents
  (gru, lucy, margo, nefario and the minions) for planning, scoping, review and
  implementation, and described the repo as a showcase for that framework.
- "Process Documentation" section. It required a `process.md` after every
  nefario orchestration that produced a PR. Without nefario there are no
  specialist debates or approval gates to narrate, so the rule has nothing to
  apply to.
- The nefario and despicable-prompter examples in "Precedence". The rule
  itself stays: skill workflows still run inside this file's requirements.

## Kept

- The evolution log and its rules. They never depended on the agent team.
  Every phase still gets `prompt.md`, `decisions.md` and `outcome.md`, a backlog
  review and an index entry.
- Engineering philosophy, logging, fail-loudly, boundary testing and the
  dashboard scoping rules. Same reason.
- History. Phases 0001 to 0107, their `process.md` files and
  `docs/history/nefario-reports/` describe how WRL was built and stay as they
  are. `site/content/about.md` and the README describe that past build, in the
  past tense, so they stay accurate.

## Not decided here

- `scripts/autonomous/` (the headless orchestrator and its issue specs) drives
  nefario sessions. It is not deleted in this phase; nothing runs it.
- `.planning/` holds the Capture Quality Push in a different planning framework
  (GSD). Whether that roadmap keeps its format is a separate decision.
