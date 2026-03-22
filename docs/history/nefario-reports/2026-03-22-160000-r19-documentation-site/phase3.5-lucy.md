# Lucy Review: R19 Documentation Site Plan

## Verdict: ADVISE

The plan is well-aligned with the original issue requirements. All success criteria trace to plan tasks, and all plan tasks trace to stated requirements. The engineering philosophy (YAGNI, KISS, Helix Manifesto) is respected: vanilla HTML/CSS, no JS framework, build-time rendering, minimal dependencies. Conflict resolutions are well-reasoned and documented. Two concerns below, neither blocking.

---

### Requirement Traceability

| Requirement (from issue) | Plan Element | Status |
|---|---|---|
| Getting Started guide (API key to verified capture in 5 min) | Task 3: index.md with 3-step walkthrough | COVERED |
| API reference generated from openapi.yaml, stays in sync via CI | Task 2: 11ty data pipeline + Task 4: CI triggers on openapi.yaml | COVERED |
| Auth guide (per-tenant, admin, legacy) | Task 3: authentication.md with 3-persona structure | COVERED |
| Verification guide (Ed25519, RFC 3161, WACZ, npx verify) | Task 3: verification.md with 2-layer disclosure | COVERED |
| MCP guide (tool interface, setup, agent workflows) | Task 3: mcp.md | COVERED |
| Batch guide (request/response, polling) | Task 3: batch.md | COVERED |
| WRL brand design system | Task 1: design-system.css passthrough + docs.css tokens | COVERED |
| Custom domain with HTTPS | Task 4: wrangler.toml routes with custom_domain | COVERED |
| Lighthouse accessibility >= 90 | Task 5: dedicated accessibility audit | COVERED |
| Build and deploy on push to main | Task 4: deploy-docs.yml with path filter | COVERED |
| No JS framework; 11ty or plain HTML only | Task 1: 11ty v3 scaffold, zero client-side JS | COVERED |
| openapi.yaml is single source of truth | Task 2: build-time parsing, no hand-written API docs | COVERED |

No orphaned tasks. No unaddressed requirements.

---

### Concerns

- [governance]: Issue scope says "Cloudflare Pages deployment" but plan uses Workers Static Assets. The plan's rationale (Pages deprecated April 2025) is sound and the right call, but the explicit scope deviation should be noted for the human at the approval gate so there is no surprise.
  SCOPE: Task 4 (infrastructure)
  CHANGE: Add a one-line note in the PR description acknowledging the scope deviation: issue says "Cloudflare Pages" but Workers Static Assets is the correct replacement since Pages deprecation.
  WHY: Explicit scope deviations, even well-justified ones, should be surfaced rather than silently adopted. The human approving should see the substitution called out.
  TASK: Task 4

- [governance]: The plan does not mention creating the evolution log directory for this phase (e.g., `docs/evolution/0051-documentation-site/`). CLAUDE.md requires "Before starting a phase: create the directory and write prompt.md" and updating the evolution README. The plan has no task or step for this.
  SCOPE: Evolution log compliance
  CHANGE: The orchestrator session must create `docs/evolution/0051-documentation-site/` with `prompt.md`, `decisions.md`, and `outcome.md` per CLAUDE.md rules, and update `docs/evolution/README.md`. This can be handled outside the delegation tasks (by the orchestrator itself), but it must happen.
  WHY: CLAUDE.md section "Evolution Log > Rules" item 1 is explicit: "Before starting a phase: create the directory and write prompt.md." This is marked as "non-negotiable." Every prior phase (0001-0050) followed this convention.
  TASK: Cross-cutting (not assigned to any task)

### Non-Issues Reviewed and Cleared

- **Copy-to-clipboard JS in Task 5**: The issue says "Must not introduce a JS framework." A 15-line progressive enhancement snippet is not a framework. This is consistent with the constraint.
- **Workers Static Assets as serverless**: Aligns with the project's Cloudflare-first infrastructure. No serverless-deviation flag needed.
- **`@apidevtools/swagger-parser` as new dependency**: Justified by the spec's extensive $ref usage. The alternative (manual $ref resolution) would be more code and more fragile. Proportional to the problem.
- **Separate `site/package.json`**: Appropriate isolation. The docs site has different dependencies (11ty, syntax highlighting) that do not belong in the Worker's package.json.
- **Sidebar order conflict resolution**: user-docs-minion's order (reference last) follows established documentation frameworks. No drift from user intent.
- **Getting Started as homepage**: Eliminates a zero-value interstitial. Consistent with KISS principle.
