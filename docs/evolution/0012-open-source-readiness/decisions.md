# Phase 0012 Decisions: Open-Source Readiness

## 1. Node version: 22 instead of 18

**Decision**: `.nvmrc` set to `22`; `engines` field in `package.json` set to `>=20.0.0`.

**Context**: The original plan specified Node 18 with a matching `.nvmrc`. During Phase 2 planning, iac-minion discovered that wrangler 4.73.0 requires Node `>=20.0.0`, which immediately ruled out Node 18.

**Options considered**:
- Node 20 -- compatible with wrangler, but exits LTS maintenance April 2026 (approximately one month away at time of writing). Using it would mean contributors immediately need to upgrade.
- Node 22 -- current LTS, supported through October 2027. Roughly two more years of maintenance.

**Resolved**: Node 22. The choice preserves a meaningful LTS window and avoids putting contributors on an imminently end-of-life version.

---

## 2. Two-tier contributor setup

**Decision**: CONTRIBUTING.md leads with a "Quick Start" path that requires no Cloudflare account, and frames full local dev as optional.

**Context**: devx-minion identified that `npm test` works entirely through Miniflare (Cloudflare's local simulator) -- no account, no credentials needed. `npm run dev` is a different story: it requires a Cloudflare Workers Paid plan plus the Browser Rendering binding, which is not available on free accounts.

**Options considered**:
- Treat full local dev as the baseline and require contributors to have a Cloudflare account. This would block most contributors immediately.
- Lead with the test-only path and treat full dev as an advanced/optional step. This keeps the on-ramp low.

**Resolved**: Two-tier approach. "Quick Start" covers clone → install → test with no external dependencies. "Full local development" is a separate section for contributors who need to run the Worker end-to-end.

---

## 3. Evolution log is NOT a contributor requirement

**Decision**: CONTRIBUTING.md makes no mention of the evolution log structure (prompt.md / decisions.md / outcome.md).

**Context**: The evolution log (`docs/evolution/`) is tightly coupled to the nefario orchestration workflow used by the core maintainer team. External contributors have no context for this structure and no way to participate in it meaningfully.

**All three specialists agreed**: requiring external contributors to produce agent-workflow documentation would add friction with no benefit. Maintainers handle evolution log entries after any PR that warrants a phase entry.

---

## 4. CI: actions pinned to commit SHAs, with residual maintenance risk

**Decision**: GitHub Actions steps use commit SHA pins (e.g., `actions/checkout@<sha>`) rather than version tags.

**Context**: Version tags in GitHub Actions can be moved by the upstream maintainer. A tag like `v4` today could point to a different commit tomorrow. SHA pinning is the security-standard practice for open-source CI: the exact code that runs is immutable.

**Residual risk**: Dependabot was explicitly excluded from this phase's scope. Without it, SHA pins require manual monitoring to catch upstream security fixes. This is a known trade-off: SHA pinning provides immutability, but manual updates create a maintenance burden. The gap is documented here so future phases can address it (e.g., by adding Dependabot when automation overhead is acceptable).

---

## 5. Code of Conduct enforcement via email, not GitHub Security Advisories

**Decision**: `CODE_OF_CONDUCT.md` specifies a maintainer email address for conduct reports.

**Context**: Contributor Covenant v2.1 requires a designated contact method for enforcement. The original plan considered using GitHub Security Advisories (GHSA) as the reporting channel.

**security-minion advised against it**: GHSA is designed for vulnerability reports -- confidential technical disclosures. Routing conduct complaints through the same channel conflates two distinct processes with different privacy expectations and handling requirements. Mixing them creates confusion about what gets disclosed, to whom, and when.

**Resolved**: Maintainer email for conduct reports, GHSA reserved for security vulnerabilities. Separation is clean and matches community expectations for each channel.

---

## 6. SECURITY.md: goals framing, not SLA framing

**Decision**: Response time targets (72h acknowledgment, 7-day assessment) are stated as goals, not service-level agreements.

**Context**: SECURITY.md needs to set contributor and reporter expectations without creating contractual obligations. Two anti-patterns were considered and rejected:
- Corporate SLA language ("we will respond within...") -- implies a contract the project cannot guarantee.
- Omitting targets entirely -- leaves reporters with no sense of what to expect, discourages responsible disclosure.

**Resolved**: "We aim to..." framing. Signals genuine responsiveness without overpromising. Standard practice for small open-source projects.
