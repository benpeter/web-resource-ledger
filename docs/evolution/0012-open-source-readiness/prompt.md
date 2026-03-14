# Phase 0012 Prompt: Open-Source Readiness

## Task Briefing

Execute the open-source readiness plan -- make the repo ready for outside contributors.

## Scope (8 steps)

1. **.gitignore** -- add OS, editor, log, and env patterns
2. **LICENSE** -- fill in copyright holder and year
3. **package.json metadata** -- add description, author, repository, bugs, homepage fields
4. **.nvmrc** -- pin the Node version used for development
5. **CI workflow** -- GitHub Actions running tests and API linting on push/PR
6. **CONTRIBUTING.md** -- contributor guide covering setup, testing, and contribution process
7. **SECURITY.md** -- vulnerability disclosure policy and response targets
8. **CODE_OF_CONDUCT.md** -- Contributor Covenant v2.1

## Scope Boundary (Margo-approved)

Explicitly out of scope for this phase:
- ESLint / linting configuration
- Dependabot
- Issue and PR templates
- CODEOWNERS
- Release automation

No work outside these 8 steps was to be done.
