You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Execute the open-source readiness plan (phase 0012) for web-resource-ledger.

**Outcome**: The repo meets baseline open-source hygiene standards so outside contributors can find, understand, and safely contribute to the project.

Steps 1-8 as specified (gitignore, license, package.json metadata, .nvmrc, CI workflow, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md).

Constraints: Margo-approved scope only — no ESLint, no Dependabot, no issue/PR templates, no CODEOWNERS, no release automation.

## Your Planning Question
The project uses `@cloudflare/vitest-pool-workers` (v0.12.21) which runs tests inside a Miniflare workerd environment. The CI step is: checkout → setup-node (from .nvmrc, Node 18) → npm ci → npm test → npm run lint:api.

1. Are there GitHub Actions runner constraints or special Node flags needed for `@cloudflare/vitest-pool-workers`? Does it need specific OS, memory, or permissions?
2. The `lint:api` script runs `redocly lint openapi.yaml` — any CI-specific considerations?
3. Should the workflow pin to a specific runner image (e.g., `ubuntu-latest` vs `ubuntu-24.04`)?
4. Any timeout adjustments needed for Miniflare startup?

## Context
- package.json uses `"type": "module"` and vitest 3.2.4
- wrangler 4.73.0 is a devDependency
- No existing CI configuration
- .nvmrc will contain `18`

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the structured format below
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-2Ir2JF/open-source-readiness/phase2-iac-minion.md`

## Domain Plan Contribution: iac-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks, deliverables, dependencies>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved, or "None">
