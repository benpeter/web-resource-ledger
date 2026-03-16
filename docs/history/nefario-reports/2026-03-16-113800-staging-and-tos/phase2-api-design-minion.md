# Domain Plan Contribution: api-design-minion

## Recommendations

### Approach Selection: Layered strategy, not one-or-the-other

After reviewing the codebase, I recommend a combination of options rather than
picking a single mechanism. The four options in the planning question serve
different audiences and are not mutually exclusive. Here is my ranking and
rationale:

**1. `termsOfService` field in OpenAPI `info` object (do first, zero runtime cost)**

OpenAPI 3.1 has a first-class `info.termsOfService` field. This is the
standard, spec-defined place to declare where your ToS lives. Any developer
who reads the spec or uses an API client generated from it will find the ToS
URL automatically. This costs zero lines of runtime code -- it is purely a
spec-level declaration. The current `openapi.yaml` does not use this field.

```yaml
info:
  title: Web Resource Ledger API
  version: 0.2.0
  termsOfService: https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md
```

**2. `Link` header on every response (do second, minimal runtime cost)**

A `Link` header with `rel="terms-of-service"` (RFC 8288) is the HTTP-level
standard for advertising legal documents. It has the advantage of being
discoverable from *any* API interaction without requiring the consumer to
know about a specific endpoint. This is how HTTP was designed to work.

```
Link: <https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md>; rel="terms-of-service"
```

