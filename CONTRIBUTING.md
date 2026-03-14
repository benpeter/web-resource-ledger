Thank you for considering contributing to Web Resource Ledger.

## Quick Start

```bash
git clone https://github.com/benpeter/web-resource-ledger.git
cd web-resource-ledger
nvm use
npm install
npm test
```

This works immediately -- no accounts or API keys needed. The test suite is fully self-contained via Miniflare's simulated Workers runtime.

## Full Local Development (optional)

Running the actual capture pipeline requires:

- Cloudflare Workers Paid plan with Browser Rendering enabled
- A `.dev.vars` file with `SIGNING_KEY` and `CAPTURE_API_KEY` set
- Then `npm run dev`

The README covers the Cloudflare setup in detail.

## Running Tests

A few gotchas worth knowing before you write tests:

- Tests run in `@cloudflare/vitest-pool-workers`, not plain Node.js. Some Node APIs are unavailable.
- Import `SELF`, `env`, and `fetchMock` from `cloudflare:test`, not from `vitest`.
- `isolatedStorage: false` is deliberate -- do explicit `beforeEach` cleanup instead of relying on automatic resets.
- Test signing keys are auto-generated at load time; no key setup is needed.
- Tests that make outbound HTTP calls require `fetchMock`. Use `activateFetchMock()` in `beforeEach` and `deactivate()` in `afterEach`. A `fetchMock` left active after a test will cause failures in unrelated tests -- this is a 20+ minute debugging trap if you don't know to look for it.

## Design Philosophy

This project uses vanilla JavaScript with zero frontend frameworks. This is intentional -- not a gap waiting to be filled. PRs that introduce frameworks (React, Vue, Tailwind, jQuery, etc.) or transpilation steps (TypeScript, Babel) will be declined. If you think a dependency is warranted, open an issue first to discuss.

The project follows the [Helix Manifesto](https://github.com/adobe/helix-home/blob/main/manifesto.md). YAGNI and KISS are the core principles: don't build it until you need it, and simple beats elegant.

## Making Changes

- Branch from `main`
- Keep PRs small and focused on a single concern
- Include tests for new features; regression tests for bug fixes
- Use conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`, etc.

## If You're Changing the API

Run `npm run lint:api` locally against `openapi.yaml` before pushing. CI runs this automatically, but catching issues locally saves a round trip.

## How This Project Is Built

`docs/evolution/` contains the design rationale for each development phase -- including the prompts, decisions made, and outcomes. If you're wondering why something is the way it is, start there.

The backlog at `docs/backlog.md` shows planned work and current priorities.

## Getting Help

Open a GitHub Issue for questions, bugs, or feature ideas. Before starting a large contribution, check `docs/backlog.md` to see if it aligns with the project's direction.

---

- Security issues: see [SECURITY.md](SECURITY.md)
- Code of conduct: all contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md)
- License: contributions are licensed under [Apache 2.0](LICENSE)
