# Domain Plan Contribution: devx-minion

## Recommendations

### 1. CONTRIBUTING.md: Two-Tier Setup Is the Central Design Problem

The biggest contributor experience risk in this project is the asymmetry between `npm test` and `npm run dev`. Most open-source projects have a uniform development loop: install, run, test, change, repeat. WRL breaks that assumption because local development (`npm run dev`) requires a Cloudflare Workers Paid plan + Browser Rendering binding, while the test suite (`npm test`) is fully self-contained via Miniflare's workerd runtime with `fetchMock` intercepting all outbound calls.

CONTRIBUTING.md should lead with this distinction as a first-class concept, not bury it in prerequisites. Recommended structure:

```
## Quick Start (all contributors)
  npm install && npm test    <-- works immediately, no accounts

## Full Local Development (optional)
  Requires: Cloudflare Workers Paid plan, Browser Rendering binding
  Configure .dev.vars, then: npm run dev
```

The framing matters: "you can contribute without a Cloudflare account" is the headline. "Full local dev is optional and here's how" is the secondary path. This prevents the most common contributor dropout: seeing "Cloudflare account required" and closing the tab.

### 2. Mention `npm run lint:api` -- But Position It Correctly

Yes, `npm run lint:api` (Redocly OpenAPI linting) should be mentioned, but only in context of "if you're modifying the API." It should NOT be in the CI prerequisite check list that every contributor needs to run before every PR. Reason: most contributions won't touch `openapi.yaml`. Mentioning it as a universal gate adds friction for no benefit.

Recommended placement: a short section titled "If you're changing the API" that mentions running `npm run lint:api` against `openapi.yaml` before pushing. CI will catch it anyway (since the CI workflow runs it), so this is a convenience hint, not a hard requirement in the contributor's mental checklist.

### 3. Helix Manifesto Philosophy: Be Direct, Not Preachy

The "vanilla JS by design" philosophy needs to be stated clearly enough that someone doesn't open a PR adding React or Tailwind, but without sounding hostile to frameworks. The Helix Manifesto link is good context but most contributors won't click through to read it.

Recommended approach: one paragraph under a "Design Philosophy" heading that says the equivalent of:

> This project uses vanilla JavaScript with zero frontend frameworks. This is intentional -- not a gap waiting to be filled. PRs that introduce frameworks (React, Vue, Tailwind, jQuery, etc.) or transpilation steps (TypeScript, Babel) will be declined. If you think a dependency is warranted, open an issue first to discuss.

Key principles to encode:
- State the rule (vanilla JS only)
- State that it's intentional (not tech debt)
- Give the escape hatch (open an issue to discuss)
- Don't lecture about why frameworks are bad

### 4. Cloudflare vitest-pool-workers Gotchas for Contributors

Based on the project's test configuration and existing test patterns, these are the gotchas that belong in CONTRIBUTING.md:

**a) `isolatedStorage: false` is deliberate.** The `vitest.config.js` explicitly disables isolated storage because R2's SQLite WAL files cause "failed to pop isolated storage stack frame" errors between tests. Contributors writing new tests must do explicit cleanup in `beforeEach` rather than relying on per-test isolation. This is a counter-intuitive requirement that will bite anyone who has used vitest in a non-Workers context.

**b) Test signing keys are auto-generated.** The vitest config generates a fresh Ed25519 key pair at load time (`generateKeyPairSync('ed25519')`), so contributors never need to create or manage test keys. This is worth calling out because the README's signing key setup section might mislead contributors into thinking they need keys for testing.

**c) `fetchMock` is required for tests that trigger outbound requests.** Tests use `fetchMock` from `cloudflare:test` to intercept HTTP calls (see `capture-integration.test.js` pattern). Contributors adding tests with outbound fetches must follow the `activateFetchMock()` / `deactivate()` pattern -- the test pool doesn't allow real network calls by default when `disableNetConnect()` is active.

**d) Imports from `cloudflare:test` not `vitest`.** The `SELF`, `env`, and `fetchMock` bindings come from `cloudflare:test`, not from vitest directly. This is a common confusion point for contributors familiar with vitest but not with the Workers test pool.

**e) Rate limiters share state across test files.** The `unsafe.bindings` rate limiters in `wrangler.toml` share state across tests, which is why some tests use distinct `CF-Connecting-IP` headers to avoid tripping rate limits from earlier test runs in the same suite. Contributors adding tests that hit rate-limited endpoints should be aware of this.

### 5. Evolution Log and Backlog: Link but Frame for Context, Not Action

CONTRIBUTING.md should link to both `docs/evolution/` and `docs/backlog.md`, but the framing should be "understand how this project was built and what's planned" -- not "pick a backlog item and build it." Reasons:

