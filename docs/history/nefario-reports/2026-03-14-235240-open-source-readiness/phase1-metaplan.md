# Meta-Plan: Open-Source Readiness (Phase 0012)

## Task Summary

Execute steps 1-8 of the open-source readiness plan for web-resource-ledger.
The goal is baseline open-source hygiene: `.gitignore` cleanup, LICENSE completion,
`package.json` metadata, `.nvmrc`, CI workflow, CONTRIBUTING.md, SECURITY.md,
and CODE_OF_CONDUCT.md. Single PR against `main`.

## Planning Consultations

This task was already pre-planned with lucy, devx-minion, software-docs-minion,
and margo. The scope is tightly defined (8 concrete steps, explicit exclusions).
The planning question for each specialist is narrow -- confirming details and
catching edge cases rather than open-ended design.

### Consultation 1: CI Workflow Details

- **Agent**: iac-minion
- **Planning question**: The CI workflow spec says "minimal: checkout, setup-node (from .nvmrc), npm ci, npm test, npm run lint:api. No matrix, no coverage, no deploy." Given that the project uses `@cloudflare/vitest-pool-workers` (which runs tests in a Miniflare workerd environment), are there any Node.js or OS constraints for GitHub Actions? Should the workflow pin `ubuntu-latest` or specify a particular runner? Any known issues with Miniflare in CI that need workarounds (e.g., Node flags, timeout adjustments)?
- **Context to provide**: `package.json` (vitest + cloudflare vitest pool workers), `wrangler.toml`, existing test files in `test/` directory
- **Why this agent**: iac-minion owns CI/CD pipeline configuration and knows GitHub Actions runner quirks with Cloudflare tooling

### Consultation 2: CONTRIBUTING.md Content

- **Agent**: devx-minion
- **Planning question**: The CONTRIBUTING.md needs to explain: (1) prerequisites (Node 18+, npm), (2) that `npm test` is self-contained via Miniflare (no Cloudflare account needed for tests), (3) that `npm run dev` requires `.dev.vars` + Workers Paid plan for Browser Rendering, (4) "vanilla JS by design" philosophy with link to CLAUDE.md or Helix Manifesto. What else should a first-time contributor know? Should we mention the `npm run lint:api` command for OpenAPI spec validation? Any gotchas about the Cloudflare-specific test pool that contributors should be warned about?
- **Context to provide**: README.md (current setup instructions), `package.json` scripts, `.gitignore`, `wrangler.toml`, CLAUDE.md engineering philosophy
- **Why this agent**: devx-minion specializes in developer onboarding and making contribution paths clear

### Consultation 3: SECURITY.md and CONTRIBUTING.md Prose

- **Agent**: software-docs-minion
- **Planning question**: For SECURITY.md -- the spec says "supported versions (latest on main), report via GitHub Security Advisories, no bug bounty/SLAs." Should the doc explicitly state that only the latest commit on `main` is supported (no versioned releases yet)? Any standard phrasing for "no SLA on response time" that doesn't sound dismissive? For CONTRIBUTING.md -- should it link to the evolution log as context on how the project was built, or is that noise for contributors?
- **Context to provide**: README.md, existing `docs/evolution/README.md`, `docs/backlog.md`
- **Why this agent**: software-docs-minion crafts documentation that is both precise and contributor-friendly

## Cross-Cutting Checklist

- **Testing (test-minion)**: EXCLUDE from planning. Step 5 creates a CI workflow that runs `npm test` and `npm run lint:api`, but the tests already exist and pass. No new test code is being written. The CI workflow content is straightforward enough that iac-minion covers it. Phase 6 (post-execution test validation) will run the existing tests to confirm nothing broke.

- **Security (security-minion)**: EXCLUDE from planning. The only security-adjacent work is SECURITY.md content (step 7), which is a documentation task following a pre-defined spec. No attack surface is created, no auth/secrets handling changes. software-docs-minion can draft the prose. Phase 3.5 mandatory review will catch any security concerns.

