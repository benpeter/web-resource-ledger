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
- A `.dev.vars` file -- create it from this template:

```ini
# Required
SIGNING_KEY=<your Ed25519 private key>
CAPTURE_API_KEY=<a secret API key you choose>
IP_HASH_SEED=<any random string, used for privacy-safe IP hashing>

# Optional -- structured log ingestion; omit to log to console only
CORALOGIX_SEND_KEY=<your Coralogix send key>

# Optional -- only needed when testing browser clients with CORS
CORS_ORIGINS=http://localhost:3000
```

- Then `npm run dev`

The README covers the Cloudflare setup in detail.

## Staging & Deployment

Merging to `main` automatically runs three jobs in sequence:
**CI tests** -> **staging deploy** -> **smoke tests** (`deploy-staging.yml`).
All three must pass; a failed smoke test blocks the deployment from being
considered complete.

**Deploy to staging manually:**

```bash
wrangler deploy --env staging
```

**Set staging secrets** (one-time, or when rotating):

```bash
wrangler secret put SIGNING_KEY --env staging
wrangler secret put CAPTURE_API_KEY --env staging
wrangler secret put IP_HASH_SEED --env staging
wrangler secret put CORALOGIX_SEND_KEY --env staging
```

**Run smoke tests against any environment:**

```bash
SMOKE_URL=https://wrl-staging.example.workers.dev \
SMOKE_API_KEY=<staging capture api key> \
npm run smoke
```

The smoke test validates four things: health endpoint returns `200 { status: "ok" }`,
required security headers are present, `/.well-known/signing-key` returns a valid
Ed25519 key, and a capture round-trip completes (or at least enters the queue).

## Running Tests

Two test suites, separate concerns:

```bash
npm test                    # Unit tests (~6s, mocked browser)
npm run test:integration    # Integration tests (~90s, real Chromium)
```

**Unit tests** (`npm test`) use mocked renderers and `fetchMock` -- fast, no network, no browser. **Integration tests** (`npm run test:integration`) exercise the real capture pipeline through headless Chromium: browser rendering, WACZ bundling, TSA timestamping. The first run downloads Chromium automatically via miniflare.

A few gotchas worth knowing before you write tests:

- Tests run in `@cloudflare/vitest-pool-workers`, not plain Node.js. Some Node APIs are unavailable.
- Import `SELF`, `env`, and `fetchMock` from `cloudflare:test`, not from `vitest`.
- `isolatedStorage: false` is deliberate -- do explicit `beforeEach` cleanup instead of relying on automatic resets.
- Test signing keys are auto-generated at load time; no key setup is needed.
- **Unit tests only:** Tests that make outbound HTTP calls require `fetchMock`. Use `activateFetchMock()` in `beforeEach` and `deactivate()` in `afterEach`. A `fetchMock` left active after a test will cause failures in unrelated tests -- this is a 20+ minute debugging trap if you don't know to look for it.
- **Integration tests only:** Each test pre-acquires a browser session via `acquire()` in `beforeEach`. This is required because miniflare's browser binding doesn't implement `limits()`.

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
