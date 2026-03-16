MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task

Switch navigation wait strategy from networkidle to load + settle delay.

Captures complete reliably for ad-heavy sites (tagesschau.de, adobe.com) that visually load in 2-3s but whose tracking scripts keep network connections alive indefinitely. Currently `page.goto()` uses `waitUntil: 'networkidle'` which burns 20s of the 30s `ctx.waitUntil` budget waiting for network silence that never comes, leaving the partial capture fallback too little time to succeed (tall page screenshots exceed the 2s deadline, cold browser sessions push total time past 30s).

### Success criteria
- tagesschau.de and adobe.com captures complete successfully (not timeout/pending)
- Navigation phase completes in under 10s for typical sites (currently 20s+)
- Sufficient time budget remains for consent dismissal (8s), screenshots, WACZ building, and R2/KV writes
- All existing tests pass
- Staged fallback from #53 remains functional as safety net for pages that don't reach the load event
- NAV_TIMEOUT_MS restored to 25s (or justified if kept at 20s)

### Scope
**In:** `page.goto()` wait strategy in `defaultRenderer()`, settle delay after load event, NAV_TIMEOUT_MS value, related test assertions

**Out:** Consent dismissal logic, WACZ/signing pipeline, partial capture fallback rewrite, general capture parameterization

### Constraints
- Use `waitUntil: 'load'` with a post-load settle delay (~3s) to allow late-rendering JS to complete
- Must fit within the 30s `ctx.waitUntil` hard limit including all downstream work

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/load-settle-strategy

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-SJRIzw/load-settle-strategy/phase1-metaplan.md

## Key Codebase Context

The main file to change is `src/capture.js`, specifically:
- Line 84: `const NAV_TIMEOUT_MS = 20000;` (needs to be 25000 per issue)
- Line 403: `await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle' });` (change to 'load' + settle delay)
- Line 482: `waitUntilReached: 'networkidle'` in render metadata (update to 'load')
- The partial capture fallback (lines 404-452) catches TimeoutError and must continue working

Test file: `test/capture.test.js` and `test/fixtures.js` have several renderers that reference 'networkidle' in waitUntilReached field.

This is a focused change -- about 3 constants and the goto call, plus test assertions.
