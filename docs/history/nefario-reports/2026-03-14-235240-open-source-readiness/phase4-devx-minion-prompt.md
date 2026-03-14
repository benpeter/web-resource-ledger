You are implementing all 8 steps of the open-source readiness plan for web-resource-ledger, a Cloudflare Workers project that captures and archives web resources as cryptographically signed WACZ bundles.

The repo is at `/Users/ben/github/benpeter/web-resource-ledger`. You are on branch `nefario/open-source-readiness`.

## Step 1: Fix .gitignore

Current `.gitignore` contents:
```
CLAUDE.local.md

# Dependencies
node_modules/

# Wrangler local state
.wrangler/

# Local secrets
.dev.vars
```

Add these entries (grouped with comments):
```
# OS files
.DS_Store

# Editor config
.vscode/
.idea/

# Logs
*.log

# Environment
.env
.env.*
```

**Advisory [security]**: Include `.env.*` alongside `.env` to catch `.env.local`, `.env.production`, and other env variants.

Then remove the three tracked `.DS_Store` files from git tracking (without deleting them from disk):
```bash
git rm --cached .DS_Store docs/.DS_Store docs/evolution/.DS_Store
```

## Step 2: Fix LICENSE

The LICENSE file has Apache 2.0 with placeholder text in the appendix (line 189):
```
Copyright [yyyy] [name of copyright owner]
```

Replace with:
```
Copyright 2025 Ben Peter
```

Use 2025 because that is when the project was created (first commit). Do NOT change any other part of the LICENSE file.

## Step 3: package.json metadata

Add these fields to `/Users/ben/github/benpeter/web-resource-ledger/package.json`. Do not remove or change any existing fields.

```json
{
  "description": "Tamper-evident archival of web resources with cryptographic signing",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/benpeter/web-resource-ledger.git"
  },
  "author": "Ben Peter",
  "engines": {
    "node": ">=20.0.0"
  }
}
```

The `engines` field is `>=20.0.0` (not >=18) because wrangler 4.73.0 requires Node >=20.0.0.

## Step 4: Create .nvmrc

Create `/Users/ben/github/benpeter/web-resource-ledger/.nvmrc` with a single line:
```
22
```

This is Node 22 LTS (not 18) because wrangler 4.73.0 requires >=20, and Node 22 is the current LTS through October 2027.

## Step 5: Create CI workflow

Create `/Users/ben/github/benpeter/web-resource-ledger/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm test
      - run: npm run lint:api
```

Design decisions:
- Single job: splitting into parallel jobs adds ~30s overhead each; sequential steps are faster for this project size
- `cache: 'npm'`: built into actions/setup-node, keys on package-lock.json hash
- `permissions: contents: read`: principle of least privilege
- Actions pinned to full commit SHAs with version comments for security
- `timeout-minutes: 10`: prevents runaway jobs (default is 360 min)
- No matrix, no coverage, no deploy -- Margo-approved scope only

## Step 6: Create CONTRIBUTING.md

Create `/Users/ben/github/benpeter/web-resource-ledger/CONTRIBUTING.md`.

Target: under 150 lines of markdown, readable in under 5 minutes.

**Advisory [margo]**: If the document exceeds 150 lines, cut sections in this priority order: (1) "If You're Changing the API" first, (2) "How This Project Is Built" second. These are the least critical for a first-time contributor.

Structure (in this order):

### 1. Opening
One sentence: "Thank you for considering contributing to Web Resource Ledger."

### 2. Quick Start
**Advisory [devx]**: Include `nvm use` before `npm install`. Without it, a contributor on Node 18 gets a cryptic wrangler internals error.

```bash
git clone https://github.com/benpeter/web-resource-ledger.git
cd web-resource-ledger
nvm use
npm install
npm test
```
Emphasize: this works immediately, no accounts needed. The test suite is fully self-contained via Miniflare's simulated Workers runtime.

### 3. Full Local Development (optional)
Frame as optional. Requires:
- Cloudflare Workers Paid plan with Browser Rendering
- `.dev.vars` file with `SIGNING_KEY` and `CAPTURE_API_KEY`
- Then `npm run dev`

Keep this short -- the README already covers detailed Cloudflare setup.

### 4. Running Tests
Brief section covering key gotchas for contributors:
- Tests run in `@cloudflare/vitest-pool-workers`, not plain Node.js
- Import `SELF`, `env`, `fetchMock` from `cloudflare:test`, not from `vitest`
- `isolatedStorage: false` is deliberate -- do explicit cleanup in `beforeEach`
- Test signing keys are auto-generated at load time (no key setup needed)
- `fetchMock` required for tests with outbound HTTP calls (`activateFetchMock()` / `deactivate()` pattern)
- **Advisory [devx]**: Add consequence of leaked fetchMock -- a `fetchMock` that isn't deactivated after a test causes failures in unrelated tests, leading to 20+ minutes debugging in the wrong place.

Keep each gotcha to 1-2 sentences. Do not write a testing tutorial.

