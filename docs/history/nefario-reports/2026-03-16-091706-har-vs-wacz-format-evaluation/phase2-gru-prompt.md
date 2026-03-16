You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed into a team recommendation, not an execution plan. Focus on analysis, trade-offs, and recommendations rather than implementation tasks.

## Project Task
Should WRL switch its archive format from WACZ to HAR? Is it already taking advantage of Playwright's HAR recording capabilities?

## Your Planning Question
Compare HAR and WACZ/WARC as web archive formats for an evidence-grade capture system. Evaluate:

(a) HAR spec maturity and legal standing vs WACZ's legal pedigree (Harvard LIL, Library of Congress, Starling Lab)
(b) Whether HAR is a replacement for or complement to WARC/WACZ
(c) The @cloudflare/playwright `recordHar()` API — what it captures (full request/response bodies, timing, headers) vs what WRL currently captures (screenshot, rendered HTML, separate fetch headers)
(d) Ecosystem tooling for each format
(e) Whether a hybrid approach (use Playwright HAR recording to capture richer network data, then embed that data into WARC records within the existing WACZ container) would be architecturally sound

Consider that WRL's "Full HTTP exchange capture" and "Resource manifest" are both in the Dropped Items section of the backlog — would HAR recording be a lightweight way to get partial credit on those capabilities without the complexity that caused them to be dropped?

## Context
Read these files:
- `src/capture.js` -- current pipeline (especially defaultRenderer and context.route)
- `src/wacz.js` and `src/warc.js` -- current bundling
- `docs/backlog.md` -- dropped items section (Full HTTP exchange capture, Sub-resource archiving, Resource manifest)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Return your contribution with Recommendations, Proposed Tasks, Risks and Concerns, Additional Agents Needed
4. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-D6WP0B/har-vs-wacz-format-evaluation/phase2-gru.md`
