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
| [0029-tsa-error-logging](0029-tsa-error-logging/) | Log TSA errors instead of silently swallowing (Issue #72) |
