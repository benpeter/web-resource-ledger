You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise.

## Project Task
Should we add a collapsible "Verify independently" section to the verify page with a copy-to-clipboard npx command for the existing @w-r-l/verify CLI tool?

## Advisory Context
Advisory-only orchestration. Focus on analysis, trade-offs, and recommendations.

## Your Planning Question
Where exactly should this section go in the page layout? What's the right visual treatment for the code block and copy button? How should the copy-to-clipboard interaction work (icon placement, feedback on copy success)?

## Context
Read the verify page source:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/verify-page.js

Current page layout (top to bottom):
1. Status banner (verified/unverified) -- green/red, primary trust signal
2. Capture metadata section (URL, date)
3. Verification checks list (pass/fail/skip for each of 4 checks)
4. Screenshot section (with before/after consent)
5. "Capture details" `<details>` disclosure
6. "Cryptographic details" `<details>` disclosure (bundle hash, signed at, public key URL, TSA)
7. Footer (Terms, Report Abuse)

The proposed feature:
- A new `<details>` section (or nested inside existing crypto details)
- When expanded, shows: `npx @w-r-l/verify https://{origin}/v1/captures/{captureId}`
- A copy icon/button that copies the command to clipboard
- The command is pre-filled with the actual capture URL (origin and captureId are already JS variables in scope)

Design constraints:
- Vanilla JS/CSS only (no frameworks, no build step)
- Must not clutter the page for casual users (95%+ just want the green checkmark)
- The page currently uses monospace font for crypto values (SF Mono, Fira Code, Menlo, Consolas)
- Existing disclosure sections use `<details><summary>` pattern
- Page is responsive (mobile breakpoint at 640px)

## Instructions
1. Read the verify page source to understand existing patterns
2. Recommend placement, visual treatment, and interaction design
3. Identify risks from your domain perspective
4. Write your contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-zdnDkL/verify-page-npx-copy-command/phase2-ux-design-minion.md`
