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
