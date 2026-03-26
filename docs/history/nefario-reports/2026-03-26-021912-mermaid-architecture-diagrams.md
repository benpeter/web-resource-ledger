---
task: "Add Mermaid architecture diagrams to documentation site"
date: 2026-03-26
source-issue: 168
status: complete
agents: [software-docs-minion, frontend-minion, security-minion, api-design-minion, code-review-minion, lucy, margo, gru, test-minion, ux-strategy-minion]
task-count: 2
gate-count: 1
mode: execution
---

## Summary

Added two Mermaid architecture diagrams to the WRL documentation site: a sequence diagram showing user interaction flows (auth, capture lifecycle, verification, account management) and a flowchart showing the capture pipeline with the cryptographic integrity chain. Also added client-side Mermaid rendering via CDN, which fixed 3 existing unrendered diagrams in the security whitepaper.

## Original Prompt

GitHub Issue #168: Create two Mermaid diagrams for the documentation site and add them as a new page in the site navigation. Diagram 1 shows user interaction flows (tenant and verifier roles). Diagram 2 shows the capture pipeline and integrity chain with all involved systems.

## Key Design Decisions

### Conceptual flows over endpoint-level diagrams
The API Reference page already covers endpoint details. Architecture diagrams use descriptive labels ("Create Capture") with endpoint paths in parentheses, explaining HOW the system works rather than repeating WHAT endpoints exist.

### Share link flow removed
The issue described `POST /v1/captures/{id}/share` with `wrl_share_xxx` tokens. api-design-minion confirmed this endpoint does not exist in the codebase. The verify endpoint is public by design — no share mechanism needed. Removed from both diagrams.

### Client-side CDN rendering with inline script
Used `<script type="module">` with dynamic `import()` from jsDelivr (mermaid@11.4.1, pinned). Chosen over build-time Eleventy plugin for simplicity and because it fixes all existing and future Mermaid blocks site-wide. Inline rather than separate file per margo's simplification advisory. try/catch ensures CDN failure degrades to readable code blocks.

### Empty Prism grammar for mermaid
Code review identified that the syntax highlight plugin (Prism) might not reliably preserve the `language-mermaid` class. Registering an empty grammar (`Prism.languages.mermaid = {}`) ensures passthrough with class intact — a defensive two-line fix.

### Single page after API Reference
Both diagrams on one page at `site/content/architecture.md`, placed after API Reference and before Security & Compliance. Natural reading flow: onboarding → usage → reference → understanding → trust.

## Execution

### Task 1: Add Mermaid JS rendering (inline, base.njk)
Added inline `<script type="module">` to `site/_includes/layouts/base.njk` that conditionally loads Mermaid from CDN only when `pre code.language-mermaid` elements exist. Registered empty Prism grammar in `site/eleventy.config.js`. No separate JS file needed.

### Task 2: Create architecture page + navigation
Created `site/content/architecture.md` with two Mermaid diagrams verified against source code. Added navigation entry in `site/_data/site.js` and card in `site/content/index.md`. Key source files read: `src/index.js`, `src/capture.js`, `src/wacz.js`, `src/signing.js`, `src/rfc3161.js`, `src/verify.js`, `src/url-validation.js`, `src/threat-check.js`.

## Verification

Code review: 1 BLOCK auto-fixed (Prism grammar registration), 2 ADVISE auto-fixed (version pinning + try/catch, unused parameter). Tests: not applicable (docs-only changes). Documentation: this IS the documentation change.

## Agent Contributions

### Planning (Phase 2)
- **security-minion**: Verified exact pipeline sequence and cryptographic proof chain from 9 source files. Produced 8-item redaction checklist for public diagrams. Confirmed signatures are siblings (not chain), bundleHash signed as UTF-8 string.
- **api-design-minion**: Confirmed share link flow does not exist. Identified 6 missing endpoint groups. Recommended conceptual flows over endpoint-level detail.
- **software-docs-minion**: Analyzed site structure, recommended placement after API Reference, single page, existing frontmatter conventions. Flagged Mermaid rendering as critical risk.

### Review (Phase 3.5)
- **gru**: APPROVE — technology choices sound, CDN approach appropriate
- **lucy**: APPROVE — plan matches intent, conventions compliant
- **margo**: ADVISE — inline init script, consolidate tasks (both incorporated)
- **test-minion**: APPROVE — tests correctly excluded for docs-only changes
- **ux-strategy-minion**: APPROVE — journey coherent, suggest details/summary for integrity chain

### Code Review (Phase 5)
- **code-review-minion**: BLOCK → fixed (Prism grammar + version pin + try/catch)
- **margo**: ADVISE (version pin + try/catch — aligned with code-review-minion)
- **lucy**: ADVISE (convention consistency — noted, inline approach accepted)

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `site/content/architecture.md` | created | Architecture page with 2 Mermaid diagrams |
| `site/_includes/layouts/base.njk` | modified | Inline Mermaid rendering script |
| `site/_data/site.js` | modified | Navigation entry |
| `site/content/index.md` | modified | Architecture card in Getting Started |
| `site/eleventy.config.js` | modified | Empty Prism grammar for mermaid |
| `docs/evolution/0086-mermaid-architecture-diagrams/` | created | Evolution log |
| `docs/evolution/README.md` | modified | Index entry |

Resolves #168
