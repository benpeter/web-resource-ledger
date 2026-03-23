You are iac-minion. Add the new rate limiter binding and environment variable to `wrangler.toml`, then regenerate `wrangler.test.toml`.

## Context
Read `wrangler.toml`. Note the existing rate limiter bindings (CAPTURE_RATE_LIMITER through CAPTURE_IP_GUARD, namespace_ids 1001-1005 for production, 2001-2005 for staging).

## Changes to wrangler.toml

**1. Add AUTH_RATE_LIMITER binding (production):**
Add after CAPTURE_IP_GUARD (namespace_id 1005):
```toml
[[unsafe.bindings]]
name = "AUTH_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1006"
simple = { limit = 10, period = 60 }
```

**2. Add AUTH_RATE_LIMITER binding (staging):**
Add after the staging CAPTURE_IP_GUARD (namespace_id 2005):
```toml
[[env.staging.unsafe.bindings]]
name = "AUTH_RATE_LIMITER"
type = "ratelimit"
namespace_id = "2006"
simple = { limit = 10, period = 60 }
```

**3. Add GITHUB_CLIENT_ID to [vars] (production):**
Add to the existing `[vars]` section:
```toml
GITHUB_CLIENT_ID = ""
```
Leave empty -- will be set during deployment. It's a public value but we don't know it yet.

**4. Add GITHUB_CLIENT_ID to [env.staging.vars]:**
```toml
GITHUB_CLIENT_ID = ""
```

**5. Add comment documenting new secrets:**
Add a comment near the existing secrets documentation:
```toml
# OAuth secrets (set via wrangler secret put):
#   GITHUB_CLIENT_SECRET -- GitHub OAuth App client secret
#   SESSION_SECRET       -- HMAC key for session cookie signing (32+ random bytes, hex)
```

## Regenerate wrangler.test.toml

After modifying `wrangler.toml`, regenerate `wrangler.test.toml` by:
1. Read the existing `wrangler.test.toml` to understand the pattern
2. Copy `wrangler.toml` content
3. Remove ALL `[[queues.consumers]]` sections (queue consumers cause miniflare to auto-consume messages during tests, crashing the workerd runtime)
4. Write the result to `wrangler.test.toml`

## Deliverables
- Modified `wrangler.toml`
- Regenerated `wrangler.test.toml`

## What NOT to do
- Do NOT modify any existing binding
- Do NOT add the GITHUB_CLIENT_SECRET or SESSION_SECRET to [vars] (they are secrets)
- Do NOT add any queues, D1, R2, or KV bindings
