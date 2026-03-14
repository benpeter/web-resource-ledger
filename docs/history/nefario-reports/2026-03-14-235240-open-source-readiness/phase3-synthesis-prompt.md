MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
Execute the open-source readiness plan (phase 0012) for web-resource-ledger.

**Outcome**: The repo meets baseline open-source hygiene standards so outside contributors can find, understand, and safely contribute to the project.

**Steps 1-8 only**:

1. Fix `.gitignore` — add `.DS_Store`, `*.log`, `.env`, `.vscode/`, `.idea/`; clean existing `.DS_Store` files
2. Fix `LICENSE` — fill in `[yyyy]` and `[name of copyright owner]` placeholders in the Apache 2.0 appendix
3. `package.json` metadata — add `description`, `license` ("Apache-2.0"), `repository`, `author`, `engines` (>=18 — NOTE: iac-minion found this must be >=20 due to Wrangler 4.73.0)
4. Create `.nvmrc` with `18` — NOTE: iac-minion found this must be `22` (LTS) due to Wrangler 4.73.0 requiring >=20
5. Create `.github/workflows/ci.yml` — minimal: checkout, setup-node (from .nvmrc), npm ci, npm test, npm run lint:api. No matrix, no coverage, no deploy.
6. Create `CONTRIBUTING.md` — short, practical. Prerequisites, local setup, PR expectations, vanilla JS by design, links to backlog and evolution log.
7. Create `SECURITY.md` — supported versions (latest on main), report via GitHub Security Advisories, no bug bounty/SLAs.
8. Create `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1.

**Constraints**:
- Follow CLAUDE.md evolution log requirements (create `docs/evolution/0012-open-source-readiness/`)
- Margo-approved scope only — no ESLint, no Dependabot, no issue/PR templates, no CODEOWNERS, no release automation
- Single PR against `main`

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-2Ir2JF/open-source-readiness/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-2Ir2JF/open-source-readiness/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-2Ir2JF/open-source-readiness/phase2-software-docs-minion.md

## Key consensus across specialists:

**iac-minion**: Node 18 won't work — Wrangler 4.73.0 requires >=20, .nvmrc should be `22` (current LTS). No special CI runner needs. ubuntu-latest, timeout-minutes: 10. Redocly lint is trivial.

**devx-minion**: Two-tier CONTRIBUTING structure (quick-start without Cloudflare account, full dev with Cloudflare Paid). Vanilla JS stated directly — name frameworks that will be declined. lint:api conditional (only if changing API). Link evolution log/backlog as context, not contribution requirements.

**software-docs-minion**: SECURITY.md uses "goals not guarantees" tone with 72h/7d targets. Evolution log is NOT a contributor requirement. Contributor Covenant v2.1 verbatim. CONTRIBUTING is the hub document that links outward. SECURITY and CODE_OF_CONDUCT are self-contained.

## Conflict Resolution Needed
- Original plan says Node 18 / engines >=18. iac-minion says Node 22 / engines >=20. This must be resolved in favor of iac-minion's finding (Wrangler 4.73.0 requires it).

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve the Node version conflict (favor iac-minion's finding)
3. Incorporate all specialist recommendations into task prompts
4. Create the final execution plan in structured format
5. Each task needs a complete, self-contained prompt
6. All 8 steps can be executed in a single batch (no dependencies between them) EXCEPT the evolution log which depends on knowing what was produced
7. Use a SINGLE execution agent for all 8 steps — these are small file edits/creates that one agent can handle efficiently. The evolution log entry is a separate task.
8. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-2Ir2JF/open-source-readiness/phase3-synthesis.md`
