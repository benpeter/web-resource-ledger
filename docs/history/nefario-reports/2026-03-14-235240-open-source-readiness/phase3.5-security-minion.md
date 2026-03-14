## Security Review: Open-Source Readiness Plan

ADVISE

---

- [security]: CODE_OF_CONDUCT.md routes conduct reports through GitHub Security Advisories (GHSA), which is designed for security vulnerabilities, not community conduct enforcement.
  SCOPE: CODE_OF_CONDUCT.md enforcement section; Step 8 in Task 1 prompt
  CHANGE: Use a maintainer email address (e.g., a dedicated address like conduct@... or the maintainer's public contact) as the enforcement channel for conduct reports, keeping GHSA reserved exclusively for security vulnerabilities. If a personal email is unacceptable, create a GitHub-hosted contact form or use a separate private issue category. At minimum, the plan should acknowledge the dual-use conflict and make a deliberate choice rather than defaulting to GHSA by convenience.
  WHY: GHSA is a security advisory channel. Routing conduct complaints there conflates two distinct reporter populations with different expectations and different urgency levels. A harassed contributor submitting a conduct report via GHSA will receive a response framed around vulnerability triage ("72-hour acknowledgment," "initial assessment"), which is inappropriate for a conduct situation. Conversely, GHSA channels are typically reviewed with a security lens; a conduct incident may be triaged as low-priority if reviewers apply security severity criteria. More practically, Contributor Covenant v2.1 expects a human contact point that can act on conduct issues -- GHSA is a structured advisory workflow, not a general private messaging channel. The mismatch creates a gap in enforcement credibility.
  TASK: Task 1 (Step 8)

---

- [security]: .gitignore additions cover `.env` but not `.env.*` variants (`.env.local`, `.env.production`, `.env.test`), which are common in Node.js projects and could contain secrets if contributors follow Next.js, Vite, or similar conventions.
  SCOPE: .gitignore; Step 1 in Task 1 prompt
  CHANGE: Add `.env.*` to the Environment group in .gitignore alongside `.env`. The existing `.dev.vars` entry already handles the Wrangler-specific secret file, but broad defense-in-depth is cheap here.
  WHY: If a contributor adds a `.env.local` file during development (a common pattern from other ecosystems), it will not be caught by the current ignore rules and could be accidentally committed with secrets. The cost of adding `.env.*` is zero; the risk of omission is secret leakage in a public repo.
  TASK: Task 1 (Step 1)

---

- [security]: The CI workflow SHA verification instruction ("verify these are the latest stable SHAs... before committing") is delegated to the executing agent at runtime, with no mechanism to catch drift after the fact.
  SCOPE: .github/workflows/ci.yml; Step 5 in Task 1 prompt
  CHANGE: This is low risk for initial creation -- the plan already pins to full SHAs with version comments, which is correct practice. The residual concern is maintainability: without Dependabot or a similar tool to surface SHA updates, the pins will silently go stale. Document this explicitly in the evolution log decisions.md as a known gap (not a blocker for this phase, but a future backlog item). The plan currently defers Dependabot per Margo-approved scope -- that deferral is fine, but the reasoning should be recorded.
  WHY: Pinned SHAs are only as good as the process that keeps them current. A SHA pinned today to a compromised-then-remediated action version provides false security. The gap is acceptable for an MVP-phase open-source project, but it should be a named residual risk rather than an implicit one.
  TASK: Task 2 (decisions.md / outcome.md)

---

No blocking issues. The three concerns above are ordered by severity: the GHSA conduct channel conflict is the most actionable and should be resolved before execution. The `.env.*` addition is a one-line fix. The SHA maintenance documentation is informational.

The CI permissions model (`contents: read`), SHA pinning, `timeout-minutes: 10`, and SECURITY.md using GHSA for vulnerability reports are all correctly specified. The `.dev.vars` exclusion already exists in .gitignore. No new runtime attack surface is introduced by any of the 8 deliverables.
