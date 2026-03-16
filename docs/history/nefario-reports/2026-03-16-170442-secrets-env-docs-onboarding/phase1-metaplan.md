# Meta-Plan: Fix Secrets and Environment Setup Documentation for Fork-Ready Onboarding

## Planning Consultations

### Consultation 1: Documentation Architecture -- Single Source of Truth Strategy

- **Agent**: software-docs-minion
- **Planning question**: Given two files (README.md and OPERATIONS.md) that both reference secrets, how should we structure the "source of truth" boundary? README.md currently owns secret generation commands (steps 4-8) and OPERATIONS.md owns GitHub environment setup tables. The task requires zero duplication with cross-references. What should each file own, and what linking pattern avoids staleness? Specifically: should the "secret surfaces" explanation (Worker runtime vs GitHub CI vs .dev.vars) live in README (developer-facing) or OPERATIONS (ops-facing)?
- **Context to provide**: Current README.md (particularly steps 4-8 and the Staging section at lines 249-269), current OPERATIONS.md (particularly GitHub Environment Setup at lines 108-149), the constraint that URLs remain as placeholders in OPERATIONS.md
- **Why this agent**: software-docs-minion specializes in documentation architecture and information hierarchy. The core challenge here is structuring information across two files without duplication -- a documentation architecture problem, not a content-writing problem.

### Consultation 2: Developer Onboarding Flow for Fork Scenarios

- **Agent**: devx-minion
- **Planning question**: A developer forks WRL and wants to get both staging and production CD pipelines running. What is the minimum information path they need to follow? Currently they must: (1) create Cloudflare resources (KV namespace, R2 buckets), (2) generate secrets, (3) configure wrangler.toml with KV IDs, (4) set up GitHub environments with correct secret names, (5) understand that Worker secrets are set once via `wrangler secret put` and persist across deploys (the CD pipeline only deploys code). Which of these steps are currently documented, which are gaps, and what ordering minimizes back-and-forth? Also: should the Cloudflare API token permissions be documented as a checklist (copy-paste into the Cloudflare dashboard) or as prose?
- **Context to provide**: README.md setup steps 1-9, OPERATIONS.md GitHub Environment Setup section, wrangler.toml (especially env.staging block showing separate KV/R2/rate-limiter bindings), deploy-staging.yml and deploy-production.yml workflow files
- **Why this agent**: devx-minion focuses on developer onboarding friction. A fork scenario is a cold-start onboarding problem -- the developer has zero pre-existing context. devx-minion can identify which gaps cause the most confusion and how to sequence the fix.

### Consultation 3: Usability of the Documentation for a New Operator

- **Agent**: ux-strategy-minion
- **Planning question**: A new WRL operator (not the original author) encounters two documents: README.md (setup, usage, reference) and OPERATIONS.md (deploy, rollback, environment config). They need to go from "I just forked this" to "staging and production pipelines are green." What cognitive load issues exist in the current documentation? Are there implicit assumptions (e.g., "you already know which Cloudflare token permissions to select" or "you understand that Worker secrets persist independently of code deploys") that should be made explicit? Is the current 9-step README setup sequence the right granularity, or should it be restructured?
- **Context to provide**: README.md full content, OPERATIONS.md full content, the 5 specific Cloudflare API token permissions that are needed (Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit, Account Settings Read, User Memberships Read)
- **Why this agent**: ux-strategy-minion evaluates journey coherence and cognitive load. The task is fundamentally about making an implicit knowledge path explicit -- a user journey problem.

### Cross-Cutting Checklist

- **Testing**: EXCLUDE from planning. This task produces only documentation changes (Markdown files). No code, configuration, or infrastructure changes. No executable output to test.
- **Security**: EXCLUDE from planning. The task documents existing secrets and permissions but does not create new attack surface, change auth flows, or modify secret handling. The specific Cloudflare token permissions are already determined and just need to be written down. (Note: security-minion will still review the plan in Phase 3.5 to verify no sensitive values are accidentally documented.)
- **Usability -- Strategy**: INCLUDED -- Consultation 3 (ux-strategy-minion). Planning question covers cognitive load assessment of the fork-onboarding journey.
- **Usability -- Design**: EXCLUDE from planning. No user-facing interfaces are produced. The output is developer documentation (Markdown), not UI.
- **Documentation**: INCLUDED -- Consultation 1 (software-docs-minion). This is the primary domain. user-docs-minion is excluded because the audience is developers/operators, not end users -- software-docs-minion is the right fit.
- **Observability**: EXCLUDE from planning. No runtime components are created or modified. Coralogix documentation is being written about, not implemented.

### Anticipated Approval Gates

**One gate expected: Documentation structure decision** -- Before execution, the user should approve which file (README vs OPERATIONS) owns the "secret surfaces" explanation, and the cross-reference pattern. This is a MUST gate because:
- Hard to reverse (restructuring docs after they're written is rework)
- High blast radius (both files depend on this decision, plus the evolution log references it)
- Multiple valid approaches exist (README-primary vs OPERATIONS-primary vs a new section in either)

No other gates anticipated. The actual content (specific permissions, Coralogix sourcing, KV/R2 creation steps) is factual and has a single correct answer.

### Rationale

This task is a documentation architecture problem with a developer experience dimension. Three specialists cover it:

1. **software-docs-minion** -- owns the structural question (what goes where, how to cross-reference without duplication). This is the primary challenge.
2. **devx-minion** -- owns the onboarding sequence question (what order should a forking developer encounter this information). This catches gaps the docs-minion might miss by thinking about the document rather than the journey.
3. **ux-strategy-minion** -- owns the cognitive load question (what implicit assumptions need to become explicit). Mandatory cross-cutting reviewer, but also genuinely useful here because the task is about making tacit knowledge accessible.

Agents NOT consulted for planning:
- **iac-minion**: Knows Cloudflare infrastructure but the infrastructure is already built. The question is documenting it, not building it.
- **security-minion**: Will review in Phase 3.5. No security design decisions to make during planning.
- **user-docs-minion**: The audience is developers/operators, not end users. software-docs-minion is the right fit.

### Scope

**In scope:**
- README.md: staging section expansion (KV namespace creation, R2 bucket creation, wrangler.toml KV ID requirement), Coralogix send key sourcing documentation
- OPERATIONS.md: Cloudflare API token permission list, Worker secrets persistence explanation, secret surfaces concept, cross-references to README generation commands
- Evolution log: new phase 0025 directory with prompt.md, decisions.md, outcome.md documenting this phase (referencing today's pipeline fixes as context)
- Evolution log index update (docs/evolution/README.md)

**Out of scope:**
- Code changes of any kind
- Workflow file changes
- wrangler.toml changes
- New documentation files (all changes go into existing README.md and OPERATIONS.md)
- CI pipeline modifications
- Changing the placeholder URL pattern in OPERATIONS.md

### External Skill Integration

No external skills detected in project. The `.claude/` directory contains only worktrees. No `.skills/` directory exists. Global skills at `~/.claude/skills/` are all despicable-agents agents (nefario, despicable-prompter, etc.) or personal skills (obsidian-tasks, transcribe, juli) unrelated to this documentation task.
