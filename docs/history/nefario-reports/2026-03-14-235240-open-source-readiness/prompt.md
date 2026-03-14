Execute the open-source readiness plan (phase 0012) for web-resource-ledger. This was planned with lucy, devx-minion, software-docs-minion, and margo — the plan is at `.claude/plans/twinkling-shimmying-gosling.md`.

**Outcome**: The repo meets baseline open-source hygiene standards so outside contributors can find, understand, and safely contribute to the project.

**Steps 1–8 only** (Step 9 is folded into #16, Step 10 is manual post-merge):

1. Fix `.gitignore` — add `.DS_Store`, `*.log`, `.env`, `.vscode/`, `.idea/`; clean existing `.DS_Store` files
2. Fix `LICENSE` — fill in `[yyyy]` and `[name of copyright owner]` placeholders in the Apache 2.0 appendix
3. `package.json` metadata — add `description`, `license` ("Apache-2.0"), `repository`, `author`, `engines` (>=18)
4. Create `.nvmrc` with `18`
5. Create `.github/workflows/ci.yml` — minimal: checkout, setup-node (from .nvmrc), npm ci, npm test, npm run lint:api. No matrix, no coverage, no deploy.
6. Create `CONTRIBUTING.md` — short, practical. Prerequisites, local setup (tests are self-contained via Miniflare), dev server needs .dev.vars + Workers Paid for Browser Rendering, PR expectations, vanilla JS by design, links to backlog and evolution log.
7. Create `SECURITY.md` — supported versions (latest on main), report via GitHub Security Advisories, no bug bounty/SLAs.
8. Create `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1.

**Constraints**:
- Follow CLAUDE.md evolution log requirements (create `docs/evolution/0012-open-source-readiness/`)
- Margo-approved scope only — no ESLint, no Dependabot, no issue/PR templates, no CODEOWNERS, no release automation
- Single PR against `main`
