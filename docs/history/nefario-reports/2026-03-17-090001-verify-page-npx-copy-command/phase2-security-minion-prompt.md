You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise.

## Project Task
Should we add a collapsible "Verify independently" section to the verify page with a copy-to-clipboard npx command for the existing @w-r-l/verify CLI tool?

## Advisory Context
Advisory-only orchestration. Focus on analysis, trade-offs, and recommendations.

## Your Planning Question
Is there a terminal command injection risk from constructing the npx command with the captureId? The captureId format is `cap_[a-f0-9]{32}` -- is that safe to embed in a shell command that users will paste into their terminal? What about the origin URL? What's the security model for the Clipboard API in this CSP context?

## Context
Read these files:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/verify-page.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/index.js (for captureId validation)

Key facts:
- captureId is validated server-side before rendering the page (must match `cap_[a-f0-9]{32}`)
- origin is the server's own origin (not user-controlled)
- The page CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
- The Clipboard API (navigator.clipboard.writeText) requires secure context (HTTPS)
- The page currently uses textContent for all user-controlled data (XSS-safe)
- The command would be: `npx @w-r-l/verify https://{origin}/v1/captures/{captureId}`

## Instructions
1. Read relevant files to assess the security surface
2. Evaluate command injection, XSS, and clipboard API risks
3. Recommend mitigations if any
4. Write your contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-zdnDkL/verify-page-npx-copy-command/phase2-security-minion.md`
