MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Combined task from GitHub issues #36 and #52. Both touch logging in capture.js.

### Issue #36: R6: Hashed IP logging for abuse correlation

Outcome: Brute-force correlation and abuse detection are possible without storing raw IP addresses, maintaining GDPR compatibility.

Success criteria:
- All log entries include HMAC-SHA256 hash of CF-Connecting-IP instead of raw IP
- Hash key rotates daily (derived from date + secret seed)
- Same IP within same day produces same hash (enables correlation)
- Different days produce different hashes (limits tracking window)
- Existing Coralogix log structure preserved (new field, not replacement)

Scope:
- In: HMAC function, daily key derivation from secret seed, integration into existing structured log entries, tests
- Out: IP geolocation, rate limiting changes, Coralogix dashboard updates

### Issue #52: fix: categorizeError swallows actual Playwright error messages

Problem: When concurrent captures exhaust the browser session pool, categorizeError() in src/capture.js doesn't match the actual error thrown by Cloudflare Playwright. The error falls through to the generic catch-all. The actual error message from Playwright is lost in Coralogix logs.

Fix:
1. Log the raw error.message and error.name in the capture.stage.fail event (alongside the categorized message)
2. Add error patterns to categorizeError() for common Playwright session errors
3. Consider logging error.message in the catch-all path too

Scope:
- src/capture.js: categorizeError() + log calls
- test/capture.test.js: add test cases for new error patterns

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/r6-hashed-ip-logging

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
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in structured format
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-5tespU/hashed-ip-logging/phase1-metaplan.md
