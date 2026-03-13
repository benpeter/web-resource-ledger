# 0004: Backlog Extraction Decisions

## Format: Flat Markdown, Not GitHub Issues

- **Decision**: Single `docs/backlog.md` with items grouped by domain, one line per item, tier tag in brackets.
- **Why**: GitHub issues impose overhead (templates, labels, triage) that's premature when zero items are ready for implementation. A flat markdown file is grep-friendly, diff-friendly, and requires no tooling. Items graduate to GitHub issues when they enter active planning.
- **Rejected**: GitHub issues (too unstructured at this stage, creates noise in the issue tracker), YAML/frontmatter per item (over-engineered for a list), separate file per item (file proliferation for one-line entries), GitHub Projects board (requires UI interaction, not maintainable from the CLI).

## Three Tiers, Not Two or Five

- **Decision**: Must-have / should-have / consider. Three tiers.
- **Why**: Two tiers (in/out) lose the signal from specialist consensus -- "strong agreement it's needed but not committed" is meaningfully different from both "committed" and "maybe." Five tiers (MoSCoW or similar) create false precision when the items haven't been scoped or estimated. Three tiers match the actual confidence levels found in the source material.
- **Rejected**: MoSCoW (won't-have is redundant -- if it's not in the backlog, it's not tracked), two tiers (loses the middle ground), numeric priority (implies ordering that doesn't exist).

## Group by Domain, Not by Source Phase

- **Decision**: Items grouped by functional domain (Security, API, Capture, etc.), not by the phase that generated them.
- **Why**: When working on a feature, you want to see all related deferred items together. "What security work is outstanding?" is a useful question. "What did phase 0001 defer?" is a less useful question once the backlog exists -- that information is preserved in the source references.
- **Rejected**: Chronological grouping (useful for archaeology, not for planning), flat unsorted list (unusable at 50+ items).

## Backlog Updates as Evolution Log Rule (revised)

- **Decision**: Add backlog review as rule #4 in the Evolution Log Rules
  (CLAUDE.md), triggered at the same "after a phase" checkpoint as
  `outcome.md`. Each `outcome.md` gets a "Backlog changes" section
  documenting what was added, removed, or re-tiered.
- **Why**: The initial recommendation was "no convention, wait for evidence."
  The evidence arrived immediately: 50 items with clear provenance after
  only 3 phases (25% into MVP). The backlog is already load-bearing --
  it captures specialist consensus that would otherwise be buried in
  nefario reports. Piggyback on the existing outcome.md checkpoint rather
  than creating a new ceremony.
- **Rejected**: Standalone backlog review step (creates a separate ceremony
  that can be skipped), skill for backlog maintenance (over-engineering a
  text file), GitHub issue auto-sync (premature tooling).
