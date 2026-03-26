# Meta-Plan: Autoconsent Update Pipeline

## Planning Consultations

### Consultation 1: CI/CD Pipeline Design
- **Agent**: iac-minion
- **Planning question**: What is the best approach for a GitHub Actions workflow that (a) runs on a weekly cron + manual dispatch, (b) compares installed vs latest npm package version, (c) runs `npm install`, a vendoring script, unit tests, and a test battery against staging, and (d) opens a PR only if tests pass? Specifically: how should we handle the staging API key secret (`WRL_STAGING_KEY`), what permissions does the workflow need to create PRs and post comments, and should we use `peter-evans/create-pull-request` or `gh pr create`? The repo uses pinned action SHAs (e.g., `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2`) -- the plan must follow this convention.
- **Context to provide**: `.github/workflows/ci.yml` (existing CI patterns, pinned SHAs, node setup), `package.json` (scripts, dependencies), `scripts/test-battery.js` (how battery works, env vars), `src/consent.js` (version constant location)
- **Why this agent**: Infrastructure and CI/CD is iac-minion's core domain. The workflow has non-trivial concerns: secret management, PR creation permissions, conditional execution (skip if already latest), and test battery that hits a live staging endpoint.

### Consultation 2: Vendoring Script Design
- **Agent**: devx-minion
- **Planning question**: The vendoring process is currently manual and undocumented. We need a script that: (1) reads `autoconsent.playwright.js` from the installed `@duckduckgo/autoconsent` package in `node_modules`, (2) wraps it as a string export in `src/vendor/autoconsent-script.js`, and (3) updates the `AUTOCONSENT_VERSION` constant in `src/consent.js` to match the installed version. What should this script look like? It must be idempotent, usable both locally by developers and by the CI workflow. Should it be a shell script or a Node script? The existing `autoconsent-script.js` is a single `export default "..."` wrapping ~3700 lines of JS as a string literal.
- **Context to provide**: `src/vendor/autoconsent-script.js` (header + format), `src/vendor/autoconsent.playwright.js` (source file), `src/consent.js` (version constant), `package.json`
- **Why this agent**: devx-minion handles CLI tooling and developer scripts. The vendoring script is a developer tool that needs to work reliably in both local and CI contexts.

### Consultation 3: Test Strategy for the Pipeline
- **Agent**: test-minion
- **Planning question**: The pipeline runs both `npm test` (vitest with workerd runtime, ~8 GB memory) and `npm run test:battery` (live captures against staging). For CI runner sizing: what GitHub Actions runner type is needed for the vitest suite? Should the test battery run as a separate job or a step in the same job? The test battery hits real websites and takes several minutes -- what timeout and failure handling strategy makes sense? Should test battery failures block the PR or just be reported as a comment?
- **Context to provide**: `package.json` (test scripts), `scripts/test-battery.js` (battery implementation), CLAUDE.md notes about 8 GB memory for tests, existing CI workflow patterns
- **Why this agent**: test-minion can advise on runner sizing, test isolation, and failure handling strategy for the two very different test types (hermetic unit tests vs live integration battery).

### Cross-Cutting Checklist
- **Testing**: Included -- test-minion is Consultation 3, advising on test strategy for the pipeline itself.
- **Security**: Not included for planning. The only security concern is the staging API key secret, which is a standard GitHub Actions secret -- iac-minion covers this. No new attack surface, no auth changes, no user input handling.
- **Usability -- Strategy**: ALWAYS include. However, this task is entirely CI/infrastructure with no user-facing changes. ux-strategy-minion's planning question: "Does this automated pipeline introduce any user-facing changes or developer workflow changes that need journey review?" The answer is almost certainly no -- this is a background automation. Include in the execution plan as a lightweight review rather than a planning consultation.
- **Usability -- Design**: Not included. No UI components or visual interfaces produced.
- **Documentation**: ALWAYS include. software-docs-minion's planning question would be about documenting the vendoring process and the new workflow. However, the documentation needs are straightforward (add a section to existing docs about the autoconsent update pipeline). Include in execution plan, not planning consultation.
- **Observability**: Not included. This is a CI workflow, not a runtime component. GitHub Actions provides its own logging. No production services created.

### Notable Exclusions

- **security-minion**: Only security concern is a standard GitHub Actions secret for the staging API key. iac-minion handles secret configuration as part of workflow design. No new attack surface.
- **software-docs-minion**: Documentation needs are clear (document the new workflow and vendoring script). No planning input needed -- will be included in execution.
- **ux-strategy-minion**: This is pure CI automation with zero user-facing or developer-workflow changes beyond a new script. Will review the plan at Phase 3.5 but doesn't need to shape it.

### Anticipated Approval Gates

1. **Vendoring script approach** (OPTIONAL gate): The script design determines how the vendor file is regenerated. Easy to reverse (it's a new additive script), but has 2+ dependents (the workflow and local dev usage). Gate only if the specialist consultation surfaces multiple viable approaches.
2. **Workflow design** (NO gate): The workflow is additive infrastructure, easy to modify after merge, and follows established patterns from 8 existing workflows.

### Rationale

Three specialists were chosen because this task spans three distinct domains that benefit from expert input:

1. **iac-minion** -- The core deliverable is a GitHub Actions workflow. The non-trivial parts are: permissions model for PR creation, secret handling, conditional skip logic, and fitting into the existing CI conventions (pinned SHAs, node setup patterns).
2. **devx-minion** -- The missing vendoring script is a prerequisite for the workflow. Getting this right (idempotent, works locally and in CI, handles the string-escaping correctly) requires developer tooling expertise.
3. **test-minion** -- The pipeline runs two very different test suites with different resource and reliability characteristics. Runner sizing, timeout strategy, and failure handling need expert input.

Cross-cutting agents (security, docs, ux-strategy) will participate in execution and Phase 3.5 review but don't need to shape the plan -- their concerns are either standard (secret handling) or lightweight (document the new workflow).

### Scope

**In scope**:
- GitHub Actions workflow (`autoconsent-update.yml`) with weekly cron + manual dispatch
- Vendoring script to regenerate `src/vendor/autoconsent-script.js` from installed package
- Version bump logic for `AUTOCONSENT_VERSION` in `src/consent.js`
- Unit test + test battery execution in the pipeline
- PR creation with version diff in description and battery results in comment
- `WRL_STAGING_KEY` secret configuration

**Out of scope**:
- Changes to the autoconsent integration code itself (`src/consent.js` logic)
- Changes to the test battery script (`scripts/test-battery.js`)
- Changes to the existing CI workflow
- Updating the vendored `autoconsent.playwright.js` file (the workflow handles this via npm install)
- Auto-merge of the created PR

### External Skill Integration

No external skills detected that are relevant to this task. One skill found (`.claude/skills/ops-runbook/SKILL.md`) covers operational procedures, not CI automation.
