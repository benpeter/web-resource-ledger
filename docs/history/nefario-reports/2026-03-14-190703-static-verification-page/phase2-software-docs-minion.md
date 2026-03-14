# Phase 2: Software Documentation Specialist Contribution

## Summary

This phase introduces two architectural firsts for the project: content negotiation (same URL, two representations) and the first user-facing UI. Both deserve documentation, but the project's minimalist philosophy and existing patterns dictate exactly how much. The evolution log is mandatory and well-scoped. Additional architecture documentation would be over-engineering -- the pattern is small enough to document in `decisions.md` and code comments.

## Evolution Log Requirements

### Phase Directory: `docs/evolution/0010-static-verification-page/`

This is phase 0010 (next sequential after 0009-verification-endpoint).

### `prompt.md`

Must be created before implementation begins (CLAUDE.md rule 1). Content: reference to GitHub Issue #7, the goal statement ("browser-accessible verification for non-technical users"), and the content negotiation approach. Copy or link the issue text -- this is the task briefing.

### `decisions.md` -- What to Capture

This is where the architectural documentation for this phase lives. Based on the patterns established in phases 0002-0009, `decisions.md` should capture these decision categories as they arise during implementation:

**1. Content Negotiation Strategy**

The core architectural decision. Document:
- **Decision**: How the Accept header is parsed and what triggers HTML vs JSON. Specifically: does `text/html` anywhere in Accept suffice, or is quality-factor parsing needed? What happens when Accept includes both `text/html` and `application/json`?
- **Alternatives considered**: Separate URL (e.g., `/v1/verify/{id}/page`) vs content negotiation on the same URL. The issue spec says content negotiation -- document why this is the right call (single URL for sharing, no URL proliferation, standard HTTP semantics).
- **Consequences**: Caching implications (Vary: Accept header required, or CDN/proxy may serve wrong representation). Document the Vary header decision explicitly -- this interacts with the existing cache-control split from phase 0009 (verified: 24h cache, unverified: no-store).

**2. HTML-as-String-in-Worker Pattern**

Document the decision to inline the entire HTML page as a template string/function in the Worker code rather than:
- Serving from R2 or KV (separate static asset)
- Using Cloudflare Pages or Sites
- A build step that compiles HTML into the Worker bundle

The rationale is in the issue: single self-contained response, no external dependencies, no build step. But document it as a conscious choice with the trade-off that the HTML template lives in JavaScript, making it harder to edit than a standalone `.html` file.

**3. Data Fetching Architecture**

The issue says "calls `GET /v1/verify/{id}` API" -- but the Worker is serving both the HTML and the API. Document whether:
- The HTML page makes a client-side fetch back to the same URL with `Accept: application/json`
- The Worker injects verification data directly into the HTML (server-side data embedding)
- Some hybrid approach

This decision has security implications (CORS, CSP), performance implications (one round-trip vs two), and UX implications (loading states vs instant data). It is the most architecturally significant decision in this phase.

**4. Noscript Fallback Scope**

The issue spec is clear: capture ID and a direct link to the JSON API. Document this as a deliberate minimalism decision. The noscript path does NOT attempt to render verification results -- it provides a pointer to the machine-readable data. This is the accessibility floor, not an alternative UI.

**5. Security Headers for HTML Response**

The existing JSON responses use `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` (applied globally in `index.js`). The HTML response needs additional consideration:
- Content-Security-Policy (the page must not load any external resources -- CSP enforces this)
- X-Frame-Options or CSP frame-ancestors (prevent clickjacking of the verification badge)
- Document decisions around these headers and their values

### `outcome.md`

Written after implementation. Follow the established pattern from phases 0007-0009:
- Files changed table (file, action, lines, description)
- Test results (count, coverage areas)
- Deviations from issue spec (if any)
- Backlog changes section (mandatory even if empty -- CLAUDE.md rule 4)
- Surprises section

### `process.md`

Required because this is a nefario orchestration producing a PR (CLAUDE.md process documentation section). Follow the style from `0009-verification-endpoint/process.md`:
- TL;DR paragraph with outcomes and key numbers
- Team section (who was consulted)
- Planning conflicts with both sides' reasoning
- Phase 3.5 catches
- Human interventions
- "Where to read more" links to `docs/history/`

## Architecture Documentation Beyond Evolution Log

### Do NOT create a standalone ADR for content negotiation

