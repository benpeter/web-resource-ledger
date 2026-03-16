Combined task from GitHub issues #39 and #37:

## Issue #39: R9: Staging environment with automated deploy

Outcome: Every push to main is automatically deployed to a staging environment
with isolated bindings, enabling validation before manual production deploy.

Success criteria:
- wrangler.toml has a staging environment with isolated KV namespace and R2 bucket
- GitHub Actions workflow deploys to staging on push to main
- Basic smoke test script validates staging deployment (health check + capture round-trip)
- Staging and production use separate API keys
- Staging environment accessible for manual testing

## Issue #37: R7: Content moderation policy and Terms of Service

Outcome: The operator has legal cover for stored content and an abuse reporting
mechanism, which is required before any public promotion of WRL.

Success criteria:
- Terms of Service document published, prohibiting illegal use and outlining operator rights
- Content moderation policy published with abuse reporting mechanism (email or endpoint)
- ToS/policy accessible from API responses (Link header or dedicated endpoint)
- Documents reviewed for legal soundness (not legal advice -- reasonable template)

## Orchestration directives

- Combined both issues in one PR
- Skipped all approval gates -- deferred decisions to gru and lucy
- Skipped compaction checkpoints
- Auto-created PR at wrap-up
- Evolution directory: 0018-staging-and-tos
