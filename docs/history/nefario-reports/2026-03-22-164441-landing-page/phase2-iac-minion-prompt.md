You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a static landing page for WRL (Web Resource Ledger) at webresourceledger.com. Plain HTML/CSS, no JS frameworks. Uses the WRL brand design system. Deployed on Cloudflare Pages.

## Your Planning Question
Cloudflare Pages vs Workers Static Assets vs docs-site integration? The docs site uses Workers Static Assets with 11ty builds (site/wrangler.toml). The landing page is a single HTML/CSS file with no build step. Which approach minimizes operational complexity for a static page at the root domain? Consider:
- The docs site already has site/wrangler.toml with `[assets] directory = "./_output"` and custom domain docs.webresourceledger.com
- The landing page needs to be at webresourceledger.com (apex domain)
- Need a GitHub Actions workflow for deploy-on-push-to-main
- The design-system.css lives at src/design-system.css and needs to be available to the landing page
- The logo SVG is at site/assets/logo-w-check.svg

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/gleaming-noodling-quokka
- Read site/wrangler.toml to see the docs site deployment config
- Read .github/workflows/deploy-docs.yml to see existing CI/CD patterns
- Read wrangler.toml (root) to see the main Worker config
- The project uses plain JS (not TS), no build tools beyond 11ty for docs

## Instructions
1. Read relevant files to understand the current deployment state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: iac-minion

### Recommendations
<your expert recommendations for deployment architecture>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None")

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase2-iac-minion.md
