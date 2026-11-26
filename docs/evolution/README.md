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
| [0075-simplify-capture-access-model](0075-simplify-capture-access-model/) | Simplify capture access model: remove share tokens, make individual capture endpoints public, auth-gate list only (Issue #169) |
| [0076-billing-ui-panel](0076-billing-ui-panel/) | Billing UI panel: usage dashboard with charges, pricing tiers, invoice threshold, payment status, Stripe portal link, eIDAS add-on (Issue #170) |
| [0074-legal-evidence-positioning](0074-legal-evidence-positioning/) | Legal-evidence positioning: landing page FRE/eIDAS framing, Legal Evidence docs guide, verification comparison (Issue #142) |
| [0073-fre-902-13-certificate](0073-fre-902-13-certificate/) | FRE 902(13) certification PDF: deterministic Ed25519-signed document, API endpoint, web UI download button, 42 tests (Issue #141) |
| [0077-settings-schedules-ui-polish](0077-settings-schedules-ui-polish/) | Settings & schedules UI polish: 18+ missing CSS selectors, card padding, mobile breakpoints, billing DOM cleanup (Issue #161) |
| [0072-email-notifications](0072-email-notifications/) | Email notifications: 6 transactional types, Resend delivery via queue, RFC 8058 unsubscribe, preferences API + UI, OAuth email auto-population (Issue #111) |
| [0078-ui-fixes-batch](0078-ui-fixes-batch/) | UI fixes batch: URL auto-prepend in capture form, "Art." → "Article" on verify page, billing stat spacing (Issues #179, #180, #183) |
| [0080-ui-ux-fixes-batch](0080-ui-ux-fixes-batch/) | UI/UX fixes batch: sign-in contrast, billing status dedup, docs nav link, key-creation alert (Issue #213) |
| [0079-homepage-pricing-screenshot-quality](0079-homepage-pricing-screenshot-quality/) | Homepage pricing update and screenshot quality: real graduated tier pricing, deviceScaleFactor 2→4 (Issues #182, #184) |
| [0065-api-versioning](0065-api-versioning/) | API versioning and stability commitment: v1.0.0, CHANGELOG.md, DEPRECATION-POLICY.md, CI enforcement, WRL-API-Version header (Issue #113) |
| [0066-mcp-directory-listings](0066-mcp-directory-listings/) | MCP directory listings and ecosystem: server.json registry update, Glama/MCP.so/awesome-lists submissions, doc bug fixes, 6 client integration examples (Issue #114) |
| [0067-change-detection-diffing](0067-change-detection-diffing/) | Change detection and diffing: diff API endpoint, HTML text diff (diff-match-patch-es), screenshot hash + client pixel diff, header diff, change badges, visual diff UI with 3 modes, webhook enrichment (Issue #115) |
| [0068-cdn-verification-traffic](0068-cdn-verification-traffic/) | CDN for verification traffic: Workers Cache API per-colo caching, admin cache purge endpoint, verify subdomain routing, Server-Timing headers, operational docs (Issue #116) |
| [0080-notification-email-change](0080-notification-email-change/) | Email verification flow: pending-email pattern, HMAC tokens with 24h expiry, GET+POST verification, resend with cooldown, cross-tab detection (Issue #195) |
| [0069-compliance-documentation](0069-compliance-documentation/) | Enterprise compliance documentation: security whitepaper, DPA template, subprocessor list, incident response, data retention/deletion, privacy policy fixes (Issue #117) |
| [0081-webhook-docs-payload-fixes](0081-webhook-docs-payload-fixes/) | Webhook docs & payload fixes: artifact URLs in capture.complete, signature echo in ping response, 9 docs corrections, OpenAPI updates (Issue #212) |
| [0082-backend-fixes-batch](0082-backend-fixes-batch/) | Backend fixes batch: notification skip for approaching_limit, descriptive Content-Disposition filenames (Issues #187, #181, #214) |
| [0083-merge-timestamp-checks](0083-merge-timestamp-checks/) | Merge timestamp checks: single "Time verification" row replacing separate Timestamp imprint and Qualified timestamp rows (Issue #167) |
| [0084-email-verify-tests](0084-email-verify-tests/) | Email verification flow tests: 31 tests for token generation, GET/POST handlers, resend, and notification continuity (Issue #199) |
| [0085-mcp-api-sync](0085-mcp-api-sync/) | Sync MCP server with current API surface and establish drift prevention (Issue #202) |
| [0086-mermaid-architecture-diagrams](0086-mermaid-architecture-diagrams/) | Add Mermaid architecture diagrams to docs site: user interaction flows + capture pipeline & integrity chain (Issue #168) |
| [0087-llm-developer-reference](0087-llm-developer-reference/) | LLM-oriented developer reference for WRL internals: D1 schema, API routes, bindings, secrets, queues, crons (Issue #201) |
| [0088-autoconsent-ci](0088-autoconsent-ci/) | Automated autoconsent update pipeline: GitHub Action for weekly vendor updates with test battery (Issue #152) |
| [0089-landing-legal-section-ordering](0089-landing-legal-section-ordering/) | Landing page section reorder: Use Cases above How It Works, trust bar rejected, legal claims stay in use case card (Issue #207) |
| [0090-feature-list-competitor-comparison](0090-feature-list-competitor-comparison/) | Feature list and competitor comparison table on landing page and docs site (Issue #144) |
| [0091-seo-geo-optimization](0091-seo-geo-optimization/) | SEO + GEO optimization for landing page and docs site — structured data, FAQ, sitemaps, llms.txt (Issue #215) |
| [0092-legal-flag-verify-cli](0092-legal-flag-verify-cli/) | --legal flag for verify CLI: 7-section plain-text and JSON legal reports with FRE 901(b)(9) and eIDAS Art. 41 references (Issue #166) |
| [0093-admin-dashboard](0093-admin-dashboard/) | Operator admin dashboard: tenant list, per-tenant detail, platform overview, admin auth gate, 3 API endpoints (Issue #203) |
| [0094-sign-in-button-contrast-fix](0094-sign-in-button-contrast-fix/) | Fix CSS specificity bug: Sign-in button text unreadable in landing page header, WCAG AA contrast failure (Issue #225) |
| [0095-fix-toctou-swap-verified-email](0095-fix-toctou-swap-verified-email/) | Fix TOCTOU gap in swapVerifiedEmail() WHERE clause — pin pending_email = ? (Issue #222) |
| [0097-table-flip](0097-table-flip/) | Flip comparison tables to standard features-as-rows orientation, fix docs layout overflow with scoped wide-content modifier (Issue #233) |
| [0098-docs-nav](0098-docs-nav/) | Add 2-level hierarchy to docs left rail navigation with section grouping (Issue #235) |
| [0099-unified-nav](0099-unified-nav/) | Unified navigation header and footer across all WRL subdomains: shared site-nav.css, site header on docs and app UI, full footer on all surfaces (Issue #224) |
| [0100-honest-positioning](0100-honest-positioning/) | Honest positioning update: acknowledge where WRL loses, credit Webrecorder, add "When to Use Something Else" sections, update stale status copy, add "How WRL Was Built" docs page |
| [0102-pirsch-analytics](0102-pirsch-analytics/) | Server-side Pirsch Analytics tracking across all three Workers: page views, funnel events, OAuth attribution passthrough, zero client-side JS (Issue #248) |
| [0103-swgde-docs-alignment](0103-swgde-docs-alignment/) | SWGDE Best Practices alignment mapping page and cross-references for forensic web capture documentation (Issue #259) |
| [0104-segment-faq-landing-page](0104-segment-faq-landing-page/) | Segment-targeted FAQ expansion: 12 questions across legal, OSINT, compliance, brand protection with FAQPage JSON-LD (Issue #255) |
| [0105-auto-investigate-coralogix-alerts](0105-auto-investigate-coralogix-alerts/) | Automated Coralogix alert investigation via webhook receiver, GitHub Actions, and Claude Code (Issue #139) |
| [0106-diff-view-any-two-captures](0106-diff-view-any-two-captures/) | Compare any two captures of the same URL from the dashboard, not just the latest scheduled pair (Issue #236) |
| [0107-stripe-authoritative-billing](0107-stripe-authoritative-billing/) | Stripe-authoritative billing amounts: cache upcoming invoice from Stripe, show actual vs estimated charges |
| [0108-drop-despicable-agents](0108-drop-despicable-agents/) | Stop using despicable-agents: remove the agent-framework and process.md instructions from CLAUDE.md, keep the evolution log |
| [0109-free-storage-limit](0109-free-storage-limit/) | Free storage limit raised from 1 GB to 10 GB per month; storage and scheduler cut-offs now send the limit_reached email |
| [0110-remove-alert-investigation](0110-remove-alert-investigation/) | Remove the Coralogix webhook, the Worker endpoint and the GitHub Actions alert-investigation workflow; alerts are email-only |
| [0111-autoconsent-pipeline](0111-autoconsent-pipeline/) | Weekly autoconsent PRs get a real CI run, and the battery compares the update against the deployed version on staging instead of re-testing the old one |
| [0112-auth-alert-noise](0112-auth-alert-noise/) | Auth Failure Spike alert ignores requests without a credential and fires above 10 in 15 minutes; cron logs checked complete |
| [0113-analytics-events](0113-analytics-events/) | Pirsch counts HTML page views only and receives capture, first-capture, schedule and payment events it accepts, without account identifiers |
| [0114-first-key-recovery](0114-first-key-recovery/) | The first API key waits 24 hours instead of 1, a missing key can be replaced on the welcome screen, and both cases are counted |
| [0115-findable-capture-form](0115-findable-capture-form/) | Docs and landing say you can capture from the browser; Getting Started polls the status endpoint instead of a record that answers 404 while pending |
| [0116-use-case-pages](0116-use-case-pages/) | Docs pages for preserving a site, compliance surveys and seller or listing evidence; batch docs say 20 URLs, as production allows |
| [0117-tall-page-screenshots](0117-tall-page-screenshots/) | Pages taller than 8000 px failed every capture; the screenshot is now clipped to the top 8000 px instead |
| [0118-screenshot-scale-2x](0118-screenshot-scale-2x/) | Screenshots render at 2x device scale instead of 4x, about a quarter of the size |
| [0119-pirsch-log-await](0119-pirsch-log-await/) | Pirsch rejection logs and six other failure logs can no longer be dropped when a Worker ends |
| [0120-scheduled-double-count](0120-scheduled-double-count/) | Scheduled captures count once, when they complete, instead of twice |
| [0121-failure-reasons](0121-failure-reasons/) | Bot-check pages fail the capture instead of completing, and failed captures keep the reason of the last attempt everywhere |
| [0122-landing-demo-capture](0122-landing-demo-capture/) | The landing hero links to a real capture that visitors can verify themselves |
| [0123-dlq-alert](0123-dlq-alert/) | Alert on captures that land in the dead-letter queue, the normal path for permanent failures that no alert covered |
| [0124-landing-https](0124-landing-https/) | Redirect plain HTTP to HTTPS on every host and send HSTS from the landing page; the old Transform Rule was already gone |
| [0125-tracker-hygiene](0125-tracker-hygiene/) | Repo backlog frozen and cleaned; TSA and license notes checked against production and corrected |
| [0126-queue-lifecycle-docs](0126-queue-lifecycle-docs/) | INTERNALS.md describes how a capture moves through the queue, retries and the dead-letter queue |
| [0127-e2e-own-echo](0127-e2e-own-echo/) | The E2E webhook test uses an echo endpoint on the landing Worker instead of httpbin.org |
| [0128-support-contact](0128-support-contact/) | hello@webresourceledger.com for requests, a support page with no SLA, and docs headings with ids so anchor links work |
| [0129-retention-purges](0129-retention-purges/) | Weekly purge of quarantined captures after 90 days and trimming of usage counters after 12 periods; the weekly cron runs on Mondays and no longer runs the schedule tick a second time |
| [0130-bulk-capture](0130-bulk-capture/) | Read a sitemap through the API, MCP and dashboard, and capture a pasted list or sitemap from the dashboard at the tenant's rate limit |
| [0131-email-login](0131-email-login/) | Sign in with an emailed link as an alternative to GitHub |
| [0132-schedule-management](0132-schedule-management/) | Edit, pause and resume schedules (API, MCP, dashboard), see one schedule's captures, schedule status follows its capture |
| [0133-ci-node24-playwright](0133-ci-node24-playwright/) | Scheduled E2E runs work again on Ubuntu 26.04 runners (Playwright 1.65), and every GitHub Action runs on Node 24 |
| [0134-usage-api-key](0134-usage-api-key/) | `GET /v1/account/usage` takes an API key as documented, its API reference matches the response, and the quota E2E test waits for the usage counter |
| [0135-mcp-sdk-security](0135-mcp-sdk-security/) | `/mcp` limits request bodies to 256 KiB and tool arguments to 1,000 elements; MCP SDK 1.32.2 and zod 4.6.7; production dependencies have no audit findings |
| [0136-landing-assets-log](0136-landing-assets-log/) | Landing and docs Workers log failed asset fetches, the queue consumer logs when it can't mark a capture failed, and telemetry no longer shows as Critical in Coralogix |
| [0137-mcp-docs-sync](0137-mcp-docs-sync/) | MCP guide documents every tool and a test keeps it that way; `list_schedules` shows paused schedules; `docs/mcp.md` points to the guide |
| [0138-sign-partial-captures](0138-sign-partial-captures/) | Partial captures get a signed, timestamped WACZ and verify like full ones; every bundle records `captureQuality`; the verify page and `verify_capture` show a partial render |
| [0139-stale-pending-captures](0139-stale-pending-captures/) | Captures still pending a day after submission are marked failed on the hour; MCP stops telling agents to resubmit after 30 seconds; Coralogix event list and log severities match Coralogix |
| [0140-digest-dates](0140-digest-dates/) | The weekly digest names its period as dates instead of timestamps |
| [0141-screenshot-coverage](0141-screenshot-coverage/) | Captures record whether the screenshot shows the whole page or only its top 8,000 px, signed into the WACZ and shown on the verify page and in `get_capture` |
| [0142-route-table-sync](0142-route-table-sync/) | The INTERNALS route table lists every route with the right auth, the API reference marks the notification routes session-only, and a test keeps router, table and spec in step |
| [0143-auth-ratelimit-header](0143-auth-ratelimit-header/) | `X-RateLimit-Limit` on sign-in, account and billing routes says 10, the limit they share; the limits page lists the per-IP limits |
| [0144-mcp-keyless-discovery](0144-mcp-keyless-discovery/) | MCP directories can list WRL's tools: `initialize`, `ping` and `tools/list` answer without a key, rate-limited per IP; tool calls still need one |
| [0145-auth-scope-table](0145-auth-scope-table/) | The authentication guide's scope table covers every endpoint that takes an API key, checked by the route sync test; 1.1.0 released and tagged |
| [0146-alerts-sync](0146-alerts-sync/) | The incident-response page, whitepaper and ops guide name all eleven Coralogix alerts with their real thresholds, checked against `provision-alerts.sh` |
| [0147-request-state-isolation](0147-request-state-isolation/) | A request without credentials no longer inherits the previous caller's tenant: public capture reads stop returning 404 after an authenticated request, and the diff route needs its own key again |
| [0148-identity-docs](0148-identity-docs/) | The DPA, whitepaper and retention page cover email sign-in and the stored notification address; the legal-evidence page says what happens when the timestamp authority can't be reached |
| [0149-email-login-logs](0149-email-login-logs/) | Failed writes of the sign-in link counters and failed cleanup of expired links are logged instead of discarded |
| [0150-first-key-tos](0150-first-key-tos/) | The first API key can't be fetched before the terms of service are accepted |
| [0151-vitest-4](0151-vitest-4/) | Tests run on vitest 4 and vitest-pool-workers 0.19; the request-state fix holds when env is a Proxy |
| [0152-tenant-deletion](0152-tenant-deletion/) | Admin routes request, cancel and carry out the account deletion the data-retention page promises; blocked accounts get a 403 instead of a garbled 429 |
| [0153-mcp-quota](0153-mcp-quota/) | MCP capture tools check the monthly quota and account state like the REST endpoints; `get_usage` shows real numbers for blocked accounts |
| [0154-verify-page-url](0154-verify-page-url/) | `@w-r-l/verify` 0.4.0 names the captured page and its capture time from the signed manifest; CI runs the package tests |
| [0155-mcp-threat-check](0155-mcp-threat-check/) | MCP capture tools screen URLs with Google Web Risk like the REST endpoints; security pages say eleven alerts and cover email sign-in |
| [0156-eidas-all-paths](0156-eidas-all-paths/) | Batch, MCP and scheduled captures get a qualified timestamp when the account has the setting on |
| [0157-schedule-limit](0157-schedule-limit/) | Schedule-limit 429 carries `limitType: "schedules"`, admin config answers 400 for a bad `schedules.maxSchedules`, docs state the limit of 10 and the compare tables show WRL schedules |
| [0158-schedule-list-limit](0158-schedule-list-limit/) | `GET /v1/schedules` and MCP `list_schedules` report the schedule limit, so the dashboard shows an operator-raised limit instead of always 10 |
| [0159-env-config-sync](0159-env-config-sync/) | Every Worker secret and variable documented and checked by `test/env-sync.test.js`; staging emails and webhooks link to staging; unread `STRIPE_PUBLISHABLE_KEY` removed |
| [0160-schedule-nudge](0160-schedule-nudge/) | The dashboard suggests a schedule on capture pages and after a capture in accounts without schedules, opening the schedule form with the URL filled in |
| [0161-bundle-software](0161-bundle-software/) | Evidence bundles and the header fetch name the WRL release and commit (`WRL/1.3.0+564eae4`) instead of `WRL/0.1` |
| [0162-api-response-schemas](0162-api-response-schemas/) | Schedule responses drop the internal `tenant_id`; the API reference documents the fields the responses carry, including the `qualifiedTimestamp` check |
| [0163-og-image](0163-og-image/) | Shared links to the landing page, its policy pages and the docs show a preview card image |
| [0164-first-capture-guide](0164-first-capture-guide/) | The empty captures list of a new account says what a capture gives, offers an example URL and links the API and MCP guides |
| [0165-digest-all-captures](0165-digest-all-captures/) | The weekly digest goes to every account with captures that week, with one row for captures no active schedule made |
| [0166-sign-in-links](0166-sign-in-links/) | The landing and docs sign-in buttons open the sign-in page with GitHub and an emailed link instead of going straight to GitHub |
| [0167-compare-refresh](0167-compare-refresh/) | The comparison page adds ProofSnap, DEPT and the archive.today context, and both pages count the tools in its table |
| [0168-email-notifications-docs](0168-email-notifications-docs/) | A docs page lists the emails WRL sends, when each goes out, where they go and how to turn them off |
| [0169-stale-fail-webhooks](0169-stale-fail-webhooks/) | A capture WRL lost track of sends the capture.failed webhook and email, and the webhook examples show the real retryable and quarantine values |
| [0170-rescan-every-night](0170-rescan-every-night/) | The nightly Web Risk re-scan checks every captured URL each night instead of every second night |
| [0171-docs-diagrams](0171-docs-diagrams/) | The docs diagrams, blocked by the CSP since March, are SVG images rendered from Mermaid sources, with their content corrected |
| [0172-capture-event-ip](0172-capture-event-ip/) | Capture events sent to Pirsch no longer give the captured site's address as the visitor's ip |
| [0173-security-txt](0173-security-txt/) | webresourceledger.com serves a security.txt that names the reporting channel, and the API, verify and docs hosts redirect to it |
| [0174-cloudflare-playwright-1-4](0174-cloudflare-playwright-1-4/) | Captures use `@cloudflare/playwright` 1.4.0, loaded only when a capture runs, so cold starts without a capture got faster instead of slower |
| [0175-site-deps-security](0175-site-deps-security/) | The docs site build dependencies have no open Dependabot or npm audit findings; the built pages are unchanged |
| [0176-problem-fields](0176-problem-fields/) | The API reference describes the extra fields of 429, 422 and 451 problem responses and the 451s of verify and diff |
| [0177-openapi-webhooks](0177-openapi-webhooks/) | `openapi.yaml` describes the webhook delivery request, so the API reference and client generators show its headers and body |
| [0179-verify-preview-card](0179-verify-preview-card/) | A verification link pasted into a chat or a post shows a card with the captured page and the capture time |
| [0178-subresource-cap-partial](0178-subresource-cap-partial/) | A page can make 2000 requests instead of 500, and a page past the cap is captured as partial instead of failing on some runs; the capture says the cap was reached |
| [0180-render-http-status](0180-render-http-status/) | A capture records the HTTP status the site answered the browser with, and says so where people look when it was an error, so a block page no longer passes as the page |
| [0181-mcp-keyless-lists](0181-mcp-keyless-lists/) | MCP directories that ask for resources and prompts without a key get "there are none" instead of a 401 |
| [0182-battery-blocked-sites](0182-battery-blocked-sites/) | The battery gate of the weekly autoconsent update leaves out sites that refused the browser instead of blaming the update for them |
| [0183-verify-cli-capture-quality](0183-verify-cli-capture-quality/) | The standalone verifier says when a capture is partial, shows only the top of the page, or shows an error answer from the site |
| [0184-partial-full-pipeline](0184-partial-full-pipeline/) | A page that hits the 20 second load timeout gets the settle, scroll and consent steps before it is captured as partial, and a blank one fails instead of being stored |
| [0185-after-consent-reload](0185-after-consent-reload/) | After a cookie banner is declined WRL lets the page come to rest, and scrolls a page that reloaded itself again, before the second screenshot |
| [0186-smoke-refusal-reason](0186-smoke-refusal-reason/) | Deploys had stopped because the staging smoke tenant was out of quota; the smoke test now says why a capture was refused, and the runbook names the tenant and its limit |
| [0187-consent-json-rules](0187-consent-json-rules/) | WRL sends autoconsent's hand-written JSON rules to the page and gives a banner up to 10 seconds, so 19 of 36 test sites get their cookie banner declined where 5 did; a consent tool that shows no banner is `notDetected`, not `failed` |
| [0188-late-reload-after-consent](0188-late-reload-after-consent/) | A site that reloads itself later than 2 seconds after its banner was declined is captured after the reload, not halfway through it; the attempt used to fail when the reload came while the HTML was read |
| [0189-scroll-in-one-call](0189-scroll-in-one-call/) | The scroll that loads lazy content runs inside the page in one call, for 10 seconds at most: on a page with 1,400 ad requests it took 39 to 74 seconds and takes 10 to 18; a screenshot that runs into its 90 second limit is reported as such |
| [0190-reload-during-settle](0190-reload-during-settle/) | A site that reloads itself while WRL waits for open requests after a declined banner (2 to 5 seconds after the choice) is captured after the reload, with its scroll; phases 0185 and 0188 covered the time before and after that wait |
| [0191-consent-setup-limit](0191-consent-setup-limit/) | Setting up the cookie banner step has 15 seconds: on a page with 340 ad frames a call to the browser stayed unanswered and the capture sat for ten minutes until its attempt was ended |
| [0192-render-logs-no-wait](0192-render-logs-no-wait/) | The renderer sends its log lines without waiting for each one and waits for all of them once the browser is released; a capture spent about 2 seconds on those waits |
| [0193-schedule-update-log](0193-schedule-update-log/) | A schedule edit logs its edited fields as `fields` under one event name; as `changed` the log store kept the line as unparsed text, so no query found the edit that explained an hourly schedule |
| [0194-page-check-limit](0194-page-check-limit/) | The two checks of the loaded page before the scroll and the two small calls after it have 15 seconds each; on a page that kept the browser busy an attempt sat in one of them for two minutes, until the browser session was closed for being idle |
| [0195-height-read-limit](0195-height-read-limit/) | The height read before each screenshot and the ready state read after a navigation timeout have 30 seconds each, the last two small calls to the page without a limit; in one attempt 148 seconds passed before a screenshot that has 90 failed |
| [0196-capture-retention](0196-capture-retention/) | Captures older than `CAPTURE_RETENTION_DAYS` are deleted hourly (staging sets 30, production keeps captures), and an admin route deletes a tenant's captures and keeps the account; used for the founder tenant's 609 captures |
| [0197-browser-location](0197-browser-location/) | A capture records where its browser went out to the web (Cloudflare data center and country, from Cloudflare's trace page, once per session) in `captureSettings.browserLocation`, signed into the WACZ and shown on the verification page, dashboard, MCP and certificate |
| [0198-battery-location](0198-battery-location/) | The autoconsent battery records each capture's data center, and a banner lost in another data center is a `location` change, not a regression |
| [0199-datadome-bot-check](0199-datadome-bot-check/) | nytimes.com and etsy.com answer WRL's browser with a DataDome captcha page (HTTP 403), which failed as a blank page; it is now recognised and the capture fails with "The site showed a DataDome bot check instead of the page" |
| [0200-limit-warning-emails](0200-limit-warning-emails/) | A free account gets a warning at 8 of its 10 GB of storage, and an email when a batch asks for more free captures than are left, each once a month under the existing "Approaching limit" and "Limit reached" preferences |
| [0201-hold-requests-during-screenshots](0201-hold-requests-during-screenshots/) | While WRL takes the screenshots, after the page has loaded, settled and been scrolled, new requests are held back (the page's own reload excepted), so screenshots of ad-heavy pages no longer wait for hundreds of ad requests; the count is recorded as `requestsHeldBack` |
| [0202-size-cap-partial](0202-size-cap-partial/) | Past 50 MB a page is captured as partial (`render.sizeLimitReached`) instead of failing, for the whole capture, and the rendered HTML gets its own 15-million-character limit before it is read into the Worker; an hourly workflow emails when a Worker run hits `exceededMemory` |
| [0203-public-endpoint-hardening](0203-public-endpoint-hardening/) | The capture record and status called without a key get the per-IP limit artifacts already had, every API response carries `X-Robots-Tag: noindex`, and tests pin that a wrong key gets 401 on the public capture routes |
| [0204-alert-names-captures](0204-alert-names-captures/) | The worker health alert lists the captures the killed runs were working on, with account, GitHub login and page, found in Coralogix as attempts without an outcome |
| [0205-resend-bounces](0205-resend-bounces/) | Resend reports bounces and spam complaints to `POST /v1/resend/webhook`: a permanent bounce unverifies the notification address, a complaint turns its notifications off |
| [0207-webhook-pause-redeliver](0207-webhook-pause-redeliver/) | `PATCH /v1/webhooks/{id}` pauses, resumes or changes a webhook, and `POST /v1/webhooks/{id}/redeliver` sends a finished capture's event again |
