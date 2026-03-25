MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task

<github-issue>
## UI/UX fixes batch

Small fixes that individually don't warrant a full phase session.

### 1. Fix low-contrast Sign In button (#211)
The Sign In button text doesn't meet WCAG AA contrast ratio (4.5:1). Fix the text or background color.

### 2. Billing section shows duplicate/conflicting status (#190)
Billing section shows both "Status: Pending" and "Status: Active" simultaneously. Only one status should display. Likely in `src/ui/ui-billing.js`.

### 3. Add documentation link to the logged-in application UI (#210)
Add a visible link to docs.webresourceledger.com in the authenticated UI (header/nav/footer). Opens in new tab.

### 4. Notify operator when new tenant API keys are created (#200)
When a new API key is created via the admin API, fire a notification (email via Resend or Coralogix log alert) with tenant ID, key name, scopes, and timestamp. Fire-and-forget -- must not block key creation.

## Constraints
- Match existing design system
- All existing tests must pass
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/curious-singing-ullman

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase1-metaplan.md