### 5. Design Philosophy
Direct paragraph:
> This project uses vanilla JavaScript with zero frontend frameworks. This is intentional -- not a gap waiting to be filled. PRs that introduce frameworks (React, Vue, Tailwind, jQuery, etc.) or transpilation steps (TypeScript, Babel) will be declined. If you think a dependency is warranted, open an issue first to discuss.

Link to the [Helix Manifesto](https://github.com/adobe/helix-home/blob/main/manifesto.md). Mention YAGNI and KISS as core principles.

### 6. Making Changes
- Branch from `main`
- Small, focused PRs
- Include tests for new features; regression tests for bug fixes
- Conventional commit messages (e.g., `feat:`, `fix:`, `chore:`)

### 7. If You're Changing the API
Short section: run `npm run lint:api` against `openapi.yaml`. CI runs this automatically, but catching issues locally saves time.

### 8. How This Project Is Built
**Advisory [devx]**: Lead with "docs/evolution/ contains design rationale for each development phase" -- AI orchestration as a subordinate detail, not the lead.

Brief explanation (3-4 sentences):
- `docs/evolution/` contains design rationale for each development phase -- including prompts, decisions, and outcomes
- The project uses AI agent orchestration as part of its build process
- The backlog at `docs/backlog.md` shows planned work and priorities
- You do NOT need to write evolution log entries -- maintainers handle that

### 9. Getting Help
Open a GitHub Issue for questions, bugs, or feature ideas. Link to `docs/backlog.md` with framing: "Check the backlog before starting a large contribution to see if it aligns with project direction." Do NOT say "pick an item from the backlog."

### 10. Footer links
- Security issues: see [SECURITY.md](SECURITY.md)
- Code of conduct: all contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md)
- License: contributions are licensed under [Apache 2.0](LICENSE)

## Step 7: Create SECURITY.md

Create `/Users/ben/github/benpeter/web-resource-ledger/SECURITY.md`.

Target: ~40 lines. Self-contained -- no outbound links to other community docs.

Structure:

### 1. Supported Versions
> Web Resource Ledger does not publish versioned releases yet. Security fixes are applied to the `main` branch. We recommend always running the latest commit on `main`.

### 2. Reporting a Vulnerability
> Please report security vulnerabilities through [GitHub Security Advisories](https://github.com/benpeter/web-resource-ledger/security/advisories/new). This creates a private discussion where we can assess the issue before any public disclosure.
>
> **Please do not open a public issue for security vulnerabilities.**

### 3. What to Expect
> We will acknowledge receipt of your report within 72 hours and aim to provide an initial assessment within 7 days. These are goals, not guarantees -- this is a small project maintained in spare time. We do take every report seriously.

Use "goals, not guarantees" framing. Do NOT say "no SLA". Do NOT mention bug bounties at all.

### 4. Scope
Brief list of what counts as a security issue (e.g., SSRF bypasses, authentication bypass, signature verification flaws, XSS) vs. a regular bug.

### 5. Disclosure
Coordinate with reporter before public disclosure. Credit reporter in the advisory unless they prefer anonymity.

## Step 8: Create CODE_OF_CONDUCT.md

Create `/Users/ben/github/benpeter/web-resource-ledger/CODE_OF_CONDUCT.md`.

Use Contributor Covenant v2.1 **verbatim**. The full text is available at https://www.contributor-covenant.org/version/2/1/code_of_conduct/

**Advisory [security]**: Do NOT route conduct enforcement through GHSA. GHSA is designed for security vulnerabilities, not conduct reports. Instead, use a separate private contact method.

The ONLY customization is in the Enforcement section. Replace the placeholder contact info with:

> Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the project maintainer at **ben@benpeter.com**.

Use a direct email contact, not GHSA. This keeps conduct reports and security reports in separate channels.

Do NOT add project-specific links to other community docs. The Contributor Covenant is self-contained by design.

## After All Steps

1. Run `npm test` to verify nothing is broken
2. Run `npm run lint:api` to verify Redocly linting still passes
3. Read all three community documents (CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md) sequentially to verify consistent tone: direct, respectful, no corporate boilerplate
4. Verify cross-references:
   - CONTRIBUTING.md links to SECURITY.md, CODE_OF_CONDUCT.md, LICENSE, docs/evolution/, docs/backlog.md, Helix Manifesto
   - SECURITY.md has no outbound links to other community docs
   - CODE_OF_CONDUCT.md has correct contact email
5. **Verify GitHub Actions SHAs** (Advisory [ux-strategy]): Check that the SHA for `actions/checkout` and `actions/setup-node` in ci.yml match their latest stable releases on GitHub. If outdated, update them. The format is `uses: org/repo@<full-40-char-sha> # vX.Y.Z`.
6. Create a single commit with all changes

## What NOT to Do
- Do NOT modify README.md (out of scope for this phase)
- Do NOT add ESLint, Dependabot, issue/PR templates, CODEOWNERS, or release automation
- Do NOT add matrix builds or coverage reporting to CI
- Do NOT add deployment steps or secrets to CI
- Do NOT mention CLAUDE.md in CONTRIBUTING.md (it's for agent instructions, not human contributors)
- Do NOT require contributors to write evolution log entries
