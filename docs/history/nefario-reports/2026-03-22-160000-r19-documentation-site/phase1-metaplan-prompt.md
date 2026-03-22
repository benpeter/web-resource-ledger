MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
**Outcome**: A static documentation site deployed on Cloudflare Pages at a custom docs subdomain, providing comprehensive guides for all WRL features. The site is generated from the repo's existing openapi.yaml and markdown content, styled with the WRL brand design system, and automatically deployed on push to main.

**Success criteria**:
- Getting Started guide walks a new user from API key to first verified capture in under 5 minutes
- API reference is generated from openapi.yaml (not hand-written) and stays in sync via CI
- Auth guide covers per-tenant API keys, admin keys, scopes, and the legacy single-key mode
- Verification guide explains the cryptographic chain: Ed25519 signature, RFC 3161 timestamp, WACZ bundle structure, and `npx @w-r-l/verify` usage
- MCP guide documents the MCP server tool interface, setup, and example agent workflows
- Batch guide covers the batch capture endpoint request/response format and polling pattern
- Site uses the WRL brand design system (colors, typography, layout)
- Custom domain configured (e.g., docs.wrl.example.com) with HTTPS
- Lighthouse accessibility score >= 90
- Build and deploy runs in Cloudflare Pages CI on push to main

**Scope**:
- In: Static site generator (11ty or plain HTML), content pages listed above, openapi.yaml rendering, Cloudflare Pages deployment, custom domain DNS
- Out: Interactive API explorer (Swagger UI), user authentication on the docs site, search functionality (can be added later), localization

**Constraints**:
- Depends on R15 (MCP server) and R18 (batch endpoint) being implemented so those guides reflect real behavior
- openapi.yaml is the single source of truth for API reference -- no manual endpoint docs
- Must not introduce a JS framework; 11ty or plain HTML only
- Brand design system (BRAND phase) should be available before this ships
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/streamed-cuddling-hoare

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
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase1-metaplan.md`
