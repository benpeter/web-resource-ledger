MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
GitHub Issue #7: MVP Step 7 -- Static Verification Page

Browser-accessible verification page for non-technical users. Content negotiation in existing Cloudflare Worker: if `Accept` header includes `text/html`, serve HTML instead of JSON for `GET /v1/verify/{id}`. Single self-contained HTML string with inlined CSS and vanilla JS. `<noscript>` fallback shows capture ID and direct API link. No framework, no build step, no external dependencies; inlined CSS only.

Acceptance Criteria:
- Open verification URL in a browser — result renders with verified badge and screenshot
- Disable JS in browser — `<noscript>` fallback shows capture ID and a direct API link
- Zero external HTTP requests from the page (no CDN fonts, no analytics, no external scripts)

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase2-edge-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase2-ux-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase2-software-docs-minion.md

## Key consensus across specialists:

- edge-minion: Extract HTML to `src/verify-page.js`; 4-line Accept check in handler; Vary: Accept on all responses; strict CSP with nonce; escapeHtml utility.
- ux-design-minion: Server-side render data into HTML (no client-side fetch for verification data); `<img>` tag for screenshot pointing to artifact endpoint (not base64); progressive disclosure. Flagged URL privacy conflict.
- security-minion: Nonce-based CSP mandatory; textContent-only for JS; Vary: Accept; escapeHtml for server-rendered values; exclude URL from noscript. HIGH risk: XSS via captured URL, CSP bypass.
- test-minion: Two-layer testing (unit + integration), no E2E; string assertions not DOM parsing; Accept: */* must return JSON; simple conneg for MVP; ~20-26 tests total.
- ux-strategy-minion: Trust interface (not data display); "Is this capture real?" is the user's question; human-readable check labels needed; noscript is developer-only. Flagged URL needed for user context.
- software-docs-minion: Phase 0010 evolution log; no standalone ADR; document conneg decision in decisions.md; minimal backlog impact.

## Key Conflicts to Resolve:

1. **URL Privacy**: The issue spec says show URL. The Step 6 verify API deliberately excludes `capture.url` (security decision -- public cached endpoint). UX specialists say URL is needed for context. Security says exclude from noscript. Resolution needed: Can the Worker read URL from KV at render time for HTML only (not exposed in JSON API)? This makes HTML reveal more than JSON -- is that acceptable since HTML is still access-controlled by capture ID?

2. **Screenshot Delivery**: ux-design-minion recommends `<img src>` pointing to artifact endpoint. This means an external HTTP request from the page to same-origin. Does this violate the "zero external HTTP requests" acceptance criterion? The issue likely means no THIRD-PARTY requests (CDN fonts, analytics). Same-origin API calls for data display are different.

3. **Client-side JS Role**: ux-design-minion says server-side render (no fetch needed). security-minion mentions textContent-only DOM insertion (implies client-side JS). If data is server-rendered into HTML, JS role reduces to: screenshot loading, hash copy-to-clipboard, and progressive disclosure interactions.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase3-synthesis.md`
