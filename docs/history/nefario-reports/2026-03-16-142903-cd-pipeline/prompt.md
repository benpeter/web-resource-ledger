#44 R14: Production CD pipeline with environment protection

**Outcome**: Production deployments are reproducible, gated by approval, and have rollback capability — required before external users depend on WRL uptime.

**Success criteria**:
- GitHub Actions workflow for production deploy (triggered by tag or manual dispatch)
- GitHub environment protection rules require approval before production deploy
- Post-deploy health check validates the deployment (smoke test against production)
- Rollback procedure documented and tested (previous version tag)
- Staging smoke tests pass before production deploy is permitted

**Scope**:
- In: GitHub Actions production workflow, environment protection rules, post-deploy health check, rollback documentation
- Out: Blue-green deployment, canary releases, infrastructure-as-code for environments

**Constraints**:
- R9 (staging environment) should exist first for pre-production validation
- Ship before first external user onboarding

---
Additional context: R14 -- skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement. IMPORTANT: other worktrees may be running in parallel -- pick the next available evolution sequence number (check docs/evolution/ for existing entries) and use the slug provided below. Evolution slug: cd-pipeline.
