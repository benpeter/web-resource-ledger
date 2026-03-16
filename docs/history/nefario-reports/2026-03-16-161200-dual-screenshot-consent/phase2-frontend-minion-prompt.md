You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Issue #58: Dual-screenshot cookie consent dismissal for captures. Integrate @duckduckgo/autoconsent into the Playwright capture pipeline to produce two screenshots per capture: before (with cookie banner) and after (post-dismissal).

## Your Planning Question
How should `@duckduckgo/autoconsent` be integrated into the Playwright capture pipeline within `defaultRenderer()`? Specifically:
1. Which export/bundle path gives the minimal footprint? The unpacked package is ~27MB but the issue references 168KB -- what is the correct import for use in Cloudflare Workers?
2. What integration pattern: `addInitScript()`, `exposeBinding()`, or `page.evaluate()` post-navigation? Consider timing: the library needs to detect CMPs after page load.
3. How to detect dismiss success vs. no CMP detected vs. failure? What does the library return?
4. Expected latency overhead within the 30s ctx.waitUntil budget?
5. Should the library be loaded at the page level or context level?

## Context
Key files to read:
- `src/capture.js` -- current renderer, 30s budget, viewport 1280x720, networkidle wait
- `package.json` -- current deps
- Security constraint #1: No caller-supplied JS execution (autoconsent is server-controlled, not caller-supplied)
- The capture uses `@cloudflare/playwright` on Cloudflare Workers with Browser Rendering

## Instructions
1. Read `src/capture.js` and `package.json`
2. Research the `@duckduckgo/autoconsent` package structure and API
3. Design the integration approach with concrete code patterns
4. Estimate timing impact on the 30s budget
5. Return your contribution in structured format
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-frontend-minion.md`
