# Task 5: Create Evolution Log for Phase 0010

Create the evolution log directory and initial files for MVP Step 7:
Static Verification Page.

## Directory: `docs/evolution/0010-static-verification-page/`

Create three files:

### 1. `prompt.md`

Reference GitHub Issue #7. Include the goal statement: "Browser-accessible
verification page for non-technical users." Copy or reference the issue text.
Include the content negotiation approach (Accept header check on existing
verify endpoint, not a separate route). Note that this was a nefario
orchestration.

### 2. `decisions.md`

Document these decisions (pre-populate with the decisions that have already
been made during planning, then note items to be filled in during
implementation):

**Decision 1: Content Negotiation on Existing Route**
- Accept header check at end of `handleVerifyCapture`
- Simple `text/html` substring match, no quality-value parsing
- JSON is the default for `*/*`, absent header, and all non-`text/html` types
- Alternatives rejected: separate URL (e.g., `/v1/verify/{id}/page`) -- would
  mean two cache keys, two rate-limit paths, inconsistent with HTTP semantics

**Decision 2: Client-Side Fetch (Not Server-Side Rendering)**
- Issue spec explicitly says "This is NOT a server-side rendered page"
- HTML is a static shell with inlined JS that fetches from the verify and
  retrieval endpoints
- UX specialists recommended SSR but issue spec takes precedence
- Trade-off: brief loading state vs. simpler architecture and no server-side
  HTML escaping of user-controlled data

**Decision 3: Two Client-Side Fetches**
- Fetch 1: `GET /v1/verify/{id}` with `Accept: application/json` for
  verification result
- Fetch 2: `GET /v1/captures/{id}` for URL and screenshot artifact URL
- Rationale: verify response deliberately excludes `url` (Decision 5 from
  Phase 0009); retrieval endpoint has it but uses `private, no-store`
- This preserves the security model: URL is never in a publicly cached response

**Decision 4: `'unsafe-inline'` CSP (Not Nonce-Based)**
- Script and style blocks are static template strings -- no dynamic data
  interpolated into them
- Nonce adds per-request overhead for zero security benefit when inline
  content is static
- security-minion recommended nonces; edge-minion recommended unsafe-inline;
  resolved in favor of simplicity (KISS)
- Upgrade path clear: switch to nonce if template ever needs server-side
  dynamic data in script blocks

**Decision 5: Error Paths Stay JSON**
- 404, 429, 503 error responses remain `application/problem+json`
- HTML error templates are YAGNI for MVP
- UX specialist suggested HTML 404 page; deferred as non-essential

**Decision 6: Screenshot via `<img>` Tag (Not Base64 Inline)**
- Same-origin request to `/v1/captures/{id}/artifacts/screenshot`
- "Zero external HTTP requests" means no third-party requests, not no
  same-origin requests
- Keeps HTML payload ~5KB vs ~1.4MB with inline base64

**Decision 7: Noscript Fallback Is Minimal**
- Capture ID + JSON API link only
- No verification result, no URL (would require SSR + HTML escaping)
- Issue spec: "the `<noscript>` fallback is the accessibility floor, not full SSR"

### 3. `outcome.md`

Write a placeholder noting it will be filled after implementation. Include
sections for: Files Changed, Test Results, Deviations, Backlog Changes,
Surprises.

## Also Update

**`docs/evolution/README.md`**: Add row for Phase 0010:
```
| [0010-static-verification-page](0010-static-verification-page/) | Static verification page with content negotiation (Issue #7) |
```

## What NOT to Do

- Do NOT update `docs/backlog.md` yet (that happens in outcome.md after
  implementation)
- Do NOT create ADR documents
- Do NOT create C4 diagrams
- Do NOT create a `process.md` yet (that is written after PR creation)

## Deliverables

- `docs/evolution/0010-static-verification-page/prompt.md`
- `docs/evolution/0010-static-verification-page/decisions.md`
- `docs/evolution/0010-static-verification-page/outcome.md` (placeholder)
- Updated `docs/evolution/README.md`

## Completion

When you finish, mark the task as completed with TaskUpdate and send a message
to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
