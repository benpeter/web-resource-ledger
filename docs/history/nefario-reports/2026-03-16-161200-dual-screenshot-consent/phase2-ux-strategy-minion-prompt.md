You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Issue #58: Dual-screenshot cookie consent dismissal for captures. Add dual screenshots to the verification page.

## Your Planning Question
How should the verification page present dual screenshots to maximize evidence value?
1. Both screenshots always visible side by side, or after-screenshot primary with before in a toggle/accordion?
2. How to communicate consent dismissal status to non-technical verifiers? What labels, what language?
3. When autoconsent fails (single screenshot), should the UI indicate a degraded capture, or present it normally with a note?
4. What about backward compatibility: pre-feature captures have one screenshot and no captureSettings -- the page must handle this gracefully.
5. Evidence positioning: the dual screenshot is evidence that (a) a banner existed and (b) what the page looks like underneath. How to frame this for verifiers?

## Context
Key files to read:
- `src/verify-page.js` -- current verification page, screenshot display, check list rendering
- The project's evidence-first positioning: WRL is an evidence tool, not a screenshot API

## Instructions
1. Read the verification page source
2. Design the UX for dual screenshot presentation
3. Consider both technical and non-technical audiences
4. Return your contribution in structured format
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-ux-strategy-minion.md`
