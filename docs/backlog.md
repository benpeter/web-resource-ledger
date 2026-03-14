# Backlog

Items deferred from MVP scope. Extracted from `docs/evolution/` and
`docs/history/` after phases 0001-0003. Updated through 0010-static-verification-page.

Tier definitions:
- **[must]** -- explicitly committed to or "must add before production"
- **[should]** -- strong specialist consensus it's needed, no hard commitment
- **[consider]** -- mentioned as a possibility, may or may not be needed

Sources are abbreviated: `kickoff` = 0001, `scaffold` = 0002, `urlval` = 0003.
Agent names reference the specialist who raised the item.

---

## Auth and Access Control

- [must] Per-tenant API keys -- single static key is MVP only; need per-tenant keys before second user (security-minion, kickoff)
- [must] API key rotation without downtime -- support multiple active keys (security-minion, kickoff)
- [must] Key scoping -- read vs write permissions per key (security-minion, kickoff)
- [must] Audit logging of key usage (security-minion, kickoff)
- [must] Tenant isolation / RBAC -- required before multi-user (security-minion, kickoff)
- [consider] OAuth for web UI -- only if a web capture UI is built (security-minion, kickoff)
- [consider] Social signup (GitHub first) -- YAGNI until multi-user (margo, kickoff)

## API

- [must] List/search captures (`GET /v1/captures`) -- "first addition post-MVP" (MVP.md, api-design-minion, kickoff)
- [should] Rate limit headers in responses -- `Retry-After` implemented on 429 and 202/pending; `X-RateLimit-*` headers (limit, remaining, reset) still deferred (api-design-minion, kickoff; partial: capture-endpoint)
- [should] CORS configuration -- retrieval GET endpoints use `*` (retrieval-endpoint); capture POST endpoint should restrict origins (security-minion, kickoff; partial: retrieval-endpoint)
- [should] Queue migration for capture processing -- ctx.waitUntil() has 30s hard limit; Cloudflare Queue gives 15min processing budget; add when slow-page timeouts recur (edge-minion, capture-endpoint)
- [consider] Per-tenant rate limiting -- current rate limit keys on CF-Connecting-IP; should switch to tenant ID when per-tenant keys are added (edge-minion, capture-endpoint)
- [consider] Webhooks / outbound callbacks -- additional notification channel alongside polling (api-design-minion, kickoff)
- [consider] Batch capture -- multiple URLs in one request (api-design-minion, kickoff)
- [consider] SSE / WebSocket -- alternative async notification for capture completion (api-design-minion, kickoff)
- [consider] Pagination, filtering, sorting -- depends on list endpoint (api-design-minion, kickoff)

## Signing and Legal Admissibility

- [should] RFC 3161 timestamps via TSA -- upgrade path designed (add entry to signatures array), requires ASN.1 parsing (gru vs security-minion conflict, resolved: deferred; kickoff)
- [should] Key versioning / key ID in signature entries -- needed for key rotation; without it, verification returns false for captures signed with rotated keys (security-minion, kickoff; confirmed: verification-endpoint)
- [should] Old public key archive endpoint -- needed for verifying captures signed with rotated keys (security-minion, kickoff; confirmed: verification-endpoint)
- [consider] eIDAS Qualified TSA -- strategic for European customers, eIDAS 2.0 rollout by end 2026 (gru, kickoff)
- [consider] WACZ-Auth signing spec -- full implementation, MVP uses simplified version (gru, kickoff)
- [consider] Domain-ownership certificate -- identity proof component of WACZ-Auth (gru, kickoff)
- [consider] Multiple TSAs for redundancy -- FreeTSA has no SLA (gru, kickoff)
- [consider] HSM-backed key storage -- mentioned for production key management (security-minion, kickoff)

## Capture Fidelity

- [should] Screenshot timing / wait-for-load -- pages with dynamic content, lazy loading, or CSR may not be fully rendered (process.md, kickoff; deliberately untested)
- [consider] Screenshot height cap is 8000px -- pages taller than this produce capped screenshots; may need configurable viewport height (edge-minion, capture-endpoint)
- [consider] Resource manifest (CSS/JS/images) -- captured individually; significant complexity escalation (MVP.md)
- [consider] Full HTTP exchange capture -- Scoop-style proxy-based; forensic-grade (MVP.md, gru, kickoff)
- [consider] Sub-resource archiving -- offline replay fidelity (gru, kickoff)
- [consider] Certificate info capture -- not available via Browser Rendering REST API (gru, kickoff)
- [consider] Network timing capture -- not available via Browser Rendering REST API (gru, kickoff)

