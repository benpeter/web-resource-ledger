MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
Batch of three small UI fixes shipped as a single phase.

## Fix 1 — Auto-prepend https:// (#179)

The captures UI URL input field automatically prepends `https://` when a user enters a bare hostname (e.g., `example.com` → `https://example.com`). Entries that already have `http://` or `https://` are left unchanged. Partial schemes like `htt://` are not "fixed".

## Fix 2 — Verify page German text (#180)

All eIDAS references on the verify page use "Article" instead of the German abbreviation "Art." (e.g., "Article 42" not "Art. 42"). Check both the verify page HTML template (`src/verify-page.js`) and the `@w-r-l/verify` CLI formatter (`packages/verify/lib/format.js`).

## Fix 3 — Billing page spacing (#183)

Add visible spacing between numeric count values and their unit labels on the billing page (e.g., "14 Captures" not "14Captures"). CSS or template fix.

## Success criteria

- Entering `example.com` in capture URL field submits `https://example.com`
- Entering `https://example.com` or `http://example.com` is unchanged
- All "Art." references on verify page replaced with "Article"
- Billing page shows space between numbers and units
- No regressions on other pages
- Existing tests pass; add/update tests for URL prepend logic

## Scope

- **In**: UI URL input normalization, verify page text, billing page CSS
- **Out**: API-level URL normalization, i18n infrastructure, billing logic changes

Closes #179, closes #180, closes #183
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/iridescent-purring-lagoon

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan
(see your Core Knowledge for the output format).

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Ua2lf1/ui-fixes-url-prepend-verify-text-billing-spacing/phase1-metaplan.md`
