# Decisions: 0018-staging-and-tos

## D1: Worker endpoints vs GitHub-hosted legal documents

**Options considered:**
1. Dedicated Worker endpoints (`GET /legal/terms`, `GET /legal/content-policy`) -- recommended by software-docs-minion
2. GitHub-hosted Markdown files with layered API discovery -- recommended by api-design-minion

**Decision:** Option 2. No Worker endpoints. Documents live as `TERMS.md` and `CONTENT-POLICY.md` at repo root, served by GitHub.

**Rationale:** The Helix Manifesto governs this project: lean and mean, fewer moving parts. Adding Worker routes to serve static text replicates what GitHub does for free with better caching, rendering, and versioning (git blame). Three discovery mechanisms provide adequate coverage without adding a single route: `Link` header on every response, `legal` object in health endpoint, `info.termsOfService` in OpenAPI spec.

**Rejected alternative's argument:** software-docs-minion argued a self-contained API shouldn't depend on GitHub for content serving. Valid concern for a high-traffic public service; premature for a single-operator early-stage project with zero external users.

## D2: Document location -- repo root vs `legal/` directory

**Decision:** Repo root. `TERMS.md` and `CONTENT-POLICY.md` sit alongside `LICENSE`, `SECURITY.md`, and `CODE_OF_CONDUCT.md`.

**Rationale:** Capital-letter governance files at root is the strongest GitHub convention. A `legal/` subdirectory adds indirection for two files.

## D3: ci.yml reuse vs inlined test steps in deploy workflow

**Options considered:**
1. Add `workflow_call` trigger to ci.yml, reuse from deploy-staging.yml -- recommended by iac-minion
2. Inline test steps directly in deploy-staging.yml -- recommended by margo

**Decision:** Option 2. Inline test steps.

**Rationale:** lucy flagged that ci.yml's change detection logic (`BASE_REF` from `github.event.pull_request.base.sha || github.event.before`) would break under `workflow_call` because neither event context variable is populated. margo independently argued the coupling wasn't worth saving 10 lines of YAML. Both concerns aligned: simpler and avoids a runtime failure.

## D4: Abuse reporting mechanism -- email vs structured endpoint

**Decision:** Email address in CONTENT-POLICY.md. No `/abuse` Worker route.

**Rationale:** security-minion and ux-strategy-minion agreed: email is KISS, adds zero attack surface, and matches the project's scale. ux-strategy-minion recommended making the presentation credible (response timeline, what to include, what to expect) rather than building infrastructure.

## D5: ToS in 202 capture response body

**Decision:** No. api-design-minion and ux-strategy-minion both recommended against it.

**Rationale:** Once a field enters a JSON response body, removing it is a breaking change. The `Link` header on the same response already covers ToS discovery. Adding a `tos_url` field conflates legal discovery with capture lifecycle.

## D6: Smoke test -- accept `failed` capture status as passing

**Decision:** Yes, by consensus (test-minion, margo).

**Rationale:** The smoke test validates infrastructure (Worker deployed, KV/R2/browser bindings wired), not page renderability. A `failed` status with a well-formed error proves the entire pipeline worked. Only fail on infrastructure breakage (connection refused, 500, timeout).

## D7: Footer link styling

**Decision:** Use `#1a1a1a` (body text color) for footer links, not footer's `#6d6d6d`.

**Rationale:** ux-strategy-minion recommended actionable links should be more visible than branding text. margo called this "over-designed" for two links. Went with ux-strategy-minion's recommendation since the implementation is 3 lines of CSS and improves scannability for someone who needs the abuse reporting link.
