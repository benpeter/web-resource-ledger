## Precedence

**This file is the authority for this project.** Skill workflows (nefario,
despicable-prompter, etc.) have their own internal checklists and phases.
When a skill's workflow omits something that this file requires, the
requirement still applies. Skills do not override, shadow, or deprioritize
project instructions -- they operate within them.

If a skill's wrap-up sequence doesn't include a step that this file
mandates (e.g., evolution log entries), the calling session must add that
step. "The skill didn't tell me to" is not a valid reason to skip a
project requirement.

The same precedence applies to CLAUDE.local.md.

## Agent Framework

This project is built using [despicable-agents](../despicable-agents) --
a multi-agent orchestration framework with specialist agents (gru, lucy,
margo, nefario, and domain-specific minions). Use despicable-agents for
planning, scoping, code review, and implementation tasks.

This project serves a dual purpose: it is a real product **and** a showcase
of how despicable-agents can build software from scratch. Every decision,
prompt, and outcome is documented transparently so others can follow along.

## Evolution Log

Every significant development phase must be documented in `docs/evolution/`.
This is non-negotiable -- the build process is as much a deliverable as the
product itself.

### Structure

```
docs/evolution/
  README.md                          # index of all phases
  NNNN-short-name/
    prompt.md                        # the prompt or task briefing that initiated this phase
    decisions.md                     # key decisions made, alternatives considered, rationale
    outcome.md                       # what was produced, what changed, any surprises
```

### Rules

1. **Before starting a phase**: create the directory and write `prompt.md`
   with the exact prompt or task description.
2. **During a phase**: capture decisions in `decisions.md` as they happen --
   don't backfill from memory.
3. **After a phase**: write `outcome.md` summarizing what was built, what
   issues were created, and anything that deviated from the plan.
4. **Update the index**: add every new phase to `docs/evolution/README.md`.
5. **Number sequentially**: use zero-padded four-digit prefixes (0001, 0002, ...).
6. **Keep it honest**: include failed approaches and course corrections,
   not just the happy path.

### Process Documentation

After every nefario orchestration that produces a PR, write a `process.md`
in the phase's evolution log directory. This document narrates how the agent
team worked through the phase:

- Which specialists were consulted and why
- What each specialist argued and where they disagreed
- How conflicts were resolved in synthesis
- What the human changed at approval gates and why
- What the human chose NOT to intervene on and why
- Where to find the full specialist discussions (links to `docs/history/`)

The document should be specific enough to reconstruct the decision-making
process -- not a summary of outcomes (that's `outcome.md`) but a record of
how conclusions were reached. Include rejected alternatives, the arguments
for and against, and what tipped the decision.

Write it after PR creation, before the orchestration session ends.

## Engineering Philosophy

This project follows the [Helix Manifesto](https://github.com/adobe/helix-home/blob/main/manifesto.md).
Key principles that apply to all work here:

- **YAGNI** -- don't build it until you need it. No speculative features.
- **KISS** -- simple beats elegant. If it's hard to explain, it's too complicated.
- **Lean and Mean** -- minimize code and dependencies actively. Fewer lines, fewer deps, fewer moving parts.
- **Ops reliability wins** -- simple, fast, and up beats elegant.
- **More code, less blah, blah** -- prioritize working code and commits over lengthy discussion.
- **Intuitive, Simple & Consistent** -- in that priority order.
- **Latency is not an option** -- uncached things are fast. <300ms fast. Always.
- **Prefer lightweight, vanilla solutions** -- vanilla JS/CSS/HTML over frameworks
  unless a framework adds specific, demonstrable value.
  Don't default to React, Vue, Tailwind CSS, jQuery, etc. just because they're popular.
  Always ask: "What does this dependency give me that I can't do simply without it?"

