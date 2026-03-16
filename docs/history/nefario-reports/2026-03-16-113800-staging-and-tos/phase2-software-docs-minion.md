## Domain Plan Contribution: software-docs-minion

### Recommendations

#### 1. Document Location: `legal/` at top level (option a)

Recommend **option (a): top-level `/legal/` directory**. Rationale:

- **These are not developer docs** -- they are binding legal documents that apply to the service. Putting them under `docs/` conflates API/architecture documentation with legal terms, which have a fundamentally different audience (API consumers, not contributors).
- **Precedent in the repo**: `SECURITY.md`, `CODE_OF_CONDUCT.md`, and `LICENSE` all live at the top level as governance artifacts. Legal terms belong in the same class -- top-level, prominent, easy to find.
- **Option (c) (inline in Worker, no file on disk) is wrong** for this project. The issue explicitly requires versioned, date-stamped documents. Embedding legal text in JavaScript string literals violates single-source-of-truth: the spec says "documents reviewed for legal soundness" -- reviewers need to read Markdown files, not dig through `src/` for template literals. The Worker should *serve* these documents, not *be* their canonical store.
- A top-level `legal/` directory also makes it trivial for automated tools (license scanners, compliance bots) to find legal artifacts.

Proposed structure:

```
legal/
  terms-of-service.md          # current version
  content-moderation-policy.md  # current version
```

Each document should include a YAML frontmatter block for machine-parseable versioning:

```yaml
---
effective: 2026-03-16
version: "1.0"
---
```

**Version history**: Do NOT create a `legal/archive/` directory pre-emptively (YAGNI). Git history is the version archive. If a future version is needed, the old version can be retrieved from git at the commit before the update. The frontmatter `effective` date plus git history is sufficient.

#### 2. How the Worker Should Serve Legal Documents

The Worker should serve the legal documents from **a dedicated route**, not just via Link headers. Two mechanisms:

**A. Dedicated endpoint: `GET /legal/terms` and `GET /legal/content-policy`**

- Returns the document as `text/plain` or `text/html` based on Accept header (content negotiation, same pattern as the verify endpoint).
- The Markdown source in `legal/` is the canonical version. At build time or import time, the content is bundled into the Worker. Cloudflare Workers support importing text files via `import` (with appropriate module rules), or the content can be inlined during the build step.
- These endpoints are public, unauthenticated, and aggressively cached (`Cache-Control: public, max-age=86400`).

**B. `Link` header on API responses**

- Add a `Link: </legal/terms>; rel="terms-of-service"` header to authenticated API responses (captures POST, list GET). This follows RFC 8288 (Web Linking) and is the standard way APIs reference their ToS.
- Do NOT add Link headers to public/unauthenticated endpoints (verify, signing-key, health) -- the ToS governs API consumers who authenticate, not third parties checking verification results.

I recommend the dedicated endpoint approach over only using Link headers because the issue says "ToS/policy accessible from API responses (Link header **or** dedicated endpoint)" -- a dedicated endpoint is more useful than a header alone, and adding the Link header on top is trivial.

#### 3. OpenAPI Spec Updates

The OpenAPI spec needs the following changes:

**A. `info.termsOfService` field**

OpenAPI 3.1 supports `info.termsOfService` as a URL string. Add it:

```yaml
info:
  title: Web Resource Ledger API
  version: 0.3.0  # bump for new endpoints
  termsOfService: /legal/terms
```

This is the standard OpenAPI mechanism for declaring ToS. Tools like Swagger UI, ReDoc, and API portals render it automatically.

**B. New `legal` tag**

```yaml
tags:
  - name: legal
    description: Terms of service and content policies
```

**C. New endpoint definitions**

Two new path entries under `/legal/terms` and `/legal/content-policy`. Minimal: GET only, no auth, 200 response with `text/plain` media type. Include the `Link` header in the response definition for cross-referencing. No parameters.

**D. `Link` header component and response references**

Add a reusable `Link` header component:

```yaml
components:
  headers:
    TermsLink:
      description: Link to Terms of Service (RFC 8288).
      schema:
        type: string
        example: '</legal/terms>; rel="terms-of-service"'
```

Then reference it in the authenticated endpoint responses (`POST /v1/captures` 202, `GET /v1/captures` 200).

**E. Staging server entry**

Add a staging server entry to the `servers` array:

```yaml
servers:
  - url: https://wrl.example.com
    description: Production
  - url: https://wrl-staging.example.com
    description: Staging
```

The actual URL depends on the staging deployment (likely a Cloudflare Workers subdomain like `wrl-staging.<account>.workers.dev` or a custom domain). This should be updated once the staging environment name is decided.

#### 4. Evolution Log Structure: No Changes Needed

The evolution log structure should **not** change to accommodate legal document versioning. Reasons:

- Legal documents are versioned by their `effective` date in frontmatter and by git history. This is separate from the build process evolution log.
- The evolution log documents *development phases*, not *document revisions*. A new evolution log entry (e.g., `0017-staging-and-tos/`) should document this phase's decisions about legal documents, but the evolution log format itself stays the same.
- If legal documents are updated in the future, that is a content change (a PR updating `legal/terms-of-service.md`), not a development phase. It does not warrant an evolution log entry unless there is architectural work involved.

#### 5. README and Cross-References

