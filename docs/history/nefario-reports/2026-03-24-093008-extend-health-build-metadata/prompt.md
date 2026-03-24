Extend /health endpoint with build metadata for deploy verification

**Outcome**: The existing /health endpoint returns build identity metadata (commit SHA, version, deploy timestamp, environment), enabling CI pipelines to confirm a specific commit is live after deploy and humans to instantly see what's running. This closes the verification gap where successful deploys cannot be confirmed without checking the Cloudflare dashboard.

**Success criteria**:
- GET /health response includes commit (full 40-char SHA), version (from package.json), env (production|staging), and deployedAt (ISO 8601 UTC)
- Existing status and legal fields preserved — no breaking changes
- CI smoke test asserts deployed commit matches $GITHUB_SHA (with retry loop for global rollout lag)
- Response includes Cache-Control: no-store
- Handler remains synchronous with zero I/O — no KV reads, no D1 queries
- Build metadata injected at deploy time via wrangler --define (burned into bundle, not runtime vars)
- Both deploy workflows (staging + production) updated to pass build metadata
- Response time stays under 10ms

**Scope**:
- In: handleHealth() response shape, wrangler.toml define stanza, deploy workflow changes (both envs), smoke-test.sh commit verification with retry
- Out: Deep health checks (D1/KV/R2 reachability), separate readiness endpoint, global version headers on all API responses, HTML/text format variants, new routes (reuse /health)

**Constraints**:
- Extend existing /health route — do not create a new route or /.well-known/ path
- Use wrangler --define for build metadata injection (not [vars], not secrets, not KV)
- Do not expose dependency versions, internal IDs, or infrastructure details