Content negotiation is an established HTTP pattern, not a novel architectural decision unique to this project. It is one route handler serving two representations. This does not warrant an ADR. The `decisions.md` entry (decision #1 above) is sufficient.

An ADR would be warranted if:
- The project adopted content negotiation as a general pattern across multiple endpoints (it does not -- this is the only endpoint that serves HTML)
- The decision had lasting architectural consequences beyond this single endpoint (it does not)
- Future developers would ask "why did we use content negotiation?" (they will not -- the issue spec prescribes it)

### Do NOT create C4 diagrams or architecture diagrams

The system architecture has not changed. A single Worker still handles all routes. Adding an HTML response to one existing route does not change the Container or Component diagrams. If C4 diagrams exist or are created later, they do not need updating for this phase.

### Code-level documentation

The content negotiation logic in `index.js` (or wherever the Accept header parsing lives) should have a brief inline comment explaining:
- What Accept values trigger HTML vs JSON
- That this is the only endpoint with content negotiation
- Reference to the Vary header decision

The HTML template function/string should have a docstring-style comment explaining:
- That the HTML is self-contained (no external deps)
- That it makes a client-side fetch (or embeds data server-side) -- whichever pattern is chosen
- CSP policy rationale if non-obvious

These are "why" comments, not "what" comments, consistent with the project's code documentation convention.

## Backlog Updates

After this phase, review `docs/backlog.md` for these changes:

### Items to potentially update

- **"Web UI for capture submission"** ([consider] in Product Features): This phase establishes that WRL serves HTML from the Worker. If the verification page works well, it lowers the barrier for a future capture submission UI using the same pattern. The backlog item's tier may warrant re-evaluation -- not necessarily promotion, but a note that the pattern now exists.

### Items to potentially add

- **CSS/HTML maintenance burden**: The HTML-as-string-in-Worker pattern means UI changes require modifying JavaScript. If a second HTML page is ever needed, consider extracting templates to separate files or a minimal build step. This is a [consider]-tier item at most -- YAGNI until there is a second page.
- **Accessibility audit**: The verification page is the first user-facing UI. It should meet basic WCAG 2.1 Level A (semantic HTML, color contrast, keyboard navigation). If the implementation does not address accessibility, add it to backlog as [should].

### Items NOT expected to change

- Auth, API, Signing, Capture Fidelity, Security, Storage, Operations sections are unaffected by this phase.

## Risks and Dependencies from a Documentation Perspective

### Risk: Vary header omission breaks caching

If the implementation does not add `Vary: Accept` to responses on the verify endpoint, CDN/proxy caches may serve HTML to JSON clients or vice versa. This is a correctness bug, not just a documentation issue. The `decisions.md` entry should document the Vary header choice, and tests should assert its presence.

### Risk: Cache-Control interaction with content negotiation

Phase 0009 established a conditional cache split: `public, max-age=86400, stale-while-revalidate=604800` for verified:true, `no-store` for verified:false. The HTML response needs the same split, or caching behavior becomes inconsistent between representations. Document whether HTML and JSON share identical cache-control logic.

### Risk: Evolution log written retroactively

CLAUDE.md rule 2 says "capture decisions in `decisions.md` as they happen -- don't backfill from memory." The planning phase should pre-populate `decisions.md` with the decision categories above (as questions to be answered), then fill in answers during implementation. This is the pattern that has worked in prior phases.

### Dependency: Phase 0009 verification response shape

The HTML page renders data from the `/v1/verify/{id}` JSON response. That shape is documented in `0009-verification-endpoint/decisions.md` (decision #3). The HTML template must consume: `verified`, `capture.id`, `capture.createdAt`, `capture.completedAt`, `signing` (object or null), and `checks` (array of `{ name, status, detail? }`). The HTML page should NOT depend on fields from the retrieval endpoint (`capture.url`, artifact URLs) -- those are behind the private/no-store access model.

Wait -- the issue says "shows: URL, capture timestamp, SHA-256 bundle hash, verified/unverified badge, screenshot inline." But `capture.url` is deliberately absent from the verify response (phase 0009 decision #5, security-minion HIGH priority). And the screenshot requires the retrieval endpoint which needs the capture ID as access secret. This creates a conflict between the issue spec and the implemented security model. **This must be resolved in `decisions.md` as a deviation from the issue spec**, following the pattern from phase 0009 where cache-control and response shape deviations were explicitly documented.

## Additional Specialists

No additional specialists needed beyond those already in this planning round. The edge-minion covers Cloudflare Worker implementation, security-minion covers CSP/headers, ux-design-minion covers the page design, and test-minion covers test strategy. The documentation needs are fully covered by the evolution log pattern already established.

If the conflict between the issue spec (showing URL and screenshot) and the security model (URL absent from verify response) is not resolved during planning, **security-minion's input is critical** -- they raised the original advisory that removed `capture.url` from the verify response.
