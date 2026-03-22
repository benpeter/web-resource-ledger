# Meta-Plan: npm Publish CI Automation for @w-r-l/verify

## Planning Consultations

### Consultation 1: CI/CD Pipeline Design
- **Agent**: iac-minion
- **Planning question**: What is the optimal GitHub Actions workflow design for tag-triggered npm publishing in a monorepo subdirectory (`packages/verify/`)? Specifically: (a) How should the trigger filter work -- `tags: ['v*']` with path filtering, or tag-only since tags are manually created? (b) Should the workflow run the package's own tests (`node --test`) or also the root-level vitest tests? (c) What is the correct approach for `npm publish` with `--provenance` on GitHub Actions (OIDC permissions)? (d) How should the workflow handle the case where the version already exists on npm (exit code, `--ignore-scripts`, etc.)? Review the existing workflows (ci.yml, deploy-staging.yml, deploy-production.yml) for action version pinning conventions (SHA-pinned actions/checkout@v4.2.2, actions/setup-node@v4.4.0) and structural patterns.
- **Context to provide**: Existing workflows at `.github/workflows/`, package.json at `packages/verify/package.json`, `.nvmrc` (node 22), root `package.json` scripts. The package uses `node --test` (not vitest). Existing CI uses SHA-pinned actions. No existing git tags in the repo.
- **Why this agent**: Core domain expertise in GitHub Actions workflow design, secret management patterns, and CI trigger mechanics. This is primarily an infrastructure/CI task.

### Consultation 2: Version Bump and Changelog Tooling
- **Agent**: devx-minion
- **Planning question**: What is the lightest-weight approach for a version bump + tag script and changelog generation for a single package in a monorepo? Consider: (a) A shell script vs npm script vs `npm version` (which has built-in tag creation) -- what is simplest? (b) For changelog generation: conventional-changelog-cli, git-cliff, changelogen, or a simple shell script parsing `git log --oneline`? The project uses conventional commits (`feat:`, `fix:`, `feat(verify):` etc.) but currently has only one commit in the verify package history. (c) The script needs to work within `packages/verify/` -- should it be a root script or live in the package? (d) Should the version bump script also handle CHANGELOG.md generation, or should those be separate tools?
- **Context to provide**: Repo uses conventional commits. Only one verify-specific commit exists so far. The project philosophy is YAGNI/KISS -- prefer the simplest tool that works. No existing changelog. Package lives at `packages/verify/`. Root has a `scripts/` directory with operational scripts.
- **Why this agent**: CLI/tooling design expertise, knowledge of version management tooling landscape, developer workflow ergonomics.

### Consultation 3: npm Token and Secret Management
- **Agent**: security-minion
- **Planning question**: What is the secure approach for npm publish authentication in GitHub Actions? Specifically: (a) Granular automation token (scoped to @w-r-l org) vs classic token -- what are the trade-offs? (b) Should we use npm provenance (`--provenance`) which requires OIDC `id-token: write` permission -- is this worth the additional permission scope? (c) The repo already stores secrets like `CLOUDFLARE_API_TOKEN` and various `WRL_*` keys as GitHub Actions secrets. Should the npm token go in a specific environment or at repo level? (d) Any concerns about the publish workflow's permission model (`contents: read`, `id-token: write`, `packages: write`)?
- **Context to provide**: Existing secret usage patterns in deploy-staging.yml and deploy-production.yml (environment-scoped secrets). The npm org @w-r-l already exists. 1Password vault "WRL" is used for secret storage (though npm tokens are managed via npmjs.com, not 1P).
- **Why this agent**: Security audit of CI secret management, permission scoping, supply chain security (provenance).

### Cross-Cutting Checklist
- **Testing**: Include test-minion for planning? **No** -- the publish workflow will run the package's existing tests as a pre-publish gate. No new test infrastructure is needed. Test execution is handled by Phase 6 post-execution. The planning question for iac-minion already covers "which tests should the workflow run."
- **Security**: **Yes** -- included as Consultation 3. npm token management and CI permission scoping are security-critical.
- **Usability -- Strategy**: ALWAYS include -- **However, this task is pure CI/infrastructure with no user-facing journey changes.** The "user" is the developer (Ben) running a version bump script. devx-minion (Consultation 2) covers the developer ergonomics angle. ux-strategy-minion would add no planning value beyond what devx-minion provides. **Include in execution plan for review but not in planning consultations.**
- **Usability -- Design**: **No** -- no user-facing interfaces are produced. This is a CI workflow and CLI script.
- **Documentation**: ALWAYS include -- **Defer to Phase 8 post-execution.** The version bump script and publish workflow will need a brief section in the package README or a RELEASING.md file. software-docs-minion does not need to participate in planning -- the documentation is straightforward (how to release a new version) and depends entirely on what iac-minion and devx-minion decide.
- **Observability**: **No** -- no runtime services are created. The GitHub Actions workflow has built-in run logs. No custom metrics/tracing needed.

### Notable Exclusions

- **test-minion**: Existing `node --test` suite runs inside the publish workflow as a gate; no new test strategy needed for this task.
- **observability-minion**: GitHub Actions provides built-in workflow run logging; no custom observability layer warranted for a publish pipeline.
- **ux-design-minion**: No user-facing interfaces produced; this is entirely CI infrastructure and a CLI script.

### Anticipated Approval Gates

1. **Publish workflow design** (MUST gate) -- The GitHub Actions workflow is the core deliverable. It defines trigger semantics, permission model, and npm token usage. Getting this wrong means either accidental publishes or broken CI. High blast radius (changelog and version bump script depend on the workflow's tag convention). Hard to reverse (changing tag conventions after publishing is messy).

2. **Version bump + changelog approach** (OPTIONAL gate) -- The tooling choice (npm version vs custom script, changelog tool selection) is easy to reverse later, but it has a dependency on the workflow's expectations. Likely can be approved alongside the workflow design as a single consolidated gate.

### Rationale

This task is primarily a CI/CD pipeline problem (iac-minion) with a developer tooling component (devx-minion) and a security consideration (security-minion). The three consultations cover the complete scope:

- **iac-minion** owns the GitHub Actions workflow -- the core deliverable
- **devx-minion** owns the version bump script and changelog tooling -- the developer-facing workflow
- **security-minion** reviews the npm token management and CI permissions -- the trust boundary

The task is well-scoped: single package, single workflow, no complex orchestration. Three planning consultations are sufficient. Cross-cutting concerns (testing, docs) are handled by post-execution phases rather than planning consultations because they don't introduce architectural decisions.

### Scope

**What**: Automate npm publishing of @w-r-l/verify via GitHub Actions on tag push, with version bump tooling and changelog generation.

**In scope**:
- GitHub Actions workflow (`.github/workflows/publish-verify.yml` or similar)
- Version bump script (updates `packages/verify/package.json`, creates git tag)
- CHANGELOG.md generation from conventional commits
- npm automation token as GitHub Actions secret
- Graceful handling of duplicate version publish attempts

**Out of scope**:
- Monorepo publish orchestration (only @w-r-l/verify)
- GitHub Releases (nice-to-have, not required)
- Pre-release/beta channels
- Changes to the existing CI workflow (ci.yml)
- Changes to the existing @w-r-l/verify v0.1.0 on npm

### External Skill Integration

No external skills detected in project. No `.claude/skills/` or `.skills/` directories contain SKILL.md files in the working directory.
