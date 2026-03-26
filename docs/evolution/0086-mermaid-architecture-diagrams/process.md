# Process — Mermaid Architecture Diagrams

## TL;DR

Three planning specialists (security-minion, api-design-minion, software-docs-minion) analyzed the codebase to verify the proposed diagrams against reality, finding one critical inaccuracy in the issue description (share links don't exist) and producing a security redaction checklist. Five reviewers approved the plan with one ADVISE (margo: simplify). Execution produced two tasks — Mermaid rendering infrastructure and the architecture page — with code review catching a Prism compatibility issue that was auto-fixed. Two commits, 5 files changed, all from a single documentation page with two diagrams.

## Phase 1: Meta-Plan

Nefario identified 4 planning specialists. Lucy trimmed to 3, cutting ux-strategy-minion as disproportionate for constrained Mermaid output (a reasonable call — Mermaid diagrams have limited layout flexibility).

**Team selected**: security-minion, api-design-minion, software-docs-minion.

## Phase 2: Specialist Planning

Three agents ran in parallel. Key findings by specialist:

### security-minion
Read 9 source files (`src/capture.js`, `src/wacz.js`, `src/signing.js`, `src/rfc3161.js`, `src/verify.js`, `src/rate-limits.js`, `src/url-validation.js`, `src/threat-check.js`, `src/index.js`) and produced the authoritative pipeline description. Most valuable output: the 8-item redaction checklist (don't expose rate limit thresholds, queue re-validation, fail-open behavior, internal binding names, etc.) and the clarification that signatures are siblings in an array, not a sequential chain.

### api-design-minion
Discovered the most impactful finding: the share link flow described in issue #168 (`POST /v1/captures/{id}/share` with `wrl_share_xxx` tokens) **does not exist anywhere in the codebase**. Grep confirmed zero matches. The verify endpoint is public by design and needs no share mechanism. Also identified 6 endpoint groups missing from the issue description (batch, diff, certificate, scheduled captures, billing, notifications) and recommended keeping diagrams at conceptual level.

### software-docs-minion
Analyzed the existing site structure (21 nav entries, Eleventy with doc.njk layout) and recommended placement after API Reference, single page, matching existing frontmatter conventions. Critically flagged that the docs site had no Mermaid rendering — the security whitepaper already had 3 unrendered Mermaid blocks showing as raw code.

## Phase 3: Synthesis

Nefario consolidated into a 3-task plan: (1) Mermaid rendering, (2) architecture page (gated), (3) navigation update. Key synthesis decisions:
- Share links removed (doesn't exist)
- 5 interaction patterns scoped (excluding scheduled captures, diff, notifications for clarity)
- Client-side CDN over build-time plugin (lightweight, fixes all existing diagrams)

## Phase 3.5: Architecture Review

Lucy added gru and removed security-minion from the reviewer set (security had already contributed during planning; the docs site review doesn't need a second security pass).

**5 reviewers**: gru, lucy, margo, test-minion, ux-strategy-minion.

Results: 4 APPROVE, 1 ADVISE (margo). Margo's advice was concrete and correct:
1. Inline the Mermaid init script instead of a separate JS file (eliminates extra file + HTTP request)
2. Fold Task 3 (nav update) into Task 2 (it's two one-line edits)

Both incorporated. Lucy reinforced the task consolidation at the plan approval gate.

## Phase 4: Execution

Consolidated to 2 tasks per margo/Lucy:

**Task 1** (executed directly by orchestrator): Added inline `<script type="module">` to base.njk with conditional dynamic import. ~10 lines of vanilla JS.

**Task 2** (software-docs-minion): Created `site/content/architecture.md` with both diagrams plus nav entry and card. The agent read all relevant source files before writing, confirming: queue re-validation exists but is correctly hidden, dual screenshots confirmed, signatures are siblings, key resolution is server-side.

## Phase 5: Code Review

Three reviewers found issues:

**code-review-minion** (BLOCK): Identified that Prism's syntax highlight plugin might not reliably apply `language-mermaid` class to unknown language code blocks. Recommended registering an empty Prism grammar as a defensive fix. Also flagged: no version pinning on CDN, no try/catch, unused forEach parameter.

**margo** (ADVISE): Aligned with code-review-minion on version pinning and try/catch. Noted the inline approach was correct (as margo had originally recommended).

**lucy** (ADVISE): Noted convention difference (inline vs external JS pattern) but accepted the inline approach.

**Auto-fix applied**: Pinned mermaid@11.4.1, added try/catch, registered empty Prism grammar, removed unused parameter. All three reviewers' concerns addressed in one commit.

## Human Interventions

None — this was an autonomous execution. All gate decisions made by Lucy agent.

## Where to Read More

- Evolution log: `docs/evolution/0086-mermaid-architecture-diagrams/`
- Nefario report: `docs/history/nefario-reports/2026-03-26-021912-mermaid-architecture-diagrams.md`