## Security

- [should] TOCTOU gap mitigation -- Browser Rendering re-resolves DNS independently; `captureHeaders` fetch also uses original hostname; both legs share the gap and should be addressed together; Puppeteer request interception available (urlval decisions #3, security-minion; updated: capture-endpoint)
- [should] Puppeteer request interception for cross-domain navigation blocking -- defense-in-depth against TOCTOU in browser session; currently interception is in place for subresource counting only; accepted risk for MVP (security-minion, capture-endpoint)
- [should] ~~Captured HTML XSS prevention~~ -- DONE (retrieval-endpoint): HTML artifacts served as text/plain with Content-Disposition: attachment at both R2 write time and Worker serve time
- [should] Content security scanning -- prevent WRL from being used as malware mirror; check against Safe Browsing (security-minion, kickoff)
- [should] Security monitoring and alerting -- log SSRF blocks, auth failures, rate limit hits; alert on anomalous patterns (security-minion, kickoff)
- [should] Content moderation policy and abuse reporting mechanism (security-minion, kickoff)
- [should] Terms of service prohibiting illegal use (security-minion, kickoff)
- [consider] Network namespace isolation for browser -- defense-in-depth; browser can only reach public internet (security-minion, kickoff)
- [consider] DNS rebinding integration tests -- requires controlled DNS with TTL manipulation (urlval outcome)
- [consider] Cloud metadata DNS alias tests -- only resolvable inside cloud VPCs (urlval outcome)

## Storage and Immutability

- [consider] S3 Object Lock (WORM-certified) -- for regulated customers (SEC 17a-4, FINRA) (gru, iac-minion, kickoff)
- [consider] Database for metadata -- add when query-by-attribute needed (margo, iac-minion, kickoff)
- [consider] D1 (edge SQLite) -- if KV becomes limiting for metadata queries (iac-minion, kickoff)

## Operations

- [must] CI/CD pipeline -- "add GitHub Actions when it hurts" or >1 developer (MVP.md, iac-minion, kickoff)
- [should] Structured logging -- "add when debugging becomes painful" (iac-minion, kickoff)
- [consider] Preview deployments on PRs -- CI/CD enhancement (iac-minion, kickoff)
- [consider] Fastly CDN layer -- evaluate when verification traffic justifies it (iac-minion, kickoff)
- [consider] Capture service container migration -- if Browser Rendering limits hit (iac-minion, kickoff)
- [consider] R2 artifact streaming -- switch `arrayBuffer()` to `obj.body` ReadableStream in artifact handler and verification endpoint when workerd test runner supports it or when large WACZ bundles (>10MB) become common; verification endpoint has 100MB hard limit (margo, retrieval-endpoint; updated: verification-endpoint)

## Verification Page

- [should] HSTS header -- global decision deferred from Step 7 to Step 8; affects all responses not just verification (security-minion, static-verification-page)
- [consider] HTML error pages for 404/429/503 -- browsers currently display JSON problem responses; acceptable for MVP (margo, static-verification-page)
- [consider] Nonce-based CSP -- upgrade from unsafe-inline if template ever needs server-side dynamic data in script blocks (security-minion, static-verification-page)

## Product Features

- [consider] Scheduled captures (cron-style) -- additional trigger method (MVP.md)
- [consider] MCP / AI-agent triggers -- layers on top of API (MVP.md)
- [consider] Watch lists / bulk monitoring -- requires scheduling (also deferred) (MVP.md)
- [consider] Change detection / diffing -- requires multiple captures over time (MVP.md)
- [consider] Notifications -- event system, channel integrations (MVP.md)
- [consider] Billing and quotas -- no monetization for MVP (MVP.md)
- [consider] Web UI for capture submission -- curl/API sufficient for MVP (margo, kickoff)
- [consider] Capture ID recovery -- no list endpoint means lost ID = lost capture (ux-strategy-minion, kickoff)
