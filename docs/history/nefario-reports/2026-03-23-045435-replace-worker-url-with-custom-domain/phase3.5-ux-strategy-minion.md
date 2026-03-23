APPROVE

No concerns from the UX strategy domain.

This migration strictly reduces cognitive load for users. The custom domain `api.webresourceledger.com` is self-describing and signals a stable, production-grade API; the workers.dev subdomain leaks internal infrastructure details and requires users to make an inference about official status.

All user-facing touchpoints are covered: the OpenAPI spec users read to understand the API, the MCP docs users follow to configure clients, the `server.json` they copy-paste, and the error messages surfaced by the verify CLI. Coverage is complete.

Removing the legacy server entry from `openapi.yaml` is the correct call. Keeping a stale URL as a documented alias creates a false choice — two server entries with no guidance on which to use — which is a direct violation of Nielsen's heuristic 1 (system status visibility) and adds unnecessary decision burden for any user reading the spec.

No user journeys change. No new decision points are introduced. No features are added.