- The evolution log is a unique asset that helps contributors understand design decisions and trade-offs. Linking to it reduces "why was this done this way?" questions.
- The backlog has tiered items (must/should/consider) but no "good first issue" markers. Without curation, pointing contributors at the backlog creates false expectations about what's welcome as a PR.
- The right framing: "The evolution log documents how every feature was designed and built. Reading the phase relevant to your change will save you time. The backlog lists planned work -- check it before starting a large contribution to see if it aligns with project direction."

Do NOT say "pick an item from the backlog." That invites drive-by PRs for [consider]-tier items that may never be accepted.

### 6. Additional CONTRIBUTING.md Recommendations

**a) Commit message convention.** The project uses conventional-style commit messages (evident from git log: `chore:`, step descriptions). State this briefly so contributors match the style.

**b) PR size guidance.** Small, focused PRs. The project has a clear phase-based development history -- contributions should match that discipline.

**c) Where to ask questions.** GitHub Issues or Discussions. Don't leave contributors guessing.

**d) Test expectations.** New features should include tests. Bug fixes should include a regression test. Tests run in the Workers pool, not Node.js -- see gotchas above.

**e) No mention of CLAUDE.md in CONTRIBUTING.md.** The CLAUDE.md file contains agent instructions and local development preferences. It's not relevant to human contributors and linking to it from CONTRIBUTING.md would be confusing. The relevant philosophy (vanilla JS, Helix Manifesto) should be stated directly in CONTRIBUTING.md.

## Proposed Tasks

### Task 1: Write CONTRIBUTING.md

**Deliverable**: `CONTRIBUTING.md` at repo root.

**Structure** (recommended sections in order):

1. **Quick Start** -- `npm install && npm test` works immediately, no accounts needed
2. **Full Local Development** -- optional, requires Cloudflare Workers Paid plan, `.dev.vars` setup with `SIGNING_KEY` and `CAPTURE_API_KEY`
3. **Running Tests** -- vitest with `@cloudflare/vitest-pool-workers`, key gotchas (isolated storage off, fetchMock pattern, `cloudflare:test` imports, rate limiter state)
4. **Design Philosophy** -- vanilla JS, no frameworks, Helix Manifesto link, "open an issue first" escape hatch
5. **Making Changes** -- branch from main, small PRs, include tests, conventional commit messages
6. **If You're Changing the API** -- run `npm run lint:api`, keep `openapi.yaml` in sync
7. **Project Context** -- links to evolution log and backlog with appropriate framing
8. **Getting Help** -- GitHub Issues

**Dependencies**: None. Can be written independently of all other steps.

**Length target**: Under 150 lines of markdown. Contributors should be able to read the whole thing in under 5 minutes.

### Task 2: Review Test Gotchas Section for Accuracy

After drafting the CONTRIBUTING.md, the test gotchas section should be validated by running the full test suite once (`npm test`) to confirm the described behaviors are current. This is a verification step, not a code change.

**Dependencies**: Task 1 complete.

## Risks and Concerns

### Risk 1: Overcomplicating the Two-Tier Setup Explanation

If the CONTRIBUTING.md spends too many words explaining the test-vs-dev split, contributors will skip the whole document. The explanation should be 3-5 sentences maximum, with a clear "you probably only need `npm test`" signal. The current README already has a lengthy setup section for the full Cloudflare environment -- CONTRIBUTING.md should not duplicate it but can link to it.

### Risk 2: Stale Test Gotchas

The vitest-pool-workers package is at version 0.12.21. Cloudflare ships breaking changes to this pool regularly (it's pre-1.0). The gotchas documented today may not apply in 6 months. Mitigation: keep the gotchas section short and factual, not tutorial-length. If a gotcha becomes wrong, a one-line deletion fixes it.

### Risk 3: Evolution Log Link Creating Contributor Confusion

External contributors may read the evolution log and assume the project uses an agent-driven development process exclusively. This could make human contributors feel like their contributions aren't valued or that there's a specific process they need to follow. Mitigation: frame the evolution log as "project history and design rationale" without emphasizing the agent aspect. Contributors care about *what* was decided and *why*, not *which agent* argued for it.

### Risk 4: Missing "Good First Issue" Guidance

The backlog exists but has no contributor-ready items flagged. CONTRIBUTING.md linking to the backlog without curation could frustrate contributors who want to help but don't know where to start. Mitigation: don't promise "good first issues" if they don't exist. Say "open an issue to discuss what you'd like to work on" instead. This is honest and prevents wasted effort on both sides.

## Additional Agents Needed

None. The three-agent consultation plan (iac-minion for CI, devx-minion for CONTRIBUTING.md, software-docs-minion for SECURITY.md/prose) covers all the deliverables. The ux-strategy-minion coherence check mentioned in the metaplan is a good addition but already planned.
