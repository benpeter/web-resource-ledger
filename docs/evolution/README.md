# Evolution Log

A chronological record of how this project was built, step by step.

Each directory captures a phase of development: the prompts that drove it,
the decisions made, and the rationale behind them. This serves as both a
build diary and a reference for anyone interested in agent-driven
software development.

| Phase | Description |
|-------|-------------|
| [0001-kickoff](0001-kickoff/) | Initial MVP scoping and planning |
| [0002-scaffold](0002-scaffold/) | Project scaffold and Cloudflare Worker (Issue #1) |
| [0003-url-validation](0003-url-validation/) | URL validation and SSRF prevention (Issue #2) |
| [0004-backlog-extraction](0004-backlog-extraction/) | Backlog extraction from phases 0001-0003 |
| [0005-capture-endpoint](0005-capture-endpoint/) | Capture endpoint with browser rendering (Issue #3) |
| [0006-wacz-bundling-signing](0006-wacz-bundling-signing/) | WACZ bundling and Ed25519 signing (Issue #4) |
| [0007-retrieval-endpoint](0007-retrieval-endpoint/) | Retrieval endpoint for metadata and artifacts (Issue #5) |
| [0008-first-handish-tests](0008-first-handish-tests/) | First production deployment and live end-to-end testing |
| [0009-verification-endpoint](0009-verification-endpoint/) | Public verification endpoint with three-check pipeline (Issue #6) |
| [0010-static-verification-page](0010-static-verification-page/) | Static verification page with content negotiation (Issue #7) |
| [0011-openapi-security-hardening](0011-openapi-security-hardening/) | OpenAPI spec completion and security hardening (Issue #8) |
| [0012-open-source-readiness](0012-open-source-readiness/) | Open-source readiness: .gitignore, LICENSE, CI, contributor docs |
| [0013-readme-landing-page](0013-readme-landing-page/) | README restructure as project landing page (Issue #16) |
| [0014-browser-session-reuse](0014-browser-session-reuse/) | Browser session reuse with Playwright migration for 10x throughput (Issue #21) |
| [0015-coralogix-logging](0015-coralogix-logging/) | Minimum viable observability with Coralogix integration (Issue #17) |
| [0016-auth-identity-list-endpoint](0016-auth-identity-list-endpoint/) | Auth identity enrichment and list captures endpoint (Issues #38, #31) |
| [0017-key-versioning](0017-key-versioning/) | Key versioning and public key archive for signing key rotation (Issue #32) |
| [0018-staging-and-tos](0018-staging-and-tos/) | Staging environment with automated deploy and legal documents (Issues #39, #37) |
| [0019-cors-hsts-ratelimit](0019-cors-hsts-ratelimit/) | CORS for capture POST, HSTS preload directive, and X-RateLimit-Limit header (Issues #33, #34, #35) |
| [0020-hashed-ip-logging](0020-hashed-ip-logging/) | HMAC-SHA256 hashed IP logging and categorizeError fix (Issues #36, #52) |
| [0021-capture-parameterization-advisory](0021-capture-parameterization-advisory/) | Advisory: capture request parameterization (cookies, viewport, evidence integrity) |
| [0022-docs-drift-audit](0022-docs-drift-audit/) | Post-Act 1 documentation drift audit and fix |
| [0023-staged-fallback-timeout](0023-staged-fallback-timeout/) | Staged fallback for capture timeout -- partial captures (Issue #53) |
| [0024-cd-pipeline](0024-cd-pipeline/) | Production CD pipeline with environment protection (Issue #44) |
| [0025-rfc3161-timestamps](0025-rfc3161-timestamps/) | RFC 3161 timestamp integration -- independent TSA temporal proof (Issue #41) |
| [0026-secrets-env-docs-onboarding](0026-secrets-env-docs-onboarding/) | Secrets and environment documentation for fork-ready onboarding |
| [0027-dual-screenshot-consent](0027-dual-screenshot-consent/) | Dual-screenshot cookie consent dismissal via autoconsent (Issue #58) |
| [0028-tsa-sectigo](0028-tsa-sectigo/) | Switch RFC 3161 TSA from DigiCert to Sectigo (Issue #66) |
| [0029-load-settle-strategy](0029-load-settle-strategy/) | Switch navigation from networkidle to load + settle delay (Issue #67) |
| [0030-tsa-error-logging](0030-tsa-error-logging/) | Log TSA errors instead of silently swallowing (Issue #72) |
| [0031-stage-level-timings](0031-stage-level-timings/) | Stage-level timing instrumentation for capture renderer (Issue #75) |
| [0032-optimize-capture-timeline](0032-optimize-capture-timeline/) | Adaptive settle, consent timeout 2s, graceful consent failure (Issue #79) |
| [0033-cmp-navigation](0033-cmp-navigation/) | Fix cross-domain navigation block and multi-frame consent injection (Issue #81) |
| [0034-integration-tests](0034-integration-tests/) | Integration tests with real browser captures (Issue #69) |
| [0035-cli-verify-tool](0035-cli-verify-tool/) | Zero-install CLI tool for full cryptographic verification of captures (Issue #78) |
| [0036-fail-loudly-2](0036-fail-loudly-2/) | Eliminate silent catch blocks — fail loudly on unexpected errors (Issue #70) |
| [0037-staging-deploy-race-condition](0037-staging-deploy-race-condition/) | Fix staging-production deploy race condition with workflow_run trigger (Issue #86) |
| [0038-per-tenant-api-keys](0038-per-tenant-api-keys/) | Per-tenant API keys with KV-based lookup, admin API, scope enforcement, dual-mode legacy fallback |
| [0039-audit-logging](0039-audit-logging/) | Audit logging for authenticated requests -- full tenant activity trail |
| [0040-autonomous-orchestration](0040-autonomous-orchestration/) | Autonomous execution framework for completing WRL as a SaaS product (28 phases, Acts 3-6) |
| [0041-mcp-server](0041-mcp-server/) | MCP server for web evidence capture -- AI agent integration (Issue #45) |
| [0043-batch-capture-endpoint](0043-batch-capture-endpoint/) | Batch capture endpoint for bulk URL archival workflows (Issue #48) |
| [0044-queue-migration](0044-queue-migration/) | Queue migration for capture processing -- Cloudflare Queue producer/consumer (Issue #46) |
| [0045-per-tenant-rate-limiting](0045-per-tenant-rate-limiting/) | Per-tenant rate limiting with dual-layer enforcement and admin config (Issue #94) |
| [0046-coralogix-alerting-rules](0046-coralogix-alerting-rules/) | Coralogix alerting rules for production health monitoring (Issue #95) |
| [0047-d1-migration-metadata](0047-d1-migration-metadata/) | D1 migration for metadata -- KV to edge SQLite (Issue #96) |
| [0048-brand-identity-design-system](0048-brand-identity-design-system/) | Brand identity and CSS design system -- tokens, components, logo, favicon (Issue #97) |
| [0049-web-ui-capture-browsing](0049-web-ui-capture-browsing/) | Web UI for capture submission and browsing -- vanilla JS dashboard served from Worker (Issue #47) |
| [0050-npm-publish-ci-automation](0050-npm-publish-ci-automation/) | npm publish CI automation -- GitHub Actions workflow, version bump tooling, changelog generation (Issue #98) |
| [0051-documentation-site](0051-documentation-site/) | Static documentation site with 11ty v3, OpenAPI-generated API reference, WRL brand styling, Cloudflare Workers deployment (Issue #99) |
| [0052-landing-page](0052-landing-page/) | Static HTML/CSS landing page for webresourceledger.com (Issue #100) |
| [0053-usage-metering](0053-usage-metering/) | Per-tenant usage metering with D1 counters and admin endpoint (Issue #101) |
| [0054-webhooks-outbound-callbacks](0054-webhooks-outbound-callbacks/) | Outbound webhook notifications for capture lifecycle events (Issue #102) |
| [0055-self-serve-signup-oauth](0055-self-serve-signup-oauth/) | GitHub OAuth self-serve signup with auto-tenant provisioning, session management, account settings UI (Issue #103) |
| [0056-tenant-quotas](0056-tenant-quotas/) | Per-tenant usage quotas with tier-based limits, pre-capture enforcement, web UI usage dashboard (Issue #104) |
| [0070-stripe-legal-pages](0070-stripe-legal-pages/) | Stripe-required legal pages: privacy, refund, terms, content policy (Issue #131) |
| [0071-replace-worker-url-with-custom-domain](0071-replace-worker-url-with-custom-domain/) | Replace wrl.benpeter.workers.dev with api.webresourceledger.com across code, config, and docs (Issue #134) |
| [0057-e2e-test-suite-playwright](0057-e2e-test-suite-playwright/) | Playwright e2e test suite: 10 tests across 6 specs, CI workflow, staging tenant provisioning (Issue #105) |
| [0058-stripe-usage-billing](0058-stripe-usage-billing/) | Stripe usage-based billing: checkout, portal, webhook handlers, D1 billing columns, grace period logic (Issue #106) |
| [0059-scheduled-captures-cron](0059-scheduled-captures-cron/) | Scheduled captures with Cron Triggers: CRUD API, fan-out handler, per-tenant limits, web UI panel (Issue #107) |
| [0060-capture-metering-stripe-pipeline](0060-capture-metering-stripe-pipeline/) | Capture metering to Stripe pipeline: hourly batch reporter, graduated pricing, billing dashboard endpoint (Issue #108) |
| [0061-content-security-scanning](0061-content-security-scanning/) | Content security scanning: Google Web Risk pre-capture screening, daily rescan cron, quarantine enforcement (Issue #109) |
| [0062-capture-auth-gate](0062-capture-auth-gate/) | Capture auth gate for multi-tenant: tenant auth on retrieval endpoints, share tokens for delegated access, CLI token propagation (Issue #110) |
| [0063-eidas-qualified-timestamps](0063-eidas-qualified-timestamps/) | eIDAS qualified timestamps: account-level opt-in, dual-TSA WACZ assembly, verification, Stripe billing, settings UI (Issue #138) |
| [0059b-capture-quality](0059b-capture-quality/) | Capture quality improvements: error page detection, subresource limit 200→500, autoconsent v14.63.0, lazy-load scrolling, test battery |