- **README.md**: Add a brief mention under a "Legal" or "Terms" heading near the bottom, linking to `legal/terms-of-service.md` and `legal/content-moderation-policy.md`. Keep it to 2-3 lines.
- **CONTRIBUTING.md**: No changes needed. The ToS governs API usage, not code contribution.
- **Verification page (`verify-page.js`)**: The issue says "linking from API/verification page." Add a small footer link on the verification HTML page: "Terms of Service" linking to `/legal/terms`. This is a one-line HTML addition in the footer element.

### Proposed Tasks

#### Task 1: Create legal document files

**What**: Write `legal/terms-of-service.md` and `legal/content-moderation-policy.md` with YAML frontmatter (`effective`, `version`). Content should cover: prohibited use (illegal content, harassment, spam), operator rights (takedown, suspension, data deletion), liability limitations, abuse reporting mechanism (email from CODE_OF_CONDUCT.md: `ben@benpeter.com`), and content moderation process.

**Deliverables**: Two Markdown files in `legal/`.

**Dependencies**: None. Can be written first.

**Note**: The content moderation policy should reference the same abuse contact as CODE_OF_CONDUCT.md for consistency. The issue says "email or endpoint" -- email is the right choice for a single-operator project (YAGNI on an abuse-report API endpoint).

#### Task 2: Add legal document serving routes to the Worker

**What**: Add `GET /legal/terms` and `GET /legal/content-policy` routes to `src/index.js`. Import the Markdown content (or a pre-rendered text version). Serve as `text/plain` with aggressive caching. Add `Link` header (`</legal/terms>; rel="terms-of-service"`) to authenticated endpoint responses (POST captures, GET captures list).

**Deliverables**: Updated `src/index.js` with two new routes and Link header additions. Possibly a new `src/legal.js` module if the content import warrants isolation.

**Dependencies**: Task 1 (needs the content to serve).

#### Task 3: Update OpenAPI spec for legal endpoints

**What**: Add `info.termsOfService`, `legal` tag, two new path definitions (`/legal/terms`, `/legal/content-policy`), `TermsLink` header component, and reference that header in authenticated endpoint responses. Add staging server entry.

**Deliverables**: Updated `openapi.yaml`.

**Dependencies**: Task 2 (spec should reflect implemented behavior).

#### Task 4: Update README and verification page

**What**: Add a "Legal" section to README.md linking to the legal documents. Add a "Terms of Service" footer link to the verification page in `src/verify-page.js`.

**Deliverables**: Updated `README.md`, updated `src/verify-page.js`.

**Dependencies**: Task 1 (needs document paths to link to).

#### Task 5: Evolution log entry for this phase

**What**: Create `docs/evolution/0017-staging-and-tos/` with `prompt.md`, `decisions.md`, and `outcome.md`. The decisions doc should record: legal document location choice (top-level vs docs/ vs inline), serving strategy (dedicated endpoint vs Link-only), versioning approach (frontmatter + git), and staging environment naming.

**Deliverables**: Evolution log directory with three files.

**Dependencies**: All other tasks (written after implementation).

### Risks and Concerns

1. **Legal content quality**: The issue explicitly says "not legal advice -- reasonable template." The documents should include a disclaimer that they are not professionally reviewed. However, the documents still need to be substantive enough to provide actual legal cover for content moderation. A placeholder "ToS coming soon" page would not satisfy the issue's success criteria. The content minion writing these needs clear guidance on what to cover.

2. **Import mechanism for Markdown in Workers**: Cloudflare Workers support `import` for text files using module rules in `wrangler.toml` (`{ type = "Text", globs = ["**/*.md"] }`), but this is a relatively recent feature. The alternative is to inline the content as a JS string constant. Either works; the module-import approach is cleaner but adds a `wrangler.toml` config line. The implementation minion should verify this works with the current compatibility date.

3. **Versioning ambiguity**: The issue says "documents need to be versioned (date-stamped)" but does not specify whether old versions must be retrievable via the API. My recommendation (git history only, no archive directory, no versioned endpoints like `/legal/terms/2026-03-16`) follows YAGNI. If the planning team disagrees and wants API-served version history, that changes the scope significantly and should be called out.

4. **Link header and existing response structure**: Adding a `Link` header to responses in `src/index.js` requires touching the response-building code for `handleCreateCapture` and `handleListCaptures`. The current architecture applies security headers in the central `fetch()` handler (lines 51-54 of `index.js`). The `Link` header could be added the same way -- but it should NOT be added to every response (only authenticated ones). This means the central handler needs conditional logic, or each authenticated handler adds it individually. The latter is simpler and more explicit.

5. **OpenAPI spec size**: The spec is already 1100+ lines. Two new simple endpoints add maybe 60-80 lines. This is fine -- no splitting needed yet. But the staging server URL needs to be decided before it can be added to the spec.

### Additional Agents Needed

None for documentation concerns. The current team should be sufficient, provided:

- An **implementation minion** (backend/worker specialist) handles the Worker route additions and Markdown import mechanism.
- The **api-design-minion** reviews the endpoint design (`/legal/terms` path, response format, Link header placement) before the OpenAPI spec is updated -- the documentation should reflect an agreed-upon API contract, not define one unilaterally.

If the api-design-minion is not already part of this planning round, they should be consulted specifically on: the URL structure for legal endpoints (e.g., `/legal/terms` vs `/v1/legal/terms` vs `/.well-known/terms-of-service`), and whether the `Link` header belongs on all responses or only authenticated ones.
