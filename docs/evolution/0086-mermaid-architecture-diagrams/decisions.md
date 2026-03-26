# Decisions — Mermaid Architecture Diagrams

## Diagram abstraction level
- **Chosen**: Conceptual flows with descriptive labels (e.g., "Create Capture") and endpoint paths in parentheses
- **Over**: Endpoint-level diagrams showing every route path
- **Why**: API Reference already covers endpoints. Architecture diagrams explain HOW, not WHAT.

## Share link flow
- **Chosen**: Removed entirely from both diagrams
- **Over**: Including it as described in issue #168
- **Why**: `POST /v1/captures/{id}/share` does not exist in the codebase (confirmed by api-design-minion grep). Verify endpoint is public by design.

## Scope of user interaction flows
- **Chosen**: 5 interaction patterns (auth, single capture, batch, verification + certificate, account management)
- **Over**: Including scheduled captures, diff, notifications, billing
- **Why**: Architecture overview for evaluators — too many flows makes the sequence diagram unreadable. Secondary flows can be documented on their own pages.

## Mermaid rendering approach
- **Chosen**: Client-side CDN with inline `<script type="module">` and dynamic import
- **Over**: (1) Build-time rendering via Eleventy plugin, (2) Separate mermaid-init.js file
- **Why**: CDN approach fixes all existing and future diagrams with zero build complexity. Inline script per margo's simplification advisory. Aligns with project's "prefer lightweight, vanilla solutions" principle.

## Mermaid version pinning
- **Chosen**: Pin to exact version (11.4.1) with try/catch fallback
- **Over**: Major version range (@11) without error handling
- **Why**: Code review identified that unpinned version risks silent breakage. try/catch ensures CDN failure degrades gracefully to readable code blocks.

## Prism grammar registration
- **Chosen**: Register empty Prism grammar for `mermaid` language in eleventy.config.js
- **Over**: Relying on default Prism behavior for unknown languages
- **Why**: Code review BLOCK identified that Prism might strip language-mermaid class. Empty grammar ensures class is reliably preserved for client-side rendering.

## Page placement
- **Chosen**: After API Reference, before Security & Compliance
- **Over**: Between Getting Started and Authentication
- **Why**: Natural reading flow: onboarding → usage → reference → understanding → trust. Architecture is reference material that bridges API usage and security trust model.

## Single page vs split
- **Chosen**: Single page with both diagrams
- **Over**: Separate pages for each diagram
- **Why**: Content is complementary (user flows + internal pipeline). Nav already has 21 entries.
