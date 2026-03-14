# Decisions: Static Verification Page

## 1. Content Negotiation on Existing Route

**Decision**: Accept header check at end of `handleVerifyCapture`. Simple
`text/html` substring match, no quality-value parsing. JSON is the default
for `*/*`, absent header, and all non-`text/html` types.

**Alternatives considered**:
- Separate URL (e.g., `/v1/verify/{id}/page`) -- rejected because it creates
  two cache keys, two rate-limit paths, and is inconsistent with HTTP
  semantics. One resource should have one URL.

**Rationale**: HTTP content negotiation via Accept header is the standard
mechanism for serving the same resource in different representations.
Placing the check at the end of the handler ensures JSON behavior is
unchanged for all existing callers.

## 2. Client-Side Fetch (Not Server-Side Rendering)

**Decision**: HTML is a static shell with inlined JS that fetches from the
verify and retrieval endpoints. The server does not render the HTML body.

**Issue spec**: Explicitly states "This is NOT a server-side rendered page."

**Alternatives considered**:
- SSR -- UX specialists recommended server-side rendering for better
  SEO and no loading state. Rejected because the issue spec takes precedence
  and SSR would require server-side HTML escaping of user-controlled data
  (capture URLs).

**Trade-off**: Brief loading state on page open vs. simpler architecture
and no risk of XSS through server-side template interpolation of
user-controlled capture URLs. KISS wins.

## 3. Two Client-Side Fetches

**Decision**:
- Fetch 1: `GET /v1/verify/{id}` with `Accept: application/json` for
  verification result
- Fetch 2: `GET /v1/captures/{id}` for URL and screenshot artifact URL

**Rationale**: The verify response deliberately excludes `url` (see Phase
0009, Decision 5) because the verify endpoint is public and long-cached.
The retrieval endpoint has the URL but uses `Cache-Control: private, no-store`
to protect it. Two fetches preserve the security model: the capture URL is
never in a publicly cached response.

**Alternative**: Extend verify response to include `url` -- rejected.
This would break the access-control model that private caching enforces
and was explicitly ruled out in Phase 0009.

## 4. `'unsafe-inline'` CSP (Not Nonce-Based)

**Decision**: Content-Security-Policy uses `'unsafe-inline'` for script
and style blocks.

**Rationale**: Script and style blocks are static template strings -- no
dynamic data is interpolated into them at the server side. Nonce-based CSP
adds per-request overhead and complexity for zero security benefit when
inline content is entirely static.

**Alternatives considered**:
- Nonce-based CSP -- security-minion recommended this; edge-minion
  recommended `unsafe-inline`. Resolved in favor of simplicity (KISS).

**Upgrade path**: Clear -- switch to nonce if the template ever needs
server-side dynamic data interpolated into script blocks.

## 5. Error Paths Stay JSON

**Decision**: 404, 429, and 503 error responses remain
`application/problem+json` regardless of the Accept header.

**Rationale**: HTML error templates are YAGNI for MVP. The verification
page's JS handles error states client-side and displays user-friendly
messages without requiring server-rendered error HTML.

**Alternative**: HTML 404 page -- UX specialist suggested this. Deferred
as non-essential for MVP.

## 6. Screenshot via `<img>` Tag (Not Base64 Inline)

**Decision**: Screenshot rendered as `<img src="/v1/captures/{id}/artifacts/screenshot">`.
The browser makes a same-origin request to the artifact endpoint.

**Rationale**: "Zero external HTTP requests" in the issue spec means no
third-party requests, not no same-origin requests. Keeping the screenshot
as a separate request keeps the HTML payload ~5KB vs ~1.4MB with inline
base64 encoding.

## 7. Noscript Fallback Is Minimal

**Decision**: `<noscript>` block shows capture ID and a link to the JSON
API only. Does not show verification result or URL.

**Rationale**: Showing the verification result or URL without JS would
require server-side rendering and HTML escaping of user-controlled data.
The issue spec states "the `<noscript>` fallback is the accessibility floor,
not full SSR." Minimal fallback is intentional.
