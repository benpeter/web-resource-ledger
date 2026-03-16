# Meta-Plan: R9 Staging Environment + R7 Content Moderation Policy and ToS

## Task Summary

Two issues combined into a single phase:

- **R9 (#39)**: Add a staging environment with isolated bindings and automated deploy-on-push-to-main via GitHub Actions, plus a smoke test script.
- **R7 (#37)**: Publish Terms of Service and content moderation policy documents, wire them into the API (Link header or endpoint), and provide an abuse reporting mechanism.

These are largely independent work streams that share one integration point: the staging environment should deploy and serve the ToS/policy content so it can be validated before production.

## Planning Consultations

### Consultation 1: Infrastructure -- staging environment and CI/CD

- **Agent**: iac-minion
- **Planning question**: Given this Cloudflare Worker project with a single-environment `wrangler.toml` (KV, R2, Browser Rendering, rate limiters, Coralogix vars), what is the minimal wrangler.toml `[env.staging]` configuration needed? Specifically: (a) how should KV namespaces, R2 buckets, and rate limiter bindings be isolated for staging; (b) what does the GitHub Actions deploy workflow look like (wrangler deploy --env staging, secret management via GitHub secrets vs. wrangler); (c) should the smoke test be a separate workflow job or a post-deploy step; and (d) how should the separate staging API key (CAPTURE_API_KEY) and SIGNING_KEY be managed? Note the existing CI workflow in `.github/workflows/ci.yml` runs tests+lint on push/PR -- the staging deploy should build on or run after this.
- **Context to provide**: `wrangler.toml`, `.github/workflows/ci.yml`, `package.json` (deploy script), `vitest.config.js`, `src/auth.js` (CAPTURE_API_KEY binding), `src/log.js` (CORALOGIX_SEND_KEY, CORALOGIX_ENDPOINT vars)
- **Why this agent**: iac-minion owns Cloudflare Worker deployment configuration, GitHub Actions workflows, and secret management. This is the core deliverable for R9.

### Consultation 2: Security -- secret isolation and ToS legal coverage

- **Agent**: security-minion
- **Planning question**: Two questions: (1) For the staging environment: what are the security requirements for isolating staging secrets from production? Should staging use its own Coralogix subsystem to avoid log cross-contamination? Any concerns about staging R2 bucket access patterns? (2) For ToS/content policy: what legal provisions are essential for a web archival service that stores third-party content (screenshots, HTML, HTTP headers, WACZ bundles)? What should the abuse reporting mechanism look like -- is a simple email address sufficient, or does a structured endpoint provide better operational security? Are there DMCA safe harbor considerations even though the scope says "out"?
- **Context to provide**: `src/auth.js` (current auth model), `src/capture.js` via summary (stores screenshots, HTML, headers, WACZ of arbitrary URLs), `wrangler.toml` (bindings), backlog.md (scope notes on DMCA being out)
- **Why this agent**: Security owns secret management review and threat modeling. For ToS, security-minion can evaluate whether the abuse mechanism is operationally sound and whether the ToS adequately covers the operator's liability for stored third-party content.

### Consultation 3: API design -- ToS surfacing mechanism

- **Agent**: api-design-minion
- **Planning question**: How should ToS and content moderation policy be surfaced from the API? Options include: (a) a `Link` header on every response pointing to ToS/policy URLs, (b) a dedicated `GET /v1/legal/terms` and `GET /v1/legal/policy` endpoint, (c) a field in the health endpoint response, (d) a `tos_url` field in the 202 capture response. Which approach best serves API consumers while keeping the implementation minimal? Should the ToS documents be served by the Worker itself (inline response) or hosted externally (GitHub Pages, static file)? What about versioning the ToS (date-stamped URLs)?
- **Context to provide**: `src/index.js` (route table, response structure), `src/responses.js` (response helpers), `openapi.yaml` (existing API surface)
- **Why this agent**: api-design-minion owns REST API design decisions. The ToS integration is an API surface question -- how to expose legal documents to API consumers without cluttering the core capture workflow.

### Consultation 4: Smoke test design

- **Agent**: test-minion
- **Planning question**: What should the smoke test script validate after a staging deploy? The success criteria call for "health check + capture round-trip." Given that capture round-trips take 5-30 seconds and require a real browser session, should the smoke test: (a) only hit `/health` and check for 200, (b) also perform a real capture and verify it completes, (c) verify the ToS endpoint/headers are present? Should it be a shell script (curl-based) or a Node.js script? How should it handle timeouts and retries for the async capture flow? Should it run as a GitHub Actions step or be a standalone script that can also be run locally?
- **Context to provide**: `src/index.js` (health endpoint, capture flow, verify endpoint), existing test suite structure (vitest with cloudflare pool), CI workflow
- **Why this agent**: test-minion owns test strategy. The smoke test needs to balance thoroughness with CI speed and reliability. A flaky smoke test is worse than no smoke test.

## Cross-Cutting Checklist

- **Testing**: INCLUDE -- test-minion consulted above for smoke test design (Consultation 4). Beyond smoke tests, no new unit tests are expected for the staging wrangler config itself, but any new ToS endpoint code needs tests. Phase 6 will handle running the existing test suite.
- **Security**: INCLUDE -- security-minion consulted above for secret isolation and ToS legal coverage (Consultation 2).
- **Usability -- Strategy**: INCLUDE -- The ToS/policy documents will be consumed by both API integrators and potentially end users visiting the verification page. ux-strategy-minion should advise on how ToS is surfaced to verification page visitors (footer link?) and whether the abuse reporting UX is frictionless enough to actually be used.
  - **Planning question for ux-strategy-minion**: For the ToS and content moderation policy: (a) how should these be linked from the verification page (`verify-page.js`)? A footer link is conventional but may be overlooked. (b) For the abuse reporting mechanism, is an email address sufficient, or should there be a structured form/endpoint? What makes an abuse report mechanism credible to a concerned party who encounters archived content they want removed? (c) Should the API 202 response include a ToS link, or does that create noise for integrators?
- **Usability -- Design**: EXCLUDE for planning -- the ToS documents are primarily text content, not interactive UI. The only UI touchpoint is adding a link to the existing verification page, which is a minimal change. ux-design-minion and accessibility-minion are not needed for planning but should be included in the Phase 3.5 architecture review if the verification page is modified.
- **Documentation**: INCLUDE -- Both ToS/policy documents ARE documentation (legal documentation). The OpenAPI spec needs updating for any new endpoints or headers. software-docs-minion should advise on where legal documents should live in the repo structure and how to version them.
  - **Planning question for software-docs-minion**: Where should ToS and content moderation policy documents live in the repo? Options: (a) top-level `/legal/` directory, (b) `docs/legal/`, (c) served inline from the Worker with no file on disk. The documents need to be versioned (date-stamped). How should the OpenAPI spec be updated to reflect any new ToS endpoints or Link headers? Should the evolution log structure change to accommodate legal document versioning?
- **Observability**: EXCLUDE for planning -- the staging environment will naturally inherit the existing Coralogix integration. security-minion's consultation covers whether staging should use a separate Coralogix subsystem. No new observability design is needed.

## Anticipated Approval Gates

1. **API design decision for ToS surfacing** (MUST gate) -- How ToS/policy is exposed in the API (Link headers vs. dedicated endpoints vs. inline) is a contract decision that affects multiple downstream tasks (the Worker code, OpenAPI spec update, verification page update, smoke test). Hard to reverse once implemented and consumed. High blast radius (3+ dependents).

2. **ToS and content moderation policy content** (MUST gate) -- The actual legal text needs human review before it ships. This is legal cover for the operator. Not delegatable to agents alone.

3. **Staging wrangler.toml and GitHub Actions workflow** (OPTIONAL gate) -- Infrastructure config is easy to iterate on but has 2+ dependents (smoke test, ToS deploy verification). Gate primarily because the secret management approach needs confirmation.

## Rationale

This task splits cleanly into two work streams with one integration point:

**R9 (staging)** is primarily an infrastructure task. iac-minion is the obvious primary, with security-minion reviewing secret isolation and test-minion designing the smoke test. The existing CI workflow provides a foundation to build on.

**R7 (ToS/policy)** is a mix of legal content authoring, API design, and minor UI work. No single agent owns "write legal documents," but security-minion can ensure the content covers liability, api-design-minion can decide how to surface it, and ux-strategy-minion can ensure the abuse mechanism is usable.

The agents NOT consulted for planning:
- **iac-minion covers edge-minion's domain** here since this is Cloudflare Worker config, not CDN/edge worker design.
- **data-minion** is not needed -- no database changes.
- **ai-modeling-minion** is not needed -- no prompt engineering or agent system changes.
- **frontend-minion** is not needed -- the verification page change is a single footer link, not a component architecture decision.
- **observability-minion** is not needed for planning -- staging inherits existing logging.

## Scope

**In scope**:
- `wrangler.toml` staging environment section with isolated KV namespace and R2 bucket
- GitHub Actions workflow for automated staging deploy on push to main
- Smoke test script (health check + optionally capture round-trip)
- Separate staging API key and signing key management
- Terms of Service document
- Content moderation policy document with abuse reporting mechanism
- ToS/policy accessible from API responses (Link header or endpoint)
- Verification page footer link to ToS
- OpenAPI spec update for any new endpoints/headers

**Out of scope**:
- Production CD automation (R14, separate backlog item)
- Preview deployments per PR (parking lot item)
- Load testing
- Automated content scanning
- DMCA process
- Legal counsel engagement
- Coralogix alerting rules for staging

## External Skill Integration

No external skills detected in project.
