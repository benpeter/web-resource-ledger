MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

The "Sign in" button in the landing page header (`landing/public/index.html`, line 95) has unreadable text. The text renders as dark gray on a dark navy background — roughly 2.5:1 contrast ratio, well below WCAG AA 4.5:1.

This is NOT the same button that was investigated in #211 / phase 0080. That analysis looked at `.btn--github` inside the app UI (`src/ui/ui-login.js`). This button is a different element in a different codebase.

### Where to look
- **Element**: `<a href="..." class="btn btn--primary btn--sm">Sign in</a>` inside `<nav>` inside `.site-header`
- **File**: `landing/public/index.html` (line 95), also present in `privacy.html`, `security.html`, `terms.html`, `refund-policy.html`, `content-policy.html`, `404.html`
- **Styles involved**:
  - `landing/public/css/landing.css:167` — `.site-header nav a` sets `color: var(--color-text-muted)`
  - `landing/public/css/design-system.css:83` — `.btn--primary` sets `color: var(--color-primary-text)`
  - The nav link color wins over the button color, so the button text is muted instead of white

### What "done" looks like
The "Sign in" button in the landing page header has white (or near-white) text on the dark primary background, matching how `.btn--primary` looks everywhere else. All landing pages affected. No visual change to the other nav links (How It Works, Use Cases, Pricing, Docs).

### Verification
Open any landing page (index, privacy, terms, etc.) and confirm the Sign in button text is clearly legible against its dark background.

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/magical-sparking-snowglobe

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
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i0tewf/sign-in-button-contrast-fix/phase1-metaplan.md`
