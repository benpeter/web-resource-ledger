# Meta-Plan: "Verify Independently" Section on Verify Page

## Task Summary

Add a collapsible "Verify independently" section to the server-rendered verify
page (`src/verify-page.js`) containing a pre-filled `npx @w-r-l/verify <url>`
command with a copy-to-clipboard button. The CLI tool is already published on
npm (v0.1.0). The section should be minimal -- not a tutorial.

## Scope

**In scope**:
- A collapsible `<details>` section in the verify page HTML
- Pre-filled npx command using the capture's verify URL
- Copy-to-clipboard interaction (button/icon)
- Appropriate placement in the page layout
- Accessibility for the new interactive element

**Out of scope**:
- Changes to the `@w-r-l/verify` CLI tool itself
- Tutorials, installation guides, or extended documentation
- Changes to the verification API endpoints
- CSP changes (clipboard API uses navigator.clipboard which requires no CSP change when triggered by user gesture; `script-src 'unsafe-inline'` already permits the inline script)

## Codebase Context

- **Verify page**: `src/verify-page.js` (~700 lines, vanilla JS, server-rendered HTML)
- **Page structure**: status banner > capture metadata > checks > screenshot > capture details disclosure > crypto details disclosure > footer
- **Existing patterns**: The page already uses `<details>/<summary>` for "Capture details" and "Cryptographic details" disclosures, plus a nested `<details>` for the before-consent screenshot. The new section should follow this established pattern.
- **Security**: Page uses `textContent` for all user data (XSS-safe). The captureId is already JSON-serialized into the inline script. The npx command can be constructed client-side from the existing `origin` and `captureId` variables.
- **CSP**: `script-src 'unsafe-inline'; connect-src 'self'` -- no changes needed for clipboard API.
- **CLI tool**: `npx @w-r-l/verify <capture-url>` works with verify URLs (`/v1/verify/cap_...`) and capture URLs (`/v1/captures/cap_...`). Published as `@w-r-l/verify@0.1.0`.
- **Trust gap**: The verify page says timestamp was "not verified cryptographically" but the CLI does full CMS/PKCS#7 chain validation. This section directly addresses that gap.

---

## Planning Consultations

### Consultation 1: UX Placement and Interaction Design

- **Agent**: ux-design-minion
- **Planning question**: Where exactly should the "Verify independently" collapsible section be placed in the verify page layout (after checks? after crypto details? before footer?), and what should the copy-to-clipboard interaction look like? Consider: the section bridges the trust gap between the page's "not verified cryptographically" timestamp wording and the CLI's full verification. Should the copy button use an icon only, icon + label, or text link? What visual treatment for the command display (code block styling)?
- **Context to provide**: Current page layout order (status banner > metadata > checks > screenshot > capture details > crypto details > footer). Existing `<details>` pattern. The page is 640px max-width, mobile-responsive. Vanilla CSS, no framework.
- **Why this agent**: Interaction design for the copy-to-clipboard pattern, visual treatment of the code block, and placement within the existing page hierarchy are UI design decisions.

### Consultation 2: Security Review of Clipboard API and Command Construction

- **Agent**: security-minion
- **Planning question**: Are there any security concerns with: (1) constructing the npx command from the client-side `origin` and `captureId` variables and placing it in a code block, (2) using `navigator.clipboard.writeText()` triggered by a button click, (3) the command string itself (could a malicious captureId lead to command injection when a user pastes into their terminal)? The captureId format is `cap_[a-f0-9]{32}` -- is this sufficient to prevent shell injection?
- **Context to provide**: The `captureId` variable is set via `JSON.stringify(captureId)` in the template. The captureId regex is `/cap_[a-f0-9]{32}/`. CSP is `script-src 'unsafe-inline'`.
- **Why this agent**: Any feature that constructs a command users paste into their terminal needs security review for injection risks.

### Consultation 3: Accessibility of Copy-to-Clipboard Interaction

- **Agent**: accessibility-minion
- **Planning question**: What are the accessibility requirements for a copy-to-clipboard button within a `<details>/<summary>` disclosure? Specifically: (1) What ARIA attributes should the copy button have? (2) How should success/failure feedback be communicated to screen readers (live region, aria-label change, or status role)? (3) Should the `<details>` summary text be descriptive enough to convey purpose without expanding? (4) Any keyboard interaction concerns?
- **Context to provide**: The page already has `sr-only` class, uses `aria-label`, `aria-hidden`, `aria-live="polite"`, and focus-visible outlines. Existing `<details>` elements use simple `<summary>` text.
- **Why this agent**: Copy-to-clipboard with visual feedback (icon change, tooltip) needs proper screen reader announcement and keyboard support.

---

## Cross-Cutting Checklist

- **Testing** (test-minion): EXCLUDE from planning. The change is a small HTML/CSS/JS addition to a server-rendered template. Existing test patterns (if any for verify-page) would cover this. Phase 6 post-execution testing handles validation. No complex logic requiring test strategy input during planning.
- **Security** (security-minion): INCLUDE -- Consultation 2 above. Terminal command injection risk from constructed npx command, clipboard API security model.
- **Usability -- Strategy** (ux-strategy-minion): INCLUDE. The "Verify independently" section directly addresses the trust gap between web-based and CLI verification. Planning question: Does adding this section to every verify page (including failed verifications) make sense, or should it only appear on successful verifications? How does this connect to the user's trust journey -- is the placement after verification checks the right moment to offer independent verification?
- **Usability -- Design** (ux-design-minion): INCLUDE -- Consultation 1 above. Placement, visual treatment, interaction design.
- **Usability -- Accessibility** (accessibility-minion): INCLUDE -- Consultation 3 above. Copy-to-clipboard ARIA patterns, screen reader feedback.
- **Documentation** (software-docs-minion / user-docs-minion): EXCLUDE from planning. The feature is intentionally minimal ("not a tutorial"). No API surface changes. Phase 8 post-execution documentation handles any needed updates. The verify page itself IS the documentation.
- **Observability** (observability-minion / sitespeed-minion): EXCLUDE from planning. No new runtime services or API endpoints. The change adds a few dozen lines of HTML/CSS/JS to an existing server-rendered page. No measurable performance impact.

---

## Anticipated Approval Gates

**1. UX design decision (placement + interaction pattern)** -- OPTIONAL gate.
This is easy to reverse (it's additive CSS/HTML), but it has downstream
dependents (the implementation task builds on the design). Since there are
multiple valid placement options and this is the primary user-facing trust
artifact, gating is warranted. LOW blast radius (1 dependent), easy to
reverse, but involves judgment. Per the supplementary rule: gate it.

This is likely the only gate needed. The implementation itself is
straightforward vanilla JS following established page patterns.

---

## Rationale

This is a small, well-scoped UI addition to an existing page. The technical
implementation is straightforward -- the page already uses `<details>` elements,
already has the captureId and origin in the inline script, and `navigator.clipboard`
is widely supported and requires no CSP changes.

The planning value comes from three areas:
1. **UX design**: Where to place it and how to style the interaction (multiple valid options)
2. **Security**: Terminal command injection is a non-obvious risk that deserves explicit review
3. **Accessibility**: Copy-to-clipboard with visual feedback needs proper screen reader support

The remaining cross-cutting concerns (testing, documentation, observability) are
handled by post-execution phases or are not applicable. This task does not need
infrastructure, API design, data modeling, or AI/ML specialist input.

---

## External Skill Integration

No external skills detected in project. No `.claude/skills/` or `.skills/`
directories contain SKILL.md files in the working directory. No relevant
user-global skills found at `~/.claude/skills/`.
