# Phase 0013: Process

## TL;DR

Four specialists planned a README restructure in parallel; strong consensus on information architecture (positioning -> usage -> setup) with five conflict resolutions on details (placeholder hostname, step count, badge set, env var naming, section placement). One execution agent wrote the README. Six reviewers (5 mandatory + 1 discretionary) produced 0 blocks and 3 advisories (all incorporated). Single file changed, 193 lines, all 321 tests pass.

## Phase 1: Meta-Plan

Nefario identified four planning specialists for this task:

- **devx-minion** -- curl examples and developer onboarding flow (the most technically demanding element)
- **product-marketing-minion** -- positioning statement and value proposition (the most subjective element)
- **user-docs-minion** -- information architecture and content preservation (the structural element)
- **ux-strategy-minion** -- cross-cutting journey coherence review (ensuring the three contributions form a coherent experience)

Deliberately excluded: security-minion (documenting an existing secret, not introducing new attack surface), software-docs-minion (no architecture changes), api-spec-minion (openapi.yaml out of scope), frontend-minion (no code), test-minion (no testable output).

The exclusion rationale was sound -- this is a single-file documentation task. Margo later noted (Phase 3.5) that even 6 reviewers was disproportionate for a markdown file. Fair point, but the plan's content included security-sensitive documentation (CAPTURE_API_KEY setup) and positioning decisions that anchor future documentation.

## Phase 2: Specialist Planning

All four specialists ran in parallel. Key contributions:

**devx-minion** argued for a single numbered walkthrough with 4 steps (capture, poll, retrieve, verify), `$WRL_API_KEY` as the user-facing env var, explicit auth asymmetry callout, and happy-path-only examples. The strongest insight: the async API (202 -> poll -> retrieve) is a three-step operation that developers need to understand separately. Combining poll+retrieve would hide the async nature and cause confusion when copy-pasting.

**product-marketing-minion** produced a competitive analysis against 8 alternatives and a three-sentence positioning structure: (1) what+why, (2) concrete outputs, (3) self-hosted differentiator. Mapped the landscape and identified WRL's unique combination: self-hosted + open-source + API-first + signed WACZ + public verification. Flagged the legal admissibility overpromise risk -- WRL has self-asserted timestamps, not TSA-backed ones. Recommended "prove" over "legally admissible."

**user-docs-minion** recommended replacing the terse API section with a full Usage section, moving Key Rotation and Public Key Endpoint to a Reference section, and cross-referencing CONTRIBUTING.md instead of duplicating local dev instructions. Flagged a concrete gap: no `.dev.vars.example` file exists. This was noted but deferred as out of scope.

**ux-strategy-minion** diagnosed the current README as a "catastrophic information architecture" -- 91 lines of infrastructure commands before any API indication. Proposed progressive disclosure with a bridge paragraph to resolve the "show first vs. set up first" tension. Set a hard budget of 50 lines for usage examples. Identified the auth asymmetry as a UX asset to surface, not hide.

No specialist recommended additional agents.

## Phase 3: Synthesis

Nefario resolved five conflicts:

1. **Placeholder hostname** (`wrl.example.com` vs `$WRL_URL`): devx-minion won. Consistency with openapi.yaml matters; two env vars is one too many for onboarding.

2. **Usage steps** (3 vs 4): devx-minion won. The async API makes poll a distinct step. This was the clearest technical decision -- the UX argument for fewer steps didn't account for the API's actual behavior.

3. **Badge set** (3 vs 4): Task requirements dictated. Dropped Node version badge in favor of the two required project badges (despicable, vibe-coded).

4. **"What you get" section** (include vs skip): product-marketing-minion won. The 7-line bullet list communicates value faster than curl output. ux-strategy-minion's concern about pushing Usage below the fold was mitigated by the section's brevity.

5. **Env var naming** (`$WRL_API_KEY` vs `$CAPTURE_API_KEY`): devx-minion won. User-facing name follows `{PRODUCT}_{TYPE}` convention; explicit bridge sentence prevents confusion.

The synthesis produced a single-task plan with one approval gate. This is appropriate -- it's a single-file change, but the information architecture anchors all future documentation.

## Phase 3.5: Architecture Review

Six reviewers (5 mandatory + user-docs-minion discretionary):

- **security-minion**: ADVISE. Three advisories: (1) use exactly `openssl rand -hex 32` for key generation, (2) distinguish verify URL (safe to share) from capture ID (full access), (3) repeat `.dev.vars` security warning per secret section. All incorporated into the execution prompt.

- **test-minion**: APPROVE. Markdown-only change, nothing to test beyond existing CI.

- **ux-strategy-minion**: APPROVE. Endorsed the plan including the two resolutions where their recommendations were overruled.

- **lucy**: ADVISE. Flagged that no evolution log directory was assigned. This was the most valuable advisory -- the plan correctly scoped to README.md but didn't account for the CLAUDE.md evolution log requirement. Handled during wrap-up.

- **margo**: ADVISE. Noted the 300-line task prompt was longer than the 200-line deliverable, and six reviewers were disproportionate for a markdown file. Both fair observations; neither actionable within the orchestration's mandatory reviewer set.

- **user-docs-minion**: APPROVE. Validated the documentation hierarchy (README -> CONTRIBUTING.md, README -> openapi.yaml).

## Phase 4: Execution

Single task: devx-minion (sonnet) wrote the README using the synthesized plan with all advisories incorporated. The agent read all five reference files, produced a 193-line README matching the target structure exactly.

## Human Interventions

This orchestration ran with all approvals pre-granted ("all approvals granted, don't stop for compactions, churn right through it while I sleep"). No human review occurred at any gate. The team approval gate, reviewer approval gate, execution plan approval gate, and task approval gate were all auto-approved.

This means the positioning statement, curl examples, and CAPTURE_API_KEY documentation were not human-reviewed before commit. The approval gate was MUST-class (hard to reverse, high blast radius) -- in a typical run, the human would have reviewed the README draft before it was committed.

## What Was Deliberately Left Alone

- The `.dev.vars.example` gap flagged by user-docs-minion: deferred, issue scope is README.md only
- Margo's observation about prompt length: the prompt's specificity came from four specialists' planning; shortening it would lose the nuance
- The reviewer count: mandatory reviewers are non-negotiable by design

## Where to Read More

Full specialist contributions, synthesis plan, reviewer verdicts, and execution prompt are in the nefario report's companion directory under `docs/history/nefario-reports/`.
