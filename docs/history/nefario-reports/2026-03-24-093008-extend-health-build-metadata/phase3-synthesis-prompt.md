MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Extend the existing /health endpoint with build identity metadata (commit SHA, version, deploy timestamp, environment) for CI deploy verification. Build metadata injected at deploy time via wrangler --define.

Success criteria:
- GET /health response includes commit (full 40-char SHA), version (from package.json), env (production|staging), and deployedAt (ISO 8601 UTC)
- Existing status and legal fields preserved — no breaking changes
- CI smoke test asserts deployed commit matches $GITHUB_SHA (with retry loop for global rollout lag)
- Response includes Cache-Control: no-store
- Handler remains synchronous with zero I/O — no KV reads, no D1 queries
- Build metadata injected at deploy time via wrangler --define (burned into bundle, not runtime vars)
- Both deploy workflows (staging + production) updated to pass build metadata
- Response time stays under 10ms

## Specialist Contributions

Read the following scratch files for full specialist contributions:
/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-8ffwn7/extend-health-build-metadata/phase2-iac-minion.md
/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-8ffwn7/extend-health-build-metadata/phase2-test-minion.md
/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-8ffwn7/extend-health-build-metadata/phase2-api-design-minion.md
/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-8ffwn7/extend-health-build-metadata/phase2-ux-strategy-minion.md
/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-8ffwn7/extend-health-build-metadata/phase2-software-docs-minion.md

## Key consensus across specialists:
- iac-minion: Use command: with --define flags in wrangler-action, git rev-parse HEAD for SHA. command: + environment: coexist safely.
- test-minion: Separate Check 5 with 5s interval, 6 attempts, 30s max. typeof guards for undefined globals. Skip on absent GITHUB_SHA.
- api-design-minion: Nest under build object (optional at top, all 4 children required when present). Cache-Control: no-store in handleHealth(). Non-breaking change.
- ux-strategy-minion: Agrees with build nesting. Full 40-char SHAs, full word env values. Visual chunking matches legal grouping pattern.
- software-docs-minion: 6 docs need updating: openapi.yaml, README.md, OPERATIONS.md (3 sections), CONTRIBUTING.md.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-8ffwn7/extend-health-build-metadata/phase3-synthesis.md
