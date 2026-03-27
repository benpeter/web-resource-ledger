# Phase 0100: Honest Positioning Update

## Task

Update the README, landing page, and docs comparison page to implement WRL's
honest positioning strategy. Acknowledge where WRL is not the best choice,
give proper credit to competitors,
update stale status copy, and add an "About / How WRL Was Built" docs page.

## Source

Implementation brief from Obsidian vault:
`Projects/Web Resource Ledger/Implementation Brief - Honest Positioning.md`

All copy was finalized in the brief. This was a verbatim implementation task,
not a creative/editorial task.

## Scope

- README: status block, AI-built disclosure, roadmap (all acts complete),
  "How WRL Was Built" section replacing "Built with despicable-agents",
  remove despicable badge
- Landing page: WACZ attribution to Webrecorder, comparison table new rows
  (Social Media, Bulk Monitoring, Expert Witness), competitor links in thead,
  new "When to Use Something Else" section, eIDAS status update
- Docs comparison page: new rows (4), competitor links, updated Webrecorder
  note, Wayback scale update, "When to Use Something Else" section with 8
  alternative recommendations, updated intro and description
- New docs page: `about.md` ("How WRL Was Built")
- Docs nav: added "How It Was Built" to Reference section

## eIDAS Prerequisite

Checked production secrets -- `QUALIFIED_TSA_AUTH` does NOT exist.
Applied conditional eIDAS changes:
- Landing page features: "Code complete, production rollout pending"
- Docs comparison table: badge--skip "Implemented (not yet live)"
