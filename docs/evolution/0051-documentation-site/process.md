# Process: R19 Documentation Site

## TL;DR

Five specialists planned, eight reviewers vetted, and six execution tasks
built a complete documentation site in a single session. Key conflicts:
ReDoc vs build-time rendering (rendering size won), Cloudflare Pages vs
Workers Static Assets (deprecation forced the switch), and hub landing
page vs Getting Started as homepage (UX strategy's JTBD analysis won).
The human intervened zero times at gates (autonomous mode with Lucy
deciding). Code review found one blocking issue (missing CSS class) and
five advisories, all resolved. 31 files changed, ~4,000 lines added.

## Phase 1: Meta-Plan

Nefario identified five specialists for planning:
- **frontend-minion** -- 11ty architecture, template structure, design system integration
- **iac-minion** -- Cloudflare deployment, CI/CD, custom domain
- **api-spec-minion** -- OpenAPI rendering approach, spec tooling
- **user-docs-minion** -- content structure, tutorial design, information architecture
- **ux-strategy-minion** -- user journey, cognitive load, navigation design

Notable exclusions: security-minion and accessibility-minion deferred to
Phase 3.5 review (mandatory reviewers). test-minion also deferred -- the
site has no runtime tests, only build verification.

## Phase 2: Specialist Planning

All five specialists ran in parallel. Key positions:

**frontend-minion** argued for a `docs-site/` directory with React Spectrum
components. This was immediately at odds with the project's vanilla JS
philosophy and the constraint "must not introduce a JS framework."

**iac-minion** discovered the critical fact that Cloudflare Pages was
deprecated in April 2025. Recommended Workers Static Assets with `[assets]`
block in `wrangler.toml`. This was a scope deviation from the original issue
(which specified Pages) but was the only viable path forward.

**api-spec-minion** recommended `redocly build-docs` with a Handlebars
template for OpenAPI rendering. This would ship ~250KB of client-side JS
via ReDoc's React-based renderer.

**user-docs-minion** proposed a hub/landing page as the homepage, with
Getting Started as a separate page. Also recommended a comprehensive
content outline for each guide page.

**ux-strategy-minion** conducted a JTBD (Jobs to Be Done) analysis and
argued strongly against the hub page. Key insight: for a 6-page site,
a hub page is a zero-value interstitial. Getting Started should BE the
homepage, opening with a one-sentence product description and ending
with wayfinding links.

### Where They Disagreed

1. **Homepage structure**: user-docs-minion wanted a hub page;
   ux-strategy-minion argued it's useless for a small site. UX won --
   the JTBD analysis was more compelling than the convention argument.

2. **OpenAPI rendering**: api-spec-minion wanted Redocly/ReDoc;
   frontend-minion (and project philosophy) wanted zero client-side JS.
   Build-time rendering won because ReDoc's 250KB violated constraints.

3. **Sidebar order**: ux-strategy recommended API Reference after Auth.
   user-docs-minion recommended it last (reference after tutorials). The
   Divio framework argument won: tutorials and how-tos precede reference.

4. **Directory naming**: frontend-minion wanted `docs-site/`;
   synthesis chose `site/` (shorter, no collision with `docs/`).

## Phase 3: Synthesis

Nefario consolidated into six execution tasks:

1. Site scaffold (frontend-minion, sonnet) -- 11ty config, base template, CSS, assets
2. Content pages (user-docs-minion, sonnet) -- all six guide pages + API data pipeline
3. Deployment (iac-minion, sonnet) -- wrangler.toml, GHA workflow, CI integration
4. README cross-links (frontend-minion, sonnet) -- add docs links to main README
5. Accessibility (accessibility-minion, sonnet) -- WCAG audit and fixes
6. OpenAPI validation (api-spec-minion, sonnet) -- verify build-time rendering accuracy

Margo's advisory (not adopted): suggested using `redocly bundle --dereferenced`
instead of `@apidevtools/swagger-parser` to eliminate a dependency. Valid point
but swagger-parser provides programmatic access needed for the 11ty data pipeline.

## Phase 3.5: Architecture Review

Eight reviewers (5 mandatory + 3 discretionary):

**Mandatory**: security-minion, test-minion, ux-strategy-minion, lucy, margo

**Discretionary**: accessibility-minion (web-facing HTML), user-docs-minion
(content quality), ux-design-minion was not selected (no custom UI components).

Key review findings:
- **security-minion** (ADVISE): Recommended strict CSP, HSTS, avoiding
  env var names in docs, default Nunjucks escaping for OpenAPI strings.
  All incorporated into task prompts.
- **accessibility-minion** (ADVISE): Identified three contrast failures
  beyond what the design system provides. Recommended docs-local CSS
  overrides for WCAG AA compliance.
- **lucy** (ADVISE): Caught that the plan didn't explicitly include
  `.sr-only` CSS for the skip-to-content link. Added to Task 1.
- **margo** (APPROVE): Satisfied that the approach was minimal -- no
  framework, no build tools beyond 11ty, one external dependency for
  OpenAPI parsing.
- **test-minion** (ADVISE): Recommended build verification in CI and
  Lighthouse accessibility check.

No BLOCKs. All ADVISE notes incorporated into execution task prompts.

## Phase 4: Execution

### Task 1: Site Scaffold (frontend-minion)

Created the 11ty project structure, base template, CSS, and assets.
**Issue**: the agent wrote files to the original repo root instead of the
worktree path. Required manual `cp -r` and patch application to fix.
The `.sr-only` class that Lucy flagged was initially missing and had to
be added post-gate.

### Task 2: Content Pages (user-docs-minion)

Produced all six content pages and the OpenAPI data pipeline. The API
reference page uses a Nunjucks template that iterates over parsed spec
data. The `api.js` data file handles $ref resolution and schema flattening.

### Task 3: Deployment (iac-minion)

Created `site/wrangler.toml`, `.github/workflows/deploy-docs.yml`, and
updated `ci.yml` with docs-skip patterns. Workflow uses same action SHAs
as existing workflows.

### Task 4: README Cross-links (frontend-minion)

Added three cross-links to `docs.webresourceledger.com` in README.md.

### Task 5: Accessibility (accessibility-minion)

Added WCAG AA contrast overrides, Prism syntax highlight theme, and
copy-to-clipboard progressive enhancement. Fixed CSP from `'unsafe-inline'`
to strict `'self'` (Lucy's gate review caught the initial permissive policy).

### Task 6: OpenAPI Validation

Verified build-time rendering produces correct endpoint grouping,
method badges, and schema tables.

## Phase 5: Code Review

Three reviewers (code-review-minion, lucy, margo):

**BLOCK** (1): `card-grid` class used in index.md but never defined in CSS.
Fixed by adding a grid layout to docs.css.

**ADVISE** (4):
- Missing `.catch()` on clipboard Promise -- added
- Unused `active: true` field in site.js nav data -- removed
- Global security inheritance not handled in API data pipeline -- accepted
  (all endpoints use same auth, no practical impact)
- JSON examples may double-escape in endpoint template -- accepted
  (default Nunjucks escaping is the correct security choice per security advisory)

**NIT** (1): Unused `active` field -- addressed with the ADVISE fix.

## Phase 6: Tests

Ran `npm test` from repo root. Result: 28 test files, 755 tests passed.
Initially had 11 failures from Vitest scanning `site/node_modules/` --
fixed by adding `'site/**'` to vitest.config.js exclude array.

## Human Interventions

This was an autonomous orchestration with Lucy making all gate decisions.
No human interventions occurred during execution.

## Where to Read More

- Specialist discussions: `docs/history/nefario-reports/2026-03-22-*/` (companion directory)
- Decisions rationale: `docs/evolution/0051-documentation-site/decisions.md`
- Full execution plan: scratch files in the nefario report companion directory
