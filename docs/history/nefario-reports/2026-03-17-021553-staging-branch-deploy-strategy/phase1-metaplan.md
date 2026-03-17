## Meta-Plan

**Task**: Should we create a separate branch (e.g., `staging`) that deploys to staging on merge, with only `main` deploying to production?

**Nature**: This is an advisory question -- the user is asking whether they *should* do this, not requesting implementation. The ADVISORY flag should be set for synthesis.

### Current State Summary

Today all four workflows (`ci.yml`, `deploy-staging.yml`, `deploy-production.yml`, `vibe-coded-badge.yml`) trigger on `push: branches: [main]`. The deploy pipeline is linear: push to main -> test -> deploy staging -> smoke staging -> deploy prod (with reviewer gate) -> smoke prod. CI also runs on PRs targeting main. Infrastructure is fully isolated between staging and production (separate KV, R2, rate limiters, Coralogix app name). This is a solo-developer project that values YAGNI, KISS, and minimal cognitive overhead.

### Planning Consultations

#### Consultation 1: CI/CD Pipeline Architecture
- **Agent**: iac-minion
- **Planning question**: Given the current workflow structure (all three deploy/CI workflows trigger on `push: branches: [main]`), what are the concrete workflow changes needed to support a `staging` branch model? Specifically: (1) How would the trigger matrix change across all four workflow files? (2) What happens to the production workflow's `staging-smoke` gate -- does it still make sense if staging deploys from a different branch? (3) How would `workflow_dispatch` rollback work for each branch? (4) What branch protection rules would be needed for `staging`? (5) What are the failure modes -- e.g., staging and main diverge, hotfix needs to skip staging, merge conflicts from long-lived staging branch?
- **Context to provide**: All four workflow files, wrangler.toml (env.staging config), OPERATIONS.md (rollback procedures), current branch list showing extensive use of feature branches off main.
- **Why this agent**: iac-minion owns CI/CD pipeline design and GitHub Actions. They can evaluate the concrete implementation cost and operational complexity of the branch model change.

#### Consultation 2: Deployment Strategy Trade-offs
- **Agent**: devx-minion
- **Planning question**: From a solo-developer workflow perspective, compare three models: (A) current model (everything deploys from main, staging gates prod), (B) two-branch model (staging branch -> staging env, main -> prod), (C) tag-based promotion (staging on main push, prod on tag/release). For each model: What does the daily developer workflow look like? How many steps to ship a change? What's the cognitive overhead? What are the sharp edges for a single maintainer who sometimes goes days without touching the project? How does each model interact with the existing PR workflow (feature branches -> PR -> main)?
- **Context to provide**: Current workflow triggers, OPERATIONS.md rollback procedures, branch list showing feature-branch workflow pattern, CLAUDE.md engineering philosophy (YAGNI, KISS, solo developer).
- **Why this agent**: devx-minion evaluates developer experience, workflow ergonomics, and cognitive overhead -- critical dimensions for a solo developer deciding whether added process delivers proportionate value.

#### Consultation 3: Operational Risk Assessment
- **Agent**: security-minion
- **Planning question**: From an operational security and reliability perspective, what risks does the current "staging and prod both deploy from main" model carry, and would a separate staging branch mitigate any of them? Specifically: (1) Is there a meaningful risk window between staging deploy and prod deploy where untested code could reach production? (2) Does the current `staging-smoke` gate in the production workflow provide sufficient protection? (3) Would a separate branch model introduce new risks (e.g., secret drift between environments, forgotten merges, staging-main divergence creating false confidence in smoke tests)?
- **Context to provide**: deploy-production.yml (staging-smoke gate, environment protection rules), deploy-staging.yml, OPERATIONS.md (secret surfaces, rollback procedures), wrangler.toml (separate secrets per env).
- **Why this agent**: Security-minion can evaluate whether the branching model change has meaningful impact on the risk of deploying bad code to production, or whether it's security theater adding complexity without reducing risk.

### Cross-Cutting Checklist

- **Testing**: Do not include test-minion for planning. This is an advisory about branching strategy, not about test coverage. The CI workflow already runs tests; the question is which branch triggers them, not what they test.
- **Security**: Include -- see Consultation 3 above. The branching model affects the deployment security boundary.
- **Usability -- Strategy**: ALWAYS include. **Planning question for ux-strategy-minion**: This is a solo-developer project. From a user-journey perspective (where the "user" is the developer/maintainer), what is the current pain point that a staging branch would solve? Is there evidence of a problem (e.g., untested code reaching production, desire to batch changes before promoting), or is this a solution looking for a problem? What is the simplest change that addresses the actual need?
- **Usability -- Design**: Do not include ux-design-minion or accessibility-minion. No user-facing interface is involved.
- **Documentation**: Include software-docs-minion for planning. **Planning question**: If the branching model changes, what documentation artifacts need updating (OPERATIONS.md rollback procedures, README deployment section, CONTRIBUTING patterns)? Assess the documentation maintenance burden of each model -- a more complex branching strategy means more docs to keep current.
- **Observability**: Do not include observability-minion or sitespeed-minion. The branching model does not change the runtime observability architecture. Coralogix already distinguishes `wrl` from `wrl-staging` via APPLICATION_NAME.

### Anticipated Approval Gates

This is an advisory task -- the output is a recommendation, not an execution plan. No approval gates are needed. If the user decides to proceed with implementation based on the advisory, that would be a separate `/nefario` invocation with its own gates.

### Rationale

Four specialists are consulted because this question sits at the intersection of:

1. **CI/CD implementation complexity** (iac-minion) -- the concrete cost of changing the pipeline
2. **Developer workflow ergonomics** (devx-minion) -- whether the added process is worth it for a solo developer
3. **Deployment risk** (security-minion) -- whether the current model has real gaps
4. **Journey coherence** (ux-strategy-minion) -- whether a problem actually exists that needs solving
5. **Documentation burden** (software-docs-minion) -- the maintenance cost of a more complex model

The core tension is YAGNI/KISS vs. deployment safety. The current model is simple: push to main, everything deploys in sequence with gates. A staging branch adds a promotion step that is standard in team environments but may be pure overhead for a solo developer. The specialists need to evaluate whether the added complexity buys meaningful safety or just adds friction.

### Scope

**In scope**: Advisory on whether to adopt a staging-branch deployment model, including analysis of the current model's strengths/weaknesses, concrete alternatives, and a recommendation.

**Out of scope**: Implementation of any changes, changes to the Cloudflare Worker architecture, changes to the test suite, changes to the wrangler.toml environment configuration (the infrastructure isolation already exists).

### External Skill Integration

No external skills detected in project (.claude/skills/ and .skills/ directories are empty in this project). User-global skills (nefario, despicable-prompter, etc.) are framework skills, not domain-relevant to this CI/CD advisory.
