GitHub Actions secrets use the `WRL_` prefix (e.g., `WRL_PIRSCH_ACCESS_KEY`),
matching the variable names in `~/.secrets`. Cloudflare Worker secrets do NOT
use the prefix (e.g., `PIRSCH_ACCESS_KEY`).

Workflow files map between the two:
```yaml
env:
  PIRSCH_ACCESS_KEY: ${{ secrets.WRL_PIRSCH_ACCESS_KEY }}
```

When provisioning a new secret, set it in three places:
1. Cloudflare Worker: `wrangler secret put THING` (no prefix)
2. GitHub Actions: `gh secret set WRL_THING --env production` (with prefix)
3. `~/.secrets` / `~/.wrl-keys`: `WRL_THING=...` (with prefix)
