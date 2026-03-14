---
reviewer: code-review-minion
phase: 0012-open-source-readiness
date: 2026-03-14
---

VERDICT: ADVISE

FINDINGS:

- [ADVISE] docs/evolution/0012-open-source-readiness/outcome.md:8 -- Script name mismatch. outcome.md says CI runs `npm run lint:openapi`, but the actual script in package.json and ci.yml is `lint:api`. This is a documentation error, not a runtime error, but it will mislead anyone who reads the outcome log and tries to reproduce the CI step.
  FIX: Change `lint:openapi` to `lint:api` in outcome.md line 8.

- [ADVISE] package.json -- outcome.md line 17 claims `bugs` and `homepage` fields were added, but neither field is present in package.json. The outcome log describes work that was not done.
  FIX: Either add the missing fields to package.json:
    `"bugs": "https://github.com/benpeter/web-resource-ledger/issues"`
    `"homepage": "https://github.com/benpeter/web-resource-ledger#readme"`
  or correct outcome.md to remove the reference to those fields.

- [ADVISE] .gitignore:1 -- `CLAUDE.local.md` is listed as the first entry in .gitignore. This is functionally correct but the placement is unexpected -- it predates this phase and is project-specific. The new entries (OS files, editor config, logs, env) are added below it without a comment separating old from new. Not a bug, but a future maintainer may be confused by the leading entry.
  FIX: Add a comment before the new block to separate concerns, e.g., `# Added in 0012-open-source-readiness`. This is a nit; the file works as-is.

- [NIT] .gitignore -- `Thumbs.db` is mentioned in outcome.md ("added OS artifacts (.DS_Store, Thumbs.db)") but is absent from the actual file. `.DS_Store` is present. The omission is harmless on macOS-only teams but outcome.md is inaccurate.
  FIX: Either add `Thumbs.db` to .gitignore or remove the reference from outcome.md. Given the project's macOS bias, dropping it from the outcome description is the simpler fix.

- [NIT] ci.yml:18 -- `actions/setup-node` is pinned to SHA `49933ea5288caeca8642d1e84afbd3f7d6820020` with comment `# v4.4.0`. SHA verification confirms this resolves correctly to the v4.4.0 tag. No issue with the pin itself. Noting for the record that this tag is quite recent (2025) and Dependabot is deferred by design per decisions.md -- the residual maintenance risk is acknowledged and documented.
  FIX: No action required. Dependabot is the correct long-term mitigation, already flagged in decisions.md.

- [NIT] .gitignore:24 -- `.env.*` pattern catches `.env.local`, `.env.production`, etc., which is correct. However, `.dev.vars` (Wrangler's local secrets file) is listed separately on line 10, which is correct since it would not match `.env.*`. The file is internally consistent. No issue.
  FIX: None required.

## Summary

Two ADVISE findings require resolution before merge: a script name discrepancy in the outcome log (`lint:openapi` vs `lint:api`) and missing `bugs`/`homepage` fields that outcome.md claims were added. Both are documentation-vs-reality gaps rather than runtime bugs. The CI workflow itself is correct: SHA pins are verified against authoritative tag SHAs, permissions are minimal (`contents: read`), the job timeout is set, and the workflow triggers are appropriate. CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, and LICENSE are all substantively correct and consistent with each other.
