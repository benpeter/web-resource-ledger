---
task: "Advisory: verify page collapsible npx copy-to-clipboard command"
date: 2026-03-17
status: complete
mode: advisory
task-count: 0
gate-count: 0
agents: [ux-design-minion, security-minion, accessibility-minion, ux-strategy-minion]
slug: verify-page-npx-copy-command
---

## Summary

Unanimous recommendation: **Yes, add a collapsible "Verify independently" `<details>` section** to the verify page with a pre-populated `npx @w-r-l/verify` command and copy-to-clipboard button. The `@w-r-l/verify` CLI already exists with full 5-check verification including CMS/PKCS#7 timestamp chain validation. This closes a visible trust gap -- the page says timestamps are "not verified cryptographically" but the CLI tool can do exactly that. Implementation is ~80 lines in a single file (`src/verify-page.js`), no new dependencies, no server-side changes.

## Original Prompt

Should we add a collapsible "Verify independently" section to the verify page with a copy-to-clipboard npx command for the existing @w-r-l/verify CLI tool?

## Key Design Decisions

1. **Show on both verified AND failed pages** -- Independent verification is MORE valuable on failure (disambiguates server issue vs. tampering). Do NOT show in error state (API call failure). Resolved in favor of ux-strategy-minion over ux-design-minion's verified-only position.

2. **New standalone `<details>` after "Cryptographic details"** -- Not nested inside crypto details. Each disclosure covers a single concern. This sits at the bottom of the information specificity gradient.

3. **"Verify independently" as summary text** -- Communicates benefit (independence from server verdict), not mechanism (CLI). Alternatives rejected: "Verify offline" (inaccurate), "Run your own check" (too casual).

4. **Brief explanatory text inside disclosure** -- One sentence: the CLI validates the timestamp certificate chain against a trusted root, which cannot be done in the browser. Gives technical users a reason to act.

5. **Ghost copy button, icon swap feedback, aria-live region** -- 44x44px touch target, clipboard icon to checkmark for 2s, dedicated `<span aria-live="polite" role="status">` for screen reader feedback. Clipboard API fallback: programmatic text selection.

## Phases

### Phase 1: Meta-Plan
Identified 4 specialists: ux-design-minion (visual treatment, placement), security-minion (command injection, clipboard API), accessibility-minion (ARIA, screen reader feedback), ux-strategy-minion (trust journey, show on failure?).

### Phase 2: Specialist Planning
All 4 consulted in parallel. One conflict emerged: ux-design-minion (verified-only) vs. ux-strategy-minion (always-show). All other positions aligned.

### Phase 3: Synthesis
Conflict resolved in favor of always-show based on trust model analysis. Three minor reconciliations: touch target (44px exceeds 24px minimum), status timing (visual 2s, sr-only 3s), all else aligned.

### Phases 3.5-8
Skipped (advisory-only orchestration).

## Agent Contributions

| Agent | Phase | Verdict |
|-------|-------|---------|
| ux-design-minion | planning | Standalone `<details>`, ghost copy button, code block styling |
| security-minion | planning | Clean security profile, no injection risk, textContent only |
| accessibility-minion | planning | aria-live region in initial template, no custom ARIA on details |
| ux-strategy-minion | planning | Strong yes, show on failure too, "Verify independently" text |

## Team Recommendation

### Executive Summary

Add a collapsible "Verify independently" section to the verify page. The `@w-r-l/verify` CLI tool already exists and performs full cryptographic verification including timestamp chain validation -- something the page explicitly says it cannot do. Surfacing it behind a `<details>` disclosure costs zero cognitive load for casual users while closing the trust gap for technical users.

### Implementation Spec

**Placement**: New `<details>` after "Cryptographic details" disclosure, before footer.

**Visibility**: Render when `verified !== undefined` (both true and false). Do NOT render in error state.

**Summary text**: "Verify independently"

**Body content**:
- 1-2 sentence explanation: "Run the verification yourself, including full timestamp certificate chain validation. Requires Node.js 20+."
- Pre-populated command in monospace code block: `npx @w-r-l/verify {origin}/v1/captures/{captureId}`
- Ghost copy button (clipboard icon, top-right of code block)

**Copy interaction**:
- Click: `navigator.clipboard.writeText(command)`
- Success: Icon swaps to checkmark (2s), sr-only status "Command copied to clipboard" (clears at 3s)
- Failure: Programmatic text selection, sr-only status "Could not copy. Select and copy manually."

**Accessibility requirements**:
- Native `<button type="button">` with `aria-label="Copy command to clipboard"`
- SVG icon `aria-hidden="true"`
- `<span class="sr-only" aria-live="polite" role="status">` in initial template (not injected)
- `:focus-visible` outline matching existing page style
- 44x44px effective touch target
- No custom ARIA on `<details>` element

**Security requirements**:
- Render command via `textContent`, never `innerHTML`
- No CSP changes needed

**Estimated scope**: ~80 lines added to `src/verify-page.js`. No new files, no dependencies, no server changes.

### Risks

1. Command rot if `@w-r-l/verify` is renamed or unpublished (construct package name in one place)
2. Node.js 20+ prerequisite limits audience (acceptable: target audience has Node.js)
3. Long command wraps on narrow viewports (test at 320px)
4. Corporate clipboard policies may block API (graceful fallback handles this)

### Conflict Resolution

Verified-only vs. always-show: Resolved in favor of always-show. Independent verification has highest value on failure pages -- it disambiguates "server-side issue" from "actual tampering." The explanatory text addresses any confusion about the relationship between page and CLI checks.

## Working Files

[2026-03-17-090001-verify-page-npx-copy-command/](./2026-03-17-090001-verify-page-npx-copy-command/)

| File | Description |
|------|-------------|
| prompt.md | Original task description |
| phase1-metaplan.md | Meta-plan: specialist selection and planning questions |
| phase2-ux-design-minion.md | Visual treatment, placement, interaction design |
| phase2-security-minion.md | Command injection analysis, clipboard API, CSP compatibility |
| phase2-accessibility-minion.md | ARIA markup, screen reader feedback, WCAG compliance |
| phase2-ux-strategy-minion.md | Trust journey analysis, show-on-failure rationale |
| phase3-synthesis.md | Advisory synthesis with full recommendation |
