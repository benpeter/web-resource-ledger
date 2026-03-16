## Delegation Plan

**Team name**: r9-r7-staging-and-tos
**Description**: Add a staging environment with automated deploy-on-push (R9) and publish Terms of Service + content moderation policy with API integration (R7).

### Conflict Resolutions

**api-design-minion vs software-docs-minion: Worker endpoints vs GitHub-hosted documents**

api-design-minion argues against dedicated Worker endpoints for legal documents: YAGNI, KISS, GitHub serves Markdown with caching and git-based versioning for free. software-docs-minion argues for `GET /legal/terms` and `GET /legal/content-policy` endpoints: self-contained API, no external dependency.

**Resolution: Side with api-design-minion. No dedicated Worker endpoints.**

Rationale:
1. The Helix Manifesto (project's governing philosophy) explicitly favors lean-and-mean: fewer lines, fewer deps, fewer moving parts. Serving static Markdown through a Worker adds routes, handlers, content import mechanisms, and tests -- all to replicate what GitHub already does.
2. YAGNI applies directly. The documents are static, rarely-changing text. GitHub renders them natively with caching. `raw.githubusercontent.com` serves plain text for machine consumption.
3. The `Link` header on every response + `legal` object in the health endpoint + `info.termsOfService` in OpenAPI provides three discovery mechanisms without adding a single route. This is more than sufficient.
4. ux-strategy-minion's recommendation for a `/terms` Worker page with styled HTML is elegant but over-engineered for MVP. The verification page footer links can point to the GitHub-hosted documents.

**Document location: repo root (`TERMS.md`, `CONTENT-POLICY.md`) per api-design-minion, not `legal/` directory.** Rationale: capital-letter governance files at repo root is the strongest convention (see existing `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`). A `legal/` subdirectory adds indirection without value. GitHub renders root-level Markdown with excellent discoverability.

**Additional resolution: Link header scope**

software-docs-minion recommended Link header only on authenticated endpoints. api-design-minion recommended it on every response. **Resolution: every response**, via the existing universal header block in `index.js` (lines 51-54). Rationale: the ToS URL is public information, not a secret. Adding conditional logic for "only authenticated" creates complexity for zero benefit. The Link header is a single `set()` call in the same block as `Referrer-Policy` and `X-Frame-Options`.

**Additional resolution: ux-strategy-minion's `/abuse` page recommendation**

ux-strategy-minion recommended a dedicated `/abuse` Worker route returning styled HTML. **Resolution: No dedicated route. The abuse process is documented in `CONTENT-POLICY.md`, linked from the verification page footer.** An email address with clear instructions in the content policy document is sufficient per security-minion's analysis and KISS principles. If the footer "Report Abuse" link pointed to a Worker-served HTML page, that page would just repeat what's already in the content policy document -- zero marginal value.

### Task 1: Staging environment -- wrangler.toml, ci.yml update, and log.js parameterization
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are configuring the staging environment for a Cloudflare Worker project (Web Resource Ledger). This task covers three files.

    ## Context

    The project is a Cloudflare Worker (`wrl`) that captures web pages and signs WACZ bundles with Ed25519. Production uses KV, R2, Browser Rendering, rate limiters, and Coralogix logging. The staging environment must be fully isolated: separate Worker (`wrl-staging`), separate KV namespace, separate R2 bucket, separate rate limiter namespace IDs.

    Read these files before making changes:
    - `wrangler.toml` -- current production config
    - `.github/workflows/ci.yml` -- current CI workflow
    - `src/log.js` -- current logging module

    ## Task 1a: Add `[env.staging]` to `wrangler.toml`

    Add a complete staging environment block. All bindings are non-inheritable and must be explicitly redefined.

    ```toml
    [env.staging]

    [[env.staging.r2_buckets]]
    binding = "BUCKET"
    bucket_name = "wrl-captures-staging"

    [[env.staging.kv_namespaces]]
    binding = "KV"
    id = "STAGING_KV_ID_PLACEHOLDER"

    [[env.staging.unsafe.bindings]]
    name = "CAPTURE_RATE_LIMITER"
    type = "ratelimit"
    namespace_id = "2001"
    simple = { limit = 10, period = 60 }

    [[env.staging.unsafe.bindings]]
    name = "VERIFY_RATE_LIMITER"
    type = "ratelimit"
    namespace_id = "2002"
    simple = { limit = 60, period = 60 }

    [[env.staging.unsafe.bindings]]
    name = "GLOBAL_CAPTURE_LIMITER"
    type = "ratelimit"
    namespace_id = "2003"
    simple = { limit = 200, period = 60 }

    [env.staging.browser]
    binding = "BROWSER"

    [env.staging.vars]
    CORALOGIX_ENDPOINT = "https://ingress.eu2.coralogix.com/logs/v1/singles"
    APPLICATION_NAME = "wrl-staging"
    ```

    Use `STAGING_KV_ID_PLACEHOLDER` for the KV namespace ID -- the operator will replace it after running `wrangler kv namespace create KV --env staging`. Add a comment above it: `# Replace with output of: wrangler kv namespace create KV --env staging`.

    Rate limiter namespace IDs use the 2001-2003 series (production uses 1001-1003) to make isolation explicit.

    Add `APPLICATION_NAME = "wrl"` to the existing top-level `[vars]` section as well (production default).

    ## Task 1b: Update `src/log.js` to use `APPLICATION_NAME` env var

    In `src/log.js`, change the hardcoded `applicationName: 'wrl'` to read from `env.APPLICATION_NAME` with a fallback to `'wrl'`. The function signature already receives `env` as its first parameter. The change is one line:

    ```js
    applicationName: env.APPLICATION_NAME || 'wrl',
    ```

    This ensures staging logs are tagged `wrl-staging` in Coralogix, making them filterable from production logs.

    ## Task 1c: Add `workflow_call` trigger to `ci.yml`

    The staging deploy workflow (Task 2) will reuse `ci.yml` as a called workflow. Add `workflow_call:` to the `on:` block in `.github/workflows/ci.yml`:

    ```yaml
    on:
      push:
        branches: [main]
      pull_request:
        branches: [main]
      workflow_call:
    ```

    This is the only change to `ci.yml`. The `workflow_call` trigger allows other workflows to invoke ci.yml as a reusable workflow. The existing `push` and `pull_request` triggers remain unchanged.

    ## What NOT to do
    - Do not create the staging KV namespace or R2 bucket (operator task)
    - Do not add secrets to wrangler.toml (secrets are set via `wrangler secret put`)
    - Do not modify any other source files
    - Do not add a `preview_id` to the staging KV namespace entry (staging IS the preview)

    ## Deliverables
    1. Updated `wrangler.toml` with complete `[env.staging]` block and `APPLICATION_NAME` in top-level vars
    2. Updated `src/log.js` with parameterized `applicationName`
    3. Updated `.github/workflows/ci.yml` with `workflow_call` trigger
- **Deliverables**: Updated `wrangler.toml`, `src/log.js`, `.github/workflows/ci.yml`
- **Success criteria**: `wrangler.toml` has a complete staging env block with all bindings redefined; `log.js` reads `APPLICATION_NAME` from env; `ci.yml` has `workflow_call` in its `on:` block

### Task 2: Staging deploy workflow and smoke test
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are creating the staging deployment workflow and smoke test for a Cloudflare Worker project (Web Resource Ledger).

    ## Context

    The project deploys a Cloudflare Worker named `wrl`. A staging environment (`[env.staging]` in `wrangler.toml`) creates a separate Worker `wrl-staging` with isolated KV, R2, and rate limiter bindings. The CI workflow (`.github/workflows/ci.yml`) runs tests and linting; it accepts `workflow_call` as a trigger so other workflows can reuse it.

    Read these files before starting:
    - `wrangler.toml` -- for environment config
    - `.github/workflows/ci.yml` -- for reusable workflow structure
    - `package.json` -- for existing scripts

    ## Task 2a: Create `.github/workflows/deploy-staging.yml`

    Create a new workflow file with these requirements:

    **Triggers**: `push` to `main` branch + `workflow_dispatch` for manual redeploys.

    **Permissions**: `contents: read`, `deployments: write`

    **Jobs**:

    1. `test` -- reuse ci.yml: `uses: ./.github/workflows/ci.yml`

    2. `deploy` -- needs: test
       - `runs-on: ubuntu-latest`
       - `timeout-minutes: 5`
       - `environment: staging`
       - Steps:
         - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2)
         - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0) with `node-version-file: '.nvmrc'` and `cache: 'npm'`
         - `npm ci`
         - Deploy using `cloudflare/wrangler-action` -- look up the latest stable v3 SHA and pin to it. Configure:
           - `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`
           - `environment: staging`
           - `secrets: |` block listing `CAPTURE_API_KEY`, `SIGNING_KEY`, `CORALOGIX_SEND_KEY`
           - `env:` block mapping GitHub secrets: `CAPTURE_API_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}`, `SIGNING_KEY: ${{ secrets.WRL_STAGING_SIGNING_KEY }}`, `CORALOGIX_SEND_KEY: ${{ secrets.WRL_STAGING_CORALOGIX_SEND_KEY }}`

    3. `smoke` -- needs: deploy
       - `runs-on: ubuntu-latest`
       - `timeout-minutes: 3`
       - `environment: staging`
       - Steps:
         - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`
         - Run smoke test: `./scripts/smoke-test.sh`
         - env: `SMOKE_URL: ${{ vars.WRL_STAGING_BASE_URL }}`, `SMOKE_API_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}`

    **Action SHA pinning**: All GitHub Actions MUST be pinned to full commit SHAs with a comment showing the version tag. For `cloudflare/wrangler-action`, find the latest v3 stable release SHA. If you cannot determine the exact SHA, use a placeholder `<PIN_TO_SHA>` with a comment `# TODO: pin to latest v3 SHA`.

    ## Task 2b: Create `scripts/smoke-test.sh`

    Create a standalone bash smoke test script. Requirements:

    **Environment variables** (required):
    - `SMOKE_URL` -- base URL of the deployed Worker (e.g., `https://wrl-staging.example.workers.dev`)
    - `SMOKE_API_KEY` -- API key for the staging environment

    **Environment variables** (optional):
    - `SMOKE_CAPTURE_URL` -- URL to capture (default: `https://example.com`)
    - `SMOKE_TIMEOUT` -- overall timeout in seconds (default: 90)
    - `SMOKE_SKIP_CAPTURE` -- set to `1` to skip capture round-trip

    **Checks** (in order of escalating cost):

    1. **Health check**: `GET /health` -- expect 200, body contains `"status":"ok"`. If this fails, abort immediately.

    2. **Security headers**: On the health response, verify these headers are present: `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`. Also verify the `Link` header contains `rel="terms-of-service"` (wired by Task 3).

    3. **Signing key**: `GET /.well-known/signing-key` -- expect 200, JSON body has `algorithm` field with value `Ed25519` and `publicKey` field.

    4. **Capture round-trip** (skip if `SMOKE_SKIP_CAPTURE=1`):
       - `POST /v1/captures` with `Authorization: Bearer $SMOKE_API_KEY`, `Content-Type: application/json`, body `{"url":"$SMOKE_CAPTURE_URL"}`
       - Expect 202, extract `id` from response
       - Poll `GET /v1/captures/{id}/status` every 5 seconds, up to 12 attempts (60s max)
       - Accept BOTH `complete` and `failed` as PASS (validates infrastructure works)
       - Only FAIL if: connection refused, 500 on create, status never resolves, 401/403 (auth misconfiguration)

    **Script structure**:
    - `#!/usr/bin/env bash`
    - `set -euo pipefail`
    - Check for `jq` and `curl` at the top, exit with clear error if missing
    - Validate required env vars at the top
    - Use pass/fail counters, print clear PASS/FAIL lines per check
    - Print summary at end (X/Y checks passed)
    - Exit 0 if all checks pass, exit 1 if any fail
    - Human-readable colored output (green PASS, red FAIL) but degrade gracefully if not a terminal

    **Important**: The smoke test must NEVER hardcode any secrets or URLs. All values come from environment variables.

    ## Task 2c: Add `smoke` script to `package.json`

    Add a `"smoke"` entry to the `scripts` section in `package.json`:

    ```json
    "smoke": "./scripts/smoke-test.sh"
    ```

    This gives developers a discoverable entry point: `npm run smoke`.

    ## What NOT to do
    - Do not modify `ci.yml` (that's Task 1)
    - Do not modify `wrangler.toml` (that's Task 1)
    - Do not create Node.js-based smoke tests -- this is pure bash with curl and jq
    - Do not add any dependencies to package.json
    - Do not hardcode any secrets, URLs, or API keys

    ## Deliverables
    1. `.github/workflows/deploy-staging.yml` -- complete deploy workflow
    2. `scripts/smoke-test.sh` -- executable smoke test script (make sure to `chmod +x`)
    3. Updated `package.json` with `smoke` script entry
- **Deliverables**: `.github/workflows/deploy-staging.yml`, `scripts/smoke-test.sh`, updated `package.json`
- **Success criteria**: Workflow triggers on push to main, calls ci.yml, deploys with wrangler-action, runs smoke test as separate job; smoke script validates health + headers + signing key + capture round-trip; all action SHAs are pinned

### Task 3: Legal documents, API integration, and verification page footer
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are implementing the Terms of Service and Content Moderation Policy for Web Resource Ledger (WRL), a Cloudflare Worker that captures and cryptographically signs web page archives.

    ## Context

    WRL is a single-operator web archival service deployed on Cloudflare Workers. It captures web pages (screenshots, HTML, headers) and packages them into Ed25519-signed WACZ bundles. The operator is based in Germany. This is an early-stage project with no public users yet, but legal cover is needed before promotion.

    Read these files before starting:
    - `src/index.js` -- main Worker router and handlers (pay attention to the universal header block at lines 51-54 and the `handleHealth` function)
    - `src/verify-page.js` -- verification page HTML template (pay attention to the footer at line 261)
    - `openapi.yaml` -- current OpenAPI spec
    - `README.md` -- current README
    - `CODE_OF_CONDUCT.md` -- for existing abuse contact email
    - `SECURITY.md` -- for existing security contact patterns
    - `package.json` -- for repository URL

    ## Task 3a: Create `TERMS.md` at repository root

    Write a Terms of Service document. Place it at the repository root (same level as `README.md`, `LICENSE`, `SECURITY.md`). Convention: capital-letter governance files at root.

    **Required sections**:
    1. **Effective date**: `Effective: 2026-03-16`
    2. **What WRL is**: Brief description -- a web archival service that captures and cryptographically signs web content as evidence bundles.
    3. **Acceptance**: "By using this API, you agree to these terms."
    4. **Permitted use**: WRL is provided for lawful archival purposes only.
    5. **Prohibited uses**: Explicitly prohibit:
       - Capturing URLs for harassment, stalking, or intimidation
       - Capturing content the user knows to be illegal (CSAM, classified material)
       - Using WRL to circumvent access controls (paywalls, authentication)
       - Automated mass surveillance of individuals
       - Submitting URLs designed to attack WRL infrastructure (SSRF attempts)
    6. **Operator rights**: Unrestricted right to remove any capture, suspend any API key, or block any IP at sole discretion without notice.
    7. **No warranty / limitation of liability**: Service provided "as-is". No guarantee of availability or permanence. Liability limited to amount paid (zero for free service). Consequential damages excluded.
    8. **Data handling**: What WRL stores (URL, rendered content, HTTP headers, timestamps, screenshots, signed WACZ bundle). What it does NOT store (submitter identity beyond API key, cookies, credentials from target sites). Retention: indefinite unless removed. GDPR note: if captured content contains third-party personal data, the submitter is the data controller.
    9. **Copyright / takedown**: WRL captures publicly accessible content as-is. The operator will respond to valid copyright complaints. Contact information provided. Right to remove content upon receipt of valid complaint. (Minimal notice-and-takedown provision -- not a formal DMCA designation.)
    10. **Governing law**: German law applies. The operator is based in Germany.
    11. **Changes to terms**: Terms may be updated at any time. Continued use after changes constitutes acceptance.
    12. **Disclaimer**: "This document is a reasonable-effort template, not professional legal advice."

    **Style**: Write in plain language, not legalese. Clear, direct sentences. This is a single-operator project, not a Fortune 500 company. The tone should be professional but human. Use section headers for scannability.

    ## Task 3b: Create `CONTENT-POLICY.md` at repository root

    Write a Content Moderation Policy document.

    **Required sections**:
    1. **Effective date**: `Effective: 2026-03-16`
    2. **What WRL stores**: Brief description of the archival process and what artifacts are retained.
    3. **Content standards**: WRL captures publicly accessible web content. The operator does not endorse, verify, or take responsibility for content at captured URLs.
    4. **Prohibited content**: Content that may be removed:
       - Captures made for harassment, stalking, or intimidation
       - Child sexual abuse material (CSAM)
       - Content that violates applicable law
       - Captures of non-public / access-controlled content
    5. **Abuse reporting**:
       - Email: Use the same contact as `CODE_OF_CONDUCT.md` (read that file to find the email address)
       - What to include in a report: the capture ID or URL, nature of the concern, evidence of authority or ownership (if applicable)
       - Response commitment: "We aim to respond within 5 business days"
       - What to expect: "We will review your report and may remove content that violates this policy"
    6. **Copyright complaints**: Valid copyright complaints will be reviewed. Include: identification of copyrighted work, the WRL capture URL, contact information, statement of good faith belief. The operator reserves the right to remove content upon valid complaint.
    7. **Disclaimer**: Same as TERMS.md -- reasonable-effort template, not legal advice.

    ## Task 3c: Add `Link` header to all API responses

    In `src/index.js`, add a `Link` header to the universal header block (lines 51-54). The URL should point to the GitHub-hosted TERMS.md in the repository:

    ```js
    response.headers.set('Link', '<https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md>; rel="terms-of-service"');
    ```

    This goes right after the existing `Strict-Transport-Security` header set on line 54. One line, added to the same universal block that already sets security headers on every response.

    ## Task 3d: Enrich the health endpoint response

    In `src/index.js`, modify the `handleHealth()` function to include a `legal` object:

    ```js
    function handleHealth() {
      return jsonResponse({
        status: 'ok',
        legal: {
          terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
          policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
        },
      });
    }
    ```

    This is an additive, non-breaking change. The health endpoint remains unauthenticated.

    ## Task 3e: Update the verification page footer

    In `src/verify-page.js`, update the footer (currently line 261: `<footer>Verified by Web Resource Ledger</footer>`) to include links to Terms and Report Abuse:

    ```html
    <footer>Web Resource Ledger · <a href="https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md" target="_blank" rel="noopener">Terms</a> · <a href="https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md#abuse-reporting" target="_blank" rel="noopener">Report Abuse</a></footer>
    ```

    The "Report Abuse" link points to the abuse reporting section anchor in the content policy document. Both links use `target="_blank" rel="noopener"` since they navigate away from the verification context.

    Add these CSS rules in the existing `<style>` block for footer link styling:

    ```css
    footer a { color: #1a1a1a; text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    footer a:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px; }
    ```

    The abuse link uses `#1a1a1a` (body text color) rather than the footer's `#6d6d6d` so actionable links are more visible than the branding text. This follows ux-strategy-minion's recommendation for subtle visual hierarchy within the footer.

    ## Task 3f: Update OpenAPI spec

    In `openapi.yaml`, make these changes:

    1. Add `termsOfService` to the `info` object:
       ```yaml
       info:
         title: Web Resource Ledger API
         version: 0.2.0
         termsOfService: https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md
       ```
       Do NOT bump the version number (this is additive metadata, not a functional API change).

    2. Add a staging server entry to the `servers` array:
       ```yaml
       servers:
         - url: https://wrl.example.com
           description: Production
         - url: https://wrl-staging.example.workers.dev
           description: Staging
       ```

    3. Add a `Link` header to the universal response headers documentation. If there's an existing headers component section, add:
       ```yaml
       TermsLink:
         description: Link to Terms of Service per RFC 8288.
         schema:
           type: string
           example: '<https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md>; rel="terms-of-service"'
       ```

    4. Update the health endpoint (`/health`) response schema to include the `legal` object:
       ```yaml
       legal:
         type: object
         properties:
           terms:
             type: string
             format: uri
           policy:
             type: string
             format: uri
       ```

    ## Task 3g: Update README.md

    Add a brief "Legal" section near the bottom of the README (before or after the existing "License" section). Keep it to 3-4 lines:

    ```markdown
    ## Legal

    - [Terms of Service](TERMS.md)
    - [Content Moderation Policy](CONTENT-POLICY.md)

    By using this API, you agree to the [Terms of Service](TERMS.md).
    ```

    ## What NOT to do
    - Do NOT create Worker endpoints for legal documents (`/legal/terms`, `/terms`, etc.) -- documents are hosted by GitHub
    - Do NOT add legal URLs to the 202 capture response body
    - Do NOT create a `legal/` subdirectory -- documents go at repo root
    - Do NOT add YAML frontmatter to the legal documents (these are standard GitHub Markdown files, not Hugo/Jekyll pages)
    - Do NOT use legalese -- write in plain, direct language
    - Do NOT create a dedicated abuse endpoint or route
    - Do NOT modify any files not listed in the deliverables

    ## Deliverables
    1. `TERMS.md` -- Terms of Service at repo root
    2. `CONTENT-POLICY.md` -- Content moderation policy at repo root
    3. Updated `src/index.js` -- Link header in universal header block + legal object in health endpoint
    4. Updated `src/verify-page.js` -- footer links to Terms and Report Abuse
    5. Updated `openapi.yaml` -- termsOfService field, staging server, Link header component, health response schema
    6. Updated `README.md` -- Legal section
- **Deliverables**: `TERMS.md`, `CONTENT-POLICY.md`, updated `src/index.js`, `src/verify-page.js`, `openapi.yaml`, `README.md`
- **Success criteria**: Legal documents exist at repo root with all required sections; Link header present on every API response; health endpoint includes legal URLs; verification page footer has Terms + Report Abuse links; OpenAPI spec has termsOfService field and staging server

### Cross-Cutting Coverage

- **Testing**: Covered by Phase 6 (post-execution test execution). The smoke test script (Task 2b) validates live deployment. Existing unit tests in `test/` will catch regressions from `index.js` and `verify-page.js` changes. Phase 6 runs `npm test` + `npm run lint:api` to validate.
- **Security**: security-minion's recommendations are incorporated directly into the task prompts: separate staging signing key (operator manual task, documented), separate API key, parameterized log application name, Link header using `set()` (not `append()` to prevent header injection), no secret hardcoding in smoke test. No separate security task needed -- the security requirements are woven into the execution prompts.
- **Usability -- Strategy**: ux-strategy-minion's recommendations are incorporated: footer links (not banner), "Report Abuse" more prominent than "Terms" via color contrast, email abuse mechanism with response commitment, no ToS in 202 body. No separate UX task needed.
- **Usability -- Design**: No new UI surfaces beyond footer link additions. The verification page changes are CSS-only (link styling in existing footer). accessibility-minion review not warranted for two footer links with `:focus-visible` styling.
- **Documentation**: software-docs-minion's recommendations for README updates and OpenAPI spec changes are incorporated into Task 3. Evolution log (Phase 8) covers process documentation.
- **Observability**: `APPLICATION_NAME` parameterization in `log.js` (Task 1b) ensures staging logs are filterable in Coralogix. No additional observability work needed.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. Rationale per reviewer:
    - ux-design-minion: No new UI components or visual layouts -- only two footer links added to an existing page. Not warranted.
    - accessibility-minion: Footer links include `:focus-visible` styling and use semantic HTML (`<a>` elements with `target="_blank" rel="noopener"`). Standard pattern, no WCAG audit needed for two links.
    - sitespeed-minion: No web-facing runtime code changes that affect performance. Adding one `Link` header has zero performance impact.
    - observability-minion: Only one runtime component (the Worker). Log parameterization is sufficient. No multi-service coordination needed.
    - user-docs-minion: README update is included in Task 3. No separate user documentation task warranted for an API that has zero external users.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Risks and Mitigations

1. **Browser Rendering availability in staging** (Medium): Browser Rendering is a paid Cloudflare service. The staging Worker `wrl-staging` needs it enabled at the account level. Mitigation: smoke test accepts `failed` capture status as passing -- this validates infrastructure even if Browser Rendering is temporarily unavailable.

2. **CI workflow reuse compatibility** (Low): Adding `workflow_call` to `ci.yml` changes the event context. The `changes` step computes `BASE_REF` from `github.event.pull_request.base.sha || github.event.before`. When called from deploy-staging.yml (a push event), `github.event.before` is available and correct. Mitigation: if the reusable call fails, the fallback is duplicating test steps in deploy-staging.yml.

3. **Production signing key reuse in staging** (High severity, operator-controlled): If the operator accidentally uses the same `SIGNING_KEY` for staging, captures would be cryptographically indistinguishable from production evidence. Mitigation: documented as a manual step with clear instructions. The smoke test validates `/.well-known/signing-key` returns a key -- the operator can compare public keys between environments.

4. **Legal document quality** (Medium): Agent-generated legal documents are templates, not legal advice. Both documents include explicit disclaimers. The operator should have them reviewed before public launch. Mitigation: documents are comprehensive but carry "not legal advice" disclaimers.

5. **Link header URL stability** (Low): The `Link` header URL is hardcoded to `https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md`. If the repository is renamed, a code deploy is required to update. Mitigation: repository renames are rare; the URL pattern is stable.

6. **wrangler-action first deploy** (Low): The first staging deploy may need manual secret seeding before `wrangler-action` can set them. Mitigation: operator can run `wrangler secret put --env staging` manually once before enabling the workflow, or the workflow can be triggered via `workflow_dispatch` after manual setup.

### Execution Order

```
Batch 1 (parallel):
  Task 1: wrangler.toml + ci.yml + log.js
  Task 2: deploy workflow + smoke test + package.json
  Task 3: legal docs + API integration + verify page + OpenAPI + README

All three tasks are independent -- they touch different files:
  Task 1: wrangler.toml, src/log.js, .github/workflows/ci.yml
  Task 2: .github/workflows/deploy-staging.yml, scripts/smoke-test.sh, package.json
  Task 3: TERMS.md, CONTENT-POLICY.md, src/index.js, src/verify-page.js, openapi.yaml, README.md

No file overlap. All run in parallel.
```

No approval gates. All tasks run in a single parallel batch.

### Verification Steps

After all tasks complete:

1. **Unit tests pass**: `npm test` -- validates that changes to `index.js`, `verify-page.js`, and `log.js` don't break existing tests.
2. **API spec lints**: `npm run lint:api` -- validates OpenAPI spec changes.
3. **File existence**: `TERMS.md` and `CONTENT-POLICY.md` exist at repo root.
4. **Smoke test is executable**: `test -x scripts/smoke-test.sh`
5. **No file conflicts**: Verify that the three tasks didn't accidentally modify the same files.
6. **Link header wired**: Grep `src/index.js` for `terms-of-service` to confirm Link header is set.
7. **Health endpoint enriched**: Grep `src/index.js` for `legal` to confirm health response includes legal URLs.
8. **Footer updated**: Grep `src/verify-page.js` for `Report Abuse` to confirm footer links.
9. **Staging env complete**: Grep `wrangler.toml` for `env.staging` to confirm all bindings.