- **Usability -- Strategy (ux-strategy-minion)**: INCLUDE -- but the planning question is lightweight given the task scope.
  - **Planning question**: These 8 files form the "contributor onboarding journey" -- someone discovers the repo on GitHub and decides whether to contribute. Is the ordering of information across README (existing), CONTRIBUTING.md, CODE_OF_CONDUCT.md, and SECURITY.md coherent? Any signals that a contributor would find confusing or off-putting? The README already exists and is not being modified in this phase.

- **Usability -- Design (ux-design-minion, accessibility-minion)**: EXCLUDE. No user-facing interfaces are created. All deliverables are markdown/YAML/JSON configuration files consumed by GitHub's platform UI or CI runners. No design decisions to make.

- **Documentation (software-docs-minion)**: INCLUDED as Consultation 3 above. CONTRIBUTING.md and SECURITY.md are documentation artifacts. user-docs-minion is excluded because these files target contributors/developers, not end users of the product.

- **Observability (observability-minion, sitespeed-minion)**: EXCLUDE. No runtime components, no production services, no web-facing code. CI workflow output is visible via GitHub's own UI.

## Anticipated Approval Gates

Given the task characteristics (all files are additive, easily reversible, no
downstream dependents within this plan, clear specifications), I anticipate
**zero blocking gates** for this plan.

Rationale for no gates:
- All 8 steps produce new files or modify configuration -- none are schema
  migrations, API contracts, or architectural decisions
- Every file is trivially reversible (delete or revert)
- The scope is already margo-approved and explicitly constrained
- No step's output blocks another step (all are parallel-eligible)
- The specifications are concrete enough that there's one obvious approach,
  not multiple valid alternatives requiring judgment

The Phase 3.5 architecture review (mandatory: security-minion, test-minion,
ux-strategy-minion, lucy, margo) serves as the quality gate before execution.

## Rationale

This is a well-scoped, pre-planned task with concrete specifications for each
step. The planning consultations focus on three areas where domain expertise
adds value:

1. **iac-minion**: CI workflow is the most technically nuanced step -- Miniflare
   in GitHub Actions has known quirks that a generic template won't cover.
2. **devx-minion**: CONTRIBUTING.md is the primary contributor touchpoint. Getting
   the developer experience right (what works without a Cloudflare account vs.
   what doesn't) prevents contributor frustration.
3. **software-docs-minion**: SECURITY.md and CONTRIBUTING.md prose quality matters
   for project credibility. Standard phrasings exist for common patterns.
4. **ux-strategy-minion**: Lightweight coherence check across the contributor
   journey files.

Agents NOT consulted for planning and why:
- **lucy, margo**: They are mandatory Phase 3.5 reviewers and will review the
  full execution plan. No additional planning input needed -- the scope was
  already approved by margo in the pre-planning phase.
- **test-minion, security-minion**: Covered by Phase 3.5 mandatory review.
  No new test code or security surface in scope.

## Scope

**In scope (steps 1-8)**:
1. `.gitignore` additions + clean tracked `.DS_Store` files
2. `LICENSE` appendix -- fill `[yyyy]` with `2025` and `[name of copyright owner]` with `Ben Peter`
3. `package.json` -- add `description`, `license`, `repository`, `author`, `engines`
4. `.nvmrc` with `18`
5. `.github/workflows/ci.yml` -- minimal CI
6. `CONTRIBUTING.md` -- short, practical
7. `SECURITY.md` -- minimal responsible disclosure
8. `CODE_OF_CONDUCT.md` -- Contributor Covenant v2.1
9. Evolution log entry `docs/evolution/0012-open-source-readiness/`
10. Update `docs/evolution/README.md` index
11. Update `docs/backlog.md` (CI/CD pipeline item marked done)

**Out of scope (margo-approved exclusions)**:
- ESLint / linting configuration
- Dependabot / dependency management
- Issue templates / PR templates
- CODEOWNERS file
- Release automation
- README.md changes
- Any runtime code changes

## External Skill Integration

No external skills detected in project. Scanned `.claude/skills/` and `.skills/`
relative to `/Users/ben/github/benpeter/web-resource-ledger/` -- neither directory
exists. User-global skills at `~/.claude/skills/` (obsidian-tasks, transcribe,
juli, nefario, despicable-prompter, etc.) are not relevant to this task domain.
