MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
**Outcome**: The landing page presents legal/compliance claims and the "how this works" section in the most effective order, ensuring legal claims are prominent enough to build trust without overwhelming the initial impression.

**Success criteria**:
- Decision documented on whether legal claims belong in hero banner or below
- Decision documented on whether "how this works" should move below other sections
- Changes implemented if warranted
- Landing page still passes Lighthouse performance and accessibility checks

**Scope**:
- In: Hero banner content, legal/compliance claims placement, "how this works" section position relative to other sections
- Out: Copy rewrites, new sections, mobile-specific layout changes, SEO metadata
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/silly-kindling-jellyfish

## Current Landing Page Structure
The landing page (landing/public/index.html) currently has this section order:
1. Hero: "Web evidence you can prove." + tagline about signed/timestamped evidence
2. How It Works (3 steps: Capture, Sign, Verify)
3. Use Cases (Legal Evidence with FRE/eIDAS claims, Compliance, AI Agent, Journalism)
4. Pricing

Legal/compliance claims (FRE 901(b)(9), FRE 902(14), eIDAS Art. 41(2)) are currently in the Use Cases section under the "Legal Evidence" card.

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
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0wHqHc/landing-legal-claims-section-ordering/phase1-metaplan.md
