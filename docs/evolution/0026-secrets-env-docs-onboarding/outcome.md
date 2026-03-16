# Outcome: 0026 Secrets and Environment Documentation for Fork-Ready Onboarding

## What changed

### OPERATIONS.md

Two new sections added:

**Secret Surfaces** (new section, ~10 lines + table): Explains the three distinct surfaces where WRL secrets live -- Worker runtime (set via `wrangler secret put`), GitHub environment (set via Repo Settings > Environments), and local dev (`.dev.vars`). Includes a table with "Set via," "Used by," and "Persists across deploys?" columns. Adds an explicit callout block: "The CD pipeline deploys code only. Worker runtime secrets must be set once via `wrangler secret put` and persist across all subsequent deploys." Cross-references README steps 4-7 for generation commands.

**Cloudflare API Token Permissions** (new subsection under Secret Surfaces, ~10 lines): Lists the five exact IAM permissions required when creating the Cloudflare API token used by GitHub environment secrets. Includes a caution not to use the broad "Edit Cloudflare Workers" template. Referenced from both the `production` and `staging` GitHub Environment Setup tables via anchor links.

The GitHub Environment Setup tables (already present from phase 0024) now cross-reference the new Cloudflare API token section via anchor link rather than leaving permission requirements implicit.

### README.md

Two targeted expansions within the existing Setup section structure:

**Step 3 (Create R2 bucket)**: Added a staging note immediately after the production bucket creation commands. The note explains that `[env.staging]` requires its own infrastructure -- a staging KV namespace and staging R2 bucket -- and provides the two commands to create them, including the `wrangler.toml` update step for the staging KV ID. This was undocumented: a fork developer following step 3 would create production infrastructure but miss the staging prerequisite entirely.

**Step 9 (Deploy)**: Added a bridge paragraph after the `wrangler deploy` command. The paragraph states that steps 1-9 are one-time setup, that the CD pipeline handles subsequent deploys automatically, and directs the developer to OPERATIONS.md for the full picture (deploy flow, environment configuration, rollback procedures, and how secrets map across the three surfaces).

No section headings were renamed. No steps were merged or reordered. The 9-step structure is unchanged.

## What was deferred

**README restructuring (Miller's Law consolidation)**: ux-strategy-minion recommended merging the 9 steps to 5 by grouping related steps (2-3 as one, 4-7 as one). Deferred: the current structure works for the existing operator; restructuring increases review surface and risk relative to the fork-readiness benefit delivered by targeted expansions. Condition: second operator reports onboarding confusion with the step structure.

**Fork setup checklist**: ux-strategy-minion recommended a sequenced checklist document specific to the forking scenario (replace IDs, create infrastructure, configure GitHub environments, verify pipeline). Deferred: would require significant README restructuring to avoid duplication. The staging section expansion and step 9 bridge accomplish the minimum viable version. Condition: second operator forks and reports setup confusion the expanded sections did not address.

**CONTRIBUTING.md alignment**: CONTRIBUTING.md's local dev setup section may not reflect the full three-surface context added in this phase. Out of scope -- CONTRIBUTING.md is for contributors running `wrangler dev`, not operators configuring CD. Review when CONTRIBUTING.md is next touched.

**wrangler.toml comment for production KV ID**: The `wrangler.toml` has no inline comment explaining that the top-level `kv_namespaces` ID is production (not staging). A fork developer replacing IDs may be confused about which stanza is which. Adding a comment is a two-line change but touches application configuration -- deferred to avoid scope creep in a documentation phase.

**Cross-document link lint in CI**: Anchor links from OPERATIONS.md into README.md headings break silently when headings change. Deferred: adding markdown-link-check or lychee to CI is a meaningful improvement but out of scope here. Condition: cross-document link rot observed.

## Backlog changes

**Added to Operations parking lot:**
- `[consider] Fork setup onboarding checklist` -- trigger: when a second operator forks and reports setup confusion. Source: ux-strategy-minion, this phase.
- `[consider] Cross-document anchor link lint in CI` -- trigger: when cross-document link rot is observed. Source: software-docs-minion, this phase.

**No items marked done.** This phase is documentation-only; no backlog issues were resolved.

## Surprises and deviations

**Staging infrastructure gap was larger than expected.** The original brief identified "staging infrastructure creation was undocumented" as one of four gaps. On inspection, the staging commands did exist in README (under the Development section, not Setup), but were scattered and not framed as a CD prerequisite. The fix required moving context into step 3 (Setup) rather than just adding a note to the Development section -- a deviation from "add a note" to "reorganize where the staging content lives relative to setup flow."

**No structural surprises in OPERATIONS.md.** The Secret Surfaces and Cloudflare API Token Permissions sections slotted cleanly after the Manual Deploy section, before the GitHub Environment Setup tables. The resulting document reads linearly: monitoring, deploy flow, rollback, manual emergency bypass, then secret management topology, then environment configuration reference.