Implementation is one line added to the existing security-header block in
`index.js` (lines 51-55), which already sets `Referrer-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, and `HSTS` on every response.
This follows the exact same pattern -- a universal header applied post-handler.

**3. Enrich the health endpoint (do third, trivial)**

Add a `legal` object to the health response. This gives programmatic
consumers a stable JSON location to discover legal document URLs without
parsing headers. The health endpoint is the natural "service info" endpoint
and is already unauthenticated.

```json
{
  "status": "ok",
  "legal": {
    "terms": "https://github.com/.../TERMS.md",
    "policy": "https://github.com/.../CONTENT-POLICY.md"
  }
}
```

**4. Do NOT add `GET /v1/legal/terms` or `GET /v1/legal/policy` endpoints**

I explicitly recommend *against* dedicated legal endpoints served by the
Worker. Reasons:

- **YAGNI**: The documents are static Markdown. Serving them through a
  Cloudflare Worker adds a route, a handler function, content-type
  negotiation, and tests -- all to serve a file that GitHub already serves
  for free with superior caching, versioning (git blame), and rendering.
- **KISS**: A Link header and a health-endpoint field point consumers to
  the canonical source. Adding Worker endpoints creates a second copy that
  must stay in sync with the repository files.
- **Latency budget**: Every Worker route consumes CPU time. Legal documents
  are not latency-sensitive -- they are read once. A GitHub URL is fine.
- **Precedent**: Stripe, Twilio, and GitHub APIs all link to external legal
  pages rather than serving them inline. The OpenAPI `termsOfService` field
  is defined as a URL, not an inline body.

**5. Do NOT add `tos_url` to the 202 capture response**

The 202 response (`CaptureAccepted` schema) is a workflow-oriented response:
capture ID, status URL, advisory note. Injecting legal URLs into this
response conflates legal discovery with capture lifecycle. The `Link` header
on the same response already covers discoverability without polluting the
response body.

### Where to host the documents

**Host in the repository as Markdown files, served by GitHub.**

- `TERMS.md` at repo root (convention: capital filename for legal documents)
- `CONTENT-POLICY.md` at repo root

Rationale:
- Git history provides a complete, timestamped, immutable audit trail of
  every change to the legal text. This is better provenance than any CMS.
- GitHub renders Markdown natively, so the URL is both human-readable and
  machine-fetchable (`raw.githubusercontent.com` for plain text).
- No additional infrastructure (no GitHub Pages, no static hosting).
- The Helix Manifesto principle "lean and mean" applies: fewer moving parts.

### ToS versioning

**Use date-stamped effective dates inside the document, not date-stamped URLs.**

The URL should be stable (`TERMS.md`), not versioned (`TERMS-2026-03-16.md`).
Reasons:

- A stable URL means every API response, every OpenAPI spec, and every
  cached `Link` header points to the *current* terms. No cache-busting
  or URL rotation needed.
- Git history provides version archaeology: `git log TERMS.md` shows every
  revision with dates. Any prior version is accessible via git SHA.
- The document itself should include an "Effective date" and "Last updated"
  header. This is the legal convention.
- If a consumer needs to prove which ToS version was in effect at capture
  time, the git history provides this (and WRL's own capture + signing
  infrastructure could even self-capture the ToS page for irony points).

If a future need arises for programmatic access to *prior* ToS versions
(e.g., "which ToS was I agreeing to on 2026-03-01?"), that can be solved
with a `git blame` URL or a GitHub API call. Do not design for this now.

### Content moderation policy: abuse contact mechanism

Issue #37 specifies an "abuse reporting mechanism (email or endpoint)." The
simplest approach that satisfies this:

- Include an `abuse-contact` email address in `CONTENT-POLICY.md`
- Add an `X-Abuse-Contact` header to all responses (optional, but follows
  the pattern used by hosting providers)
- Do NOT build an abuse-reporting API endpoint. This is YAGNI for a
  single-operator deployment. An email address is sufficient.

### Verification page integration

The verification page (content-negotiated HTML at `/v1/verify/{id}`) should
include a footer link to both the ToS and content moderation policy. This
satisfies the issue's requirement to link from the verification page without
adding API surface area.

## Proposed Tasks

### Task 1: Create legal documents
**What**: Write `TERMS.md` and `CONTENT-POLICY.md` in the repository root.
**Deliverables**: Two Markdown files with effective dates, covering prohibited
use, operator rights, content moderation, and abuse contact.
**Dependencies**: None. This is a content task, not a code task.
**Note**: This is a software-docs-minion or legal-minion deliverable, not
an API design task. I am flagging it because the API changes depend on the
URLs being established.

### Task 2: Add `termsOfService` to OpenAPI spec
**What**: Add `termsOfService` URL to the `info` object in `openapi.yaml`.
**Deliverables**: Updated `openapi.yaml` with `info.termsOfService` pointing
to the GitHub-hosted `TERMS.md`.
**Dependencies**: Task 1 (need the URL to exist).

### Task 3: Add `Link` header with `rel="terms-of-service"` to all responses
**What**: Add one line to the universal header block in `index.js` (after
line 54) setting a `Link` header on every response.
**Deliverables**: Updated `index.js`, updated `openapi.yaml` to document the
new header in all response schemas.
**Dependencies**: Task 1 (need the URL).

### Task 4: Enrich health endpoint with legal URLs
**What**: Expand `handleHealth()` response to include a `legal` object with
`terms` and `policy` URLs.
**Deliverables**: Updated `index.js` `handleHealth()` function, updated
`openapi.yaml` health response schema.
**Dependencies**: Task 1 (need the URLs).

### Task 5: Add legal footer to verification page
**What**: Update the static verification HTML page to include ToS and content
policy links in the footer.
**Deliverables**: Updated `verify-page.js` (or wherever the HTML template
lives).
**Dependencies**: Task 1.

### Task 6: Update tests
**What**: Update existing tests to assert the `Link` header is present on
responses. Add a test for the enriched health endpoint response shape.
**Deliverables**: Updated test files.
**Dependencies**: Tasks 3 and 4.

## Risks and Concerns

### Low risk: Link header caching
The `Link` header URL will be baked into the code. If the ToS URL changes
(e.g., repository rename), a code deploy is required. This is acceptable
because ToS URLs should be stable, and the Worker already requires deploys
for any configuration change. Mitigation: use a URL that is unlikely to
change (repo root `TERMS.md`).

### Low risk: Health endpoint response shape change
Adding a `legal` field to the health response is an additive, non-breaking
change. Any existing consumer parsing `{ "status": "ok" }` will continue to
work. The field is optional from the consumer's perspective.

### Medium risk: Legal document quality
The ToS and content policy need to be reasonable legal documents, not
placeholder text. Issue #37 explicitly says "not legal advice -- reasonable
template." The risk is that the template is too generic to provide
meaningful legal cover. Mitigation: use established templates from similar
open-source services (e.g., Internet Archive, Conifer/Webrecorder).

### Non-risk: Breaking changes
None of the proposed changes modify existing response schemas. All changes
are additive (new header, new field in health response, new spec field).

## Additional Agents Needed

- **software-docs-minion**: To draft the actual ToS and content policy
  documents. The API design work is about *where* and *how* to surface
  them; the content itself is a documentation task. The docs minion should
  use templates from comparable web archiving/evidence services.

None beyond what is likely already planned. The implementation tasks are
straightforward enough that the primary implementer (margo or equivalent)
can handle the code changes. The OpenAPI spec updates can be handled by
the same implementer or an api-spec-minion if one is involved.
