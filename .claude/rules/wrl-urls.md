- **Production**: `https://api.webresourceledger.com` (custom domain, migrated from wrl.benpeter.workers.dev in PR #140)
- **Staging**: `https://wrl-staging.benpeter.workers.dev` (still on workers.dev, pending staging subdomain)
- **Workers subdomain**: `benpeter.workers.dev` (legacy, still routes but no longer referenced in code)

Use `api.webresourceledger.com` for all production API calls. The old `wrl.benpeter.workers.dev` URL still works (same Worker) but is no longer in code or docs.
