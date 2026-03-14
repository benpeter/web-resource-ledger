# Phase 3: Synthesis -- Open-Source Readiness

## Delegation Plan

**Team name**: open-source-readiness
**Description**: Bring web-resource-ledger to baseline open-source hygiene: .gitignore, LICENSE, package.json metadata, .nvmrc, CI, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md. Single PR against main.

### Task 1: All file changes (Steps 1-8)
- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are implementing all 8 steps of the open-source readiness plan for web-resource-ledger, a Cloudflare Workers project that captures and archives web resources as cryptographically signed WACZ bundles.

    The repo is at `/Users/ben/github/benpeter/web-resource-ledger`. Work on a new branch `nefario/open-source-readiness` off `main`.

    ## Step 1: Fix .gitignore

    Current `.gitignore` contents:
    ```
    CLAUDE.local.md

    # Dependencies
    node_modules/

    # Wrangler local state
    .wrangler/

    # Local secrets
    .dev.vars
    ```

    Add these entries (grouped with comments):
    ```
    # OS files
    .DS_Store

    # Editor config
    .vscode/
    .idea/

    # Logs
    *.log

    # Environment
    .env
    ```

    Then remove the three tracked `.DS_Store` files from git tracking (without deleting them from disk):
    ```bash
    git rm --cached .DS_Store docs/.DS_Store docs/evolution/.DS_Store
    ```

    ## Step 2: Fix LICENSE

    The LICENSE file has Apache 2.0 with placeholder text in the appendix (line 189):
    ```
    Copyright [yyyy] [name of copyright owner]
    ```

    Replace with:
    ```
    Copyright 2025 Ben Peter
    ```

    Use 2025 because that is when the project was created (first commit). Do NOT change any other part of the LICENSE file.

    ## Step 3: package.json metadata

    Add these fields to `/Users/ben/github/benpeter/web-resource-ledger/package.json`. Do not remove or change any existing fields.

    ```json
    {
      "description": "Tamper-evident archival of web resources with cryptographic signing",
      "license": "Apache-2.0",
      "repository": {
        "type": "git",
        "url": "https://github.com/benpeter/web-resource-ledger.git"
      },
      "author": "Ben Peter",
      "engines": {
        "node": ">=20.0.0"
      }
    }
    ```

    The `engines` field is `>=20.0.0` (not >=18) because wrangler 4.73.0 requires Node >=20.0.0.

    ## Step 4: Create .nvmrc

    Create `/Users/ben/github/benpeter/web-resource-ledger/.nvmrc` with a single line:
    ```
    22
    ```

    This is Node 22 LTS (not 18) because wrangler 4.73.0 requires >=20, and Node 22 is the current LTS through October 2027. Node 20 exits LTS maintenance in April 2026.

    ## Step 5: Create CI workflow

    Create `/Users/ben/github/benpeter/web-resource-ledger/.github/workflows/ci.yml`:

    ```yaml
    name: CI

    on:
      push:
        branches: [main]
      pull_request:
        branches: [main]

    permissions:
      contents: read

    jobs:
      test:
        runs-on: ubuntu-latest
        timeout-minutes: 10
        steps:
          - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
          - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
            with:
              node-version-file: '.nvmrc'
              cache: 'npm'
          - run: npm ci
          - run: npm test
          - run: npm run lint:api
    ```

    Design decisions (from iac-minion):
    - Single job: splitting into parallel jobs adds ~30s overhead each; sequential steps are faster for this project size
    - `cache: 'npm'`: built into actions/setup-node, keys on package-lock.json hash
    - `permissions: contents: read`: principle of least privilege
    - Actions pinned to full commit SHAs with version comments for security
    - `timeout-minutes: 10`: prevents runaway jobs (default is 360 min)
    - No matrix, no coverage, no deploy -- Margo-approved scope only

    IMPORTANT: Before committing, verify these are the latest stable SHAs for actions/checkout v4 and actions/setup-node v4 by checking their GitHub releases. If the SHAs above are outdated, update them. The format is `uses: org/repo@<full-40-char-sha> # vX.Y.Z`.

    ## Step 6: Create CONTRIBUTING.md

    Create `/Users/ben/github/benpeter/web-resource-ledger/CONTRIBUTING.md`.

    Target: under 150 lines of markdown, readable in under 5 minutes.

    Structure (in this order):

    ### 1. Opening
    One sentence: "Thank you for considering contributing to Web Resource Ledger."

    ### 2. Quick Start
    ```bash
    git clone https://github.com/benpeter/web-resource-ledger.git
    cd web-resource-ledger
    npm install
    npm test
    ```
    Emphasize: this works immediately, no accounts needed. The test suite is fully self-contained via Miniflare's simulated Workers runtime.

    ### 3. Full Local Development (optional)
    Frame as optional. Requires:
    - Cloudflare Workers Paid plan with Browser Rendering
    - `.dev.vars` file with `SIGNING_KEY` and `CAPTURE_API_KEY`
    - Then `npm run dev`

    Keep this short -- the README already covers detailed Cloudflare setup.

    ### 4. Running Tests
    Brief section covering key gotchas for contributors:
    - Tests run in `@cloudflare/vitest-pool-workers`, not plain Node.js
    - Import `SELF`, `env`, `fetchMock` from `cloudflare:test`, not from `vitest`
    - `isolatedStorage: false` is deliberate -- do explicit cleanup in `beforeEach`
    - Test signing keys are auto-generated at load time (no key setup needed)
    - `fetchMock` required for tests with outbound HTTP calls (`activateFetchMock()` / `deactivate()` pattern)

    Keep each gotcha to 1-2 sentences. Do not write a testing tutorial.

    ### 5. Design Philosophy
    Direct paragraph:
    > This project uses vanilla JavaScript with zero frontend frameworks. This is intentional -- not a gap waiting to be filled. PRs that introduce frameworks (React, Vue, Tailwind, jQuery, etc.) or transpilation steps (TypeScript, Babel) will be declined. If you think a dependency is warranted, open an issue first to discuss.

    Link to the [Helix Manifesto](https://github.com/adobe/helix-home/blob/main/manifesto.md). Mention YAGNI and KISS as core principles.

    ### 6. Making Changes
    - Branch from `main`
    - Small, focused PRs
    - Include tests for new features; regression tests for bug fixes
    - Conventional commit messages (e.g., `feat:`, `fix:`, `chore:`)

    ### 7. If You're Changing the API
    Short section: run `npm run lint:api` against `openapi.yaml`. CI runs this automatically, but catching issues locally saves time.

    ### 8. How This Project Is Built
    Brief explanation (3-4 sentences):
    - WRL is built transparently using AI agent orchestration
    - Each development phase is documented in `docs/evolution/` -- including prompts, decisions, and outcomes
    - The backlog at `docs/backlog.md` shows planned work and priorities
    - You do NOT need to write evolution log entries -- maintainers handle that
    - Frame the evolution log as "project history and design rationale" -- do not emphasize the agent aspect

    ### 9. Getting Help
    Open a GitHub Issue for questions, bugs, or feature ideas. Link to `docs/backlog.md` with framing: "Check the backlog before starting a large contribution to see if it aligns with project direction." Do NOT say "pick an item from the backlog."

    ### 10. Footer links
    - Security issues: see [SECURITY.md](SECURITY.md)
    - Code of conduct: all contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md)
    - License: contributions are licensed under [Apache 2.0](LICENSE)

    ## Step 7: Create SECURITY.md

    Create `/Users/ben/github/benpeter/web-resource-ledger/SECURITY.md`.

    Target: ~40 lines. Self-contained -- no outbound links to other community docs.

    Structure:

    ### 1. Supported Versions
    > Web Resource Ledger does not publish versioned releases yet. Security fixes are applied to the `main` branch. We recommend always running the latest commit on `main`.

    ### 2. Reporting a Vulnerability
    > Please report security vulnerabilities through [GitHub Security Advisories](https://github.com/benpeter/web-resource-ledger/security/advisories/new). This creates a private discussion where we can assess the issue before any public disclosure.
    >
    > **Please do not open a public issue for security vulnerabilities.**

    ### 3. What to Expect
    > We will acknowledge receipt of your report within 72 hours and aim to provide an initial assessment within 7 days. These are goals, not guarantees -- this is a small project maintained in spare time. We do take every report seriously.

    Use "goals, not guarantees" framing. Do NOT say "no SLA" (contract term, too cold for community doc). Do NOT mention bug bounties at all (YAGNI -- omitting creates no expectation).

    ### 4. Scope
    Brief list of what counts as a security issue (e.g., SSRF bypasses, authentication bypass, signature verification flaws, XSS) vs. a regular bug.

    ### 5. Disclosure
    Coordinate with reporter before public disclosure. Credit reporter in the advisory unless they prefer anonymity.

    ## Step 8: Create CODE_OF_CONDUCT.md

    Create `/Users/ben/github/benpeter/web-resource-ledger/CODE_OF_CONDUCT.md`.

    Use Contributor Covenant v2.1 **verbatim**. The full text is available at https://www.contributor-covenant.org/version/2/1/code_of_conduct/

    The ONLY customization is in the Enforcement section. Replace the placeholder contact info with:

    > Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by opening an issue or by contacting the maintainers privately through [GitHub Security Advisories](https://github.com/benpeter/web-resource-ledger/security/advisories/new).

    Do NOT add project-specific links to other community docs. The Contributor Covenant is self-contained by design.

    ## After All Steps

    1. Run `npm test` to verify nothing is broken
    2. Run `npm run lint:api` to verify Redocly linting still passes
    3. Read all three community documents (CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md) sequentially to verify consistent tone: direct, respectful, no corporate boilerplate
    4. Verify cross-references:
       - CONTRIBUTING.md links to SECURITY.md, CODE_OF_CONDUCT.md, LICENSE, docs/evolution/, docs/backlog.md, Helix Manifesto
       - SECURITY.md has no outbound links to other community docs
       - CODE_OF_CONDUCT.md has correct GHSA link
    5. Create a single commit with all changes

    ## What NOT to Do
    - Do NOT modify README.md (out of scope for this phase)
    - Do NOT add ESLint, Dependabot, issue/PR templates, CODEOWNERS, or release automation
    - Do NOT add matrix builds or coverage reporting to CI
    - Do NOT add deployment steps or secrets to CI
    - Do NOT mention CLAUDE.md in CONTRIBUTING.md (it's for agent instructions, not human contributors)
    - Do NOT require contributors to write evolution log entries

- **Deliverables**:
    - Modified `.gitignore` with new entries
    - `.DS_Store` files removed from git tracking
    - `LICENSE` with filled-in copyright year and name
    - `package.json` with added metadata fields
    - `.nvmrc` containing `22`
    - `.github/workflows/ci.yml`
    - `CONTRIBUTING.md`
    - `SECURITY.md`
    - `CODE_OF_CONDUCT.md`
- **Success criteria**:
    - `npm test` passes
    - `npm run lint:api` passes
    - `.DS_Store` files no longer tracked (but not deleted from disk)
    - All cross-references in community docs resolve correctly
    - CI workflow uses Node version from `.nvmrc`

### Task 2: Evolution log entry
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Create the evolution log entry for phase 0012 (open-source readiness) in `/Users/ben/github/benpeter/web-resource-ledger/docs/evolution/0012-open-source-readiness/`.

    This phase brought web-resource-ledger to baseline open-source hygiene standards. The work was completed in Task 1 of this plan. Your job is to document what was done.

    ## Create these files:

    ### 1. `prompt.md`
    Document the task briefing: Execute the open-source readiness plan -- make the repo ready for outside contributors. 8 steps: .gitignore, LICENSE, package.json metadata, .nvmrc, CI workflow, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md. Margo-approved scope only (no ESLint, Dependabot, templates, CODEOWNERS, release automation).

    ### 2. `decisions.md`
    Key decisions made during this phase:

    1. **Node version: 22 instead of 18** -- The original plan specified Node 18 and .nvmrc with `18`. iac-minion discovered wrangler 4.73.0 requires >=20.0.0. Resolved: .nvmrc = `22` (current LTS through Oct 2027), engines = `>=20.0.0`. Node 20 rejected because it exits LTS maintenance April 2026 (one month away).

    2. **Two-tier contributor setup** -- devx-minion identified that `npm test` works without any Cloudflare account (Miniflare simulates everything), but `npm run dev` requires Cloudflare Workers Paid plan + Browser Rendering. CONTRIBUTING.md leads with "Quick Start" (no account needed) and frames full local dev as optional.

    3. **Evolution log is NOT a contributor requirement** -- All three specialists agreed: the evolution log structure is coupled to the nefario orchestration workflow. External contributors should not be expected to write prompt.md/decisions.md/outcome.md. Maintainers handle it.

    4. **SECURITY.md: "goals, not guarantees" framing** -- software-docs-minion recommended 72h acknowledgment / 7d assessment targets stated as goals, not SLAs. Avoids both corporate contract language and underselling responsiveness. No bug bounty mention (omission creates no expectation).

    5. **Bug bounty: omit entirely** -- YAGNI applied to documentation. Stating "we don't have a bug bounty" draws attention to what's lacking. Saying nothing creates no expectation.

    6. **Code of Conduct enforcement via GHSA** -- Contributor Covenant v2.1 requires a contact method. Rather than a personal email, the project uses GitHub Security Advisories (already set up for SECURITY.md), providing private reporting without new infrastructure.

    7. **CI: single job, sequential steps** -- iac-minion recommended against parallel jobs. For this project size, job startup overhead (~30s per job) exceeds time saved. Sequential steps: npm ci, npm test, npm run lint:api.

    8. **CI: actions pinned to commit SHAs** -- Security best practice for open-source projects. Version tags can be moved; SHAs are immutable.

    9. **Vanilla JS stated as intentional, not as lack** -- devx-minion recommended framing that preempts "helpful" PRs adding React/Tailwind: state the rule, state it's intentional, give the escape hatch (open an issue).

    10. **Backlog linked as context, not as task board** -- devx-minion warned against "pick an item from the backlog" framing, which invites drive-by PRs for [consider]-tier items. Instead: "check the backlog to see if your idea aligns with project direction."

    ### 3. `outcome.md`
    Summarize what was produced:

    **Files created**: .nvmrc, .github/workflows/ci.yml, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
    **Files modified**: .gitignore (added OS/editor/log/env patterns), LICENSE (filled copyright), package.json (added metadata)
    **Files removed from tracking**: .DS_Store, docs/.DS_Store, docs/evolution/.DS_Store

    **Key outcomes**:
    - The repo now has baseline open-source hygiene: license with attribution, contributor guide, security policy, code of conduct, CI, and correct Node version tooling
    - CI runs tests and API linting on every push to main and every PR
    - Contributors can clone and run tests immediately without any Cloudflare account
    - The two-tier development model (test-only vs full-dev) is documented clearly

    **Deferred items / backlog changes**:
    - Review `docs/backlog.md`: The CI/CD pipeline item under Operations ([must] "add GitHub Actions when it hurts") should be marked as partially done -- CI is in place, CD (deployment) is still deferred
    - README.md should eventually link to CONTRIBUTING.md (out of scope for this phase)
    - "Good first issue" labels and contributor-ready backlog curation deferred until there are actual contributors
    - ESLint, Dependabot, issue/PR templates, CODEOWNERS, release automation all remain deferred per Margo-approved scope

    **What went as planned**: All 8 steps completed as specified. Node version correction was the only material change from the original plan.

    **What didn't go as planned**: Nothing significant. The Node 18 -> 22 correction was caught during Phase 2 planning (by iac-minion), not during execution.

    ## Also update:

    ### 4. `docs/evolution/README.md`
    Add a new row to the table:
    ```
    | [0012-open-source-readiness](0012-open-source-readiness/) | Open-source readiness: .gitignore, LICENSE, CI, contributor docs |
    ```

    ### 5. `docs/backlog.md`
    Update the Operations section: change the CI/CD pipeline item from `[must]` to reflect that CI is now done but CD is still deferred. Suggested edit:
    - Change: `- [must] CI/CD pipeline -- "add GitHub Actions when it hurts" or >1 developer (MVP.md, iac-minion, kickoff)`
    - To: `- ~~[must] CI/CD pipeline~~ -- CI added in 0012-open-source-readiness; CD (deployment automation) still deferred (MVP.md, iac-minion, kickoff)`

    ## What NOT to Do
    - Do NOT create process.md -- that will be written by the calling session after PR creation
    - Do NOT modify any files created by Task 1 (they are already committed)
    - Do NOT modify README.md

- **Deliverables**:
    - `docs/evolution/0012-open-source-readiness/prompt.md`
    - `docs/evolution/0012-open-source-readiness/decisions.md`
    - `docs/evolution/0012-open-source-readiness/outcome.md`
    - Updated `docs/evolution/README.md`
    - Updated `docs/backlog.md`
- **Success criteria**:
    - All three evolution log files exist with substantive content
    - Evolution index has the new row
    - Backlog CI/CD item updated to reflect partial completion
    - No files from Task 1 modified

### Cross-Cutting Coverage

- **Testing**: Covered within Task 1 -- the agent runs `npm test` and `npm run lint:api` as verification steps after all changes. Phase 6 (post-execution) will run the full test suite again. No new test code is being written in this phase (all deliverables are config/documentation).
- **Security**: No new attack surface created. All deliverables are static files (.gitignore, LICENSE, markdown, YAML workflow). The CI workflow uses `permissions: contents: read` (least privilege) and pins actions to commit SHAs. SECURITY.md itself establishes the vulnerability reporting channel. No security-minion review needed beyond Phase 3.5.
- **Usability -- Strategy**: CONTRIBUTING.md embodies the two-tier contributor journey designed by devx-minion. The "Quick Start without Cloudflare account" framing reduces cognitive load for first-time contributors. ux-strategy-minion reviews this in Phase 3.5.
- **Usability -- Design**: No user-facing interfaces created. Excluded.
- **Documentation**: Task 2 covers evolution log documentation. CONTRIBUTING.md, SECURITY.md, and CODE_OF_CONDUCT.md are the primary documentation deliverables from Task 1. Phase 8 (post-execution) handles any additional documentation needs.
- **Observability**: No runtime components created. Excluded.

### Architecture Review Agents
- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
    - devx-minion: CONTRIBUTING.md is the primary developer experience artifact; devx-minion authored the two-tier setup design and should verify it was implemented correctly (Task 1)
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

1. **Node version (18 vs 22)**: Original plan specified Node 18. iac-minion discovered wrangler 4.73.0 requires >=20.0.0. Resolved pre-synthesis: .nvmrc = `22` (current LTS), engines = `>=20.0.0`. Node 20 was also rejected because it exits LTS maintenance in April 2026.

2. **CONTRIBUTING.md prerequisites section -- Node version**: software-docs-minion draft said "Node 18+". Corrected to match the engines field: prerequisites say "Node 20+" and .nvmrc provides 22. The Quick Start section does not mention a specific version -- `nvm use` picks it up from .nvmrc.

3. **Evolution log in CONTRIBUTING.md -- framing**: devx-minion said "link but frame for context, not action." software-docs-minion agreed and provided specific phrasing. Both aligned on "contributors do NOT write evolution log entries." No conflict to resolve.

### Risks and Mitigations

1. **GitHub Actions SHA staleness** (Low): The pinned SHAs in the prompt were current at planning time. The executing agent is instructed to verify them. Mitigation: version comment next to each SHA makes future updates easy to identify.

2. **Contributor Covenant version drift** (Very Low): v2.1 is current. If it updates, the version number in the file makes it clear which version was adopted. Mitigation: no action needed now.

3. **Stale test gotchas in CONTRIBUTING.md** (Low): `@cloudflare/vitest-pool-workers` is pre-1.0 and may change behavior. Mitigation: gotchas are kept to 1-2 sentences each, making updates trivial.

4. **README.md not linking to CONTRIBUTING.md** (Low, deferred): Once CONTRIBUTING.md exists, README should link to it. Explicitly out of scope; documented in evolution log outcome.md as a deferred item.

### Execution Order

```
Batch 1: Task 1 (all 8 file changes)
Batch 2: Task 2 (evolution log, blocked by Task 1)
```

No approval gates. All changes are additive, easily reversible markdown/config/YAML files with 0-1 downstream dependents.

### Verification Steps

After all tasks complete:
1. `npm test` passes (Task 1 verifies this)
2. `npm run lint:api` passes (Task 1 verifies this)
3. `.DS_Store` files not in `git ls-files` output
4. All markdown cross-references resolve (relative links from repo root)
5. Evolution log index has 0012 entry
6. Backlog CI/CD item reflects partial completion
7. All files are on the `nefario/open-source-readiness` branch, ready for PR
