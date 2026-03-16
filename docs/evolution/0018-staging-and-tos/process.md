# Process: 0018-staging-and-tos

TL;DR: Six specialists planned in parallel, nefario synthesized into 3 independent
tasks, 5 mandatory reviewers flagged one critical CI compatibility issue and
recommended simplification. All approval gates were skipped per human directive.
13 files changed, 386 tests pass, PR auto-created. The interesting conflicts were
about where legal documents should live and whether ci.yml should be a reusable
workflow.

## Orchestration configuration

This run used a non-standard configuration: all approval gates skipped, decisions
deferred to gru and lucy, compaction checkpoints skipped, PR auto-created. The
human chose this configuration because two worktrees were running in parallel and
manual gate overhead was not justified for well-scoped infrastructure work.

## Phase 1: Meta-plan

nefario identified 6 specialists across 4 domains:
- **Infrastructure**: iac-minion (core R9 deliverable)
- **Security**: security-minion (secret isolation, legal provisions)
- **API design**: api-design-minion (ToS surfacing mechanism)
- **Testing**: test-minion (smoke test design)
- **Cross-cutting**: ux-strategy-minion (ToS UX, abuse mechanism), software-docs-minion (document structure, OpenAPI)

Notable exclusion: **frontend-minion** was excluded because the only UI change was
two footer links on an existing page -- not a component architecture decision.
**observability-minion** was excluded because staging inherits existing Coralogix
integration; the only observability change was parameterizing `APPLICATION_NAME`.

## Phase 2: Specialist planning

All 6 specialists ran in parallel (~2.5 minutes wall time).

### Where specialists agreed

- **Staging must use completely separate secrets** (iac-minion, security-minion). A
  shared Ed25519 signing key would make staging captures cryptographically
  indistinguishable from production evidence, destroying the trust model.
- **Email for abuse reporting** (security-minion, ux-strategy-minion). Zero additional
  attack surface, matches project scale, KISS.
- **No ToS in 202 response body** (api-design-minion, ux-strategy-minion). Once a JSON
  field exists, removing it is a breaking change. The Link header covers discovery.
- **Shell-based smoke test** (iac-minion, test-minion). curl + jq, no Node.js deps.

### Where specialists disagreed

**The central conflict: Worker endpoints vs GitHub-hosted documents**

- **software-docs-minion** argued for dedicated Worker endpoints (`GET /legal/terms`,
  `GET /legal/content-policy`). Self-contained API, no external dependency on GitHub.
  Recommended `legal/` directory in the repo.
- **api-design-minion** argued against any new endpoints. GitHub serves Markdown with
  caching, versioning, and rendering for free. Three discovery mechanisms (Link header,
  health endpoint, OpenAPI spec) provide adequate coverage. Documents at repo root
  following the `LICENSE`/`SECURITY.md` convention.

This conflict is archetypal: API completeness vs YAGNI. software-docs-minion was
designing for a mature API product; api-design-minion was designing for a
single-operator early-stage project. Both were right for their assumed maturity level.

**Secondary conflict: ci.yml reuse vs inlined steps**

- **iac-minion** recommended adding `workflow_call` to ci.yml so deploy-staging.yml
  could reuse it.
- This conflict didn't surface until **Phase 3.5** when lucy flagged that ci.yml's
  change detection logic would break under `workflow_call` (neither
  `github.event.pull_request.base.sha` nor `github.event.before` is populated in a
  called workflow context). margo independently argued the coupling wasn't worth the
  10 lines of YAML saved.

## Phase 3: Synthesis

nefario resolved the endpoint conflict in favor of api-design-minion, citing the Helix
Manifesto's lean-and-mean principle. The plan consolidated into 3 parallel tasks with
zero file overlap and zero approval gates:

1. Staging env config (wrangler.toml, log.js)
2. Deploy workflow + smoke test (deploy-staging.yml, smoke-test.sh, package.json)
3. Legal docs + API integration (TERMS.md, CONTENT-POLICY.md, index.js, verify-page.js, openapi.yaml, README.md)

## Phase 3.5: Architecture review

5 mandatory reviewers ran in parallel.

**Verdicts**: 1 APPROVE (ux-strategy-minion), 4 ADVISE (security-minion, test-minion, lucy, margo)

### Key findings that changed the plan

1. **lucy: ci.yml workflow_call will break** (ADVISE, adopted). The change detection
   logic in ci.yml computes `BASE_REF` from event context variables that don't exist
   under `workflow_call`. This would cause every staging deploy to fail. lucy rated
   this "Low" risk; in reality it was certain failure. Resolution: dropped `workflow_call`
   from ci.yml entirely, inlined test steps in deploy-staging.yml.

2. **test-minion: missing unit tests for new behaviors** (ADVISE, adopted). The Link
   header and health endpoint legal object were new observable behaviors without test
   coverage. Added assertions to `security-headers.test.js` and `health.test.js`.

3. **test-minion: APPLICATION_NAME test coverage** (ADVISE, adopted). The parameterized
   `applicationName` in log.js had no test for the non-default path. Added two tests.

### Findings acknowledged but not acted on

- **security-minion**: CLOUDFLARE_API_TOKEN scope should be constrained to `wrl-staging`.
  True, but this is an operator configuration decision, not a code change. Documented
  in outcome.md's operator action list.
- **margo**: Capture round-trip in smoke test is unnecessary given health + headers +
  signing key already prove deploy success. Kept the round-trip because the issue
  explicitly calls for "health check + capture round-trip" as a success criterion.
- **margo**: Footer link color differentiation is over-designed. Kept
  ux-strategy-minion's recommendation because 3 lines of CSS is negligible complexity
  for improved scannability of the abuse link.

## Phase 4: Execution

The human chose to execute directly rather than spawning subagents, since all task
prompts were self-contained and the human had full codebase context from the planning
phases. All 3 tasks were executed sequentially in the main session.

### Human interventions

- **Adopted lucy's ci.yml finding**: Dropped Task 1c (workflow_call trigger) entirely.
  Inlined test steps in deploy-staging.yml instead.
- **Adopted test-minion's test coverage finding**: Added unit tests for Link header,
  health legal object, and APPLICATION_NAME parameterization beyond what the synthesis
  plan specified.
- **Did not intervene on**: Document content (TERMS.md, CONTENT-POLICY.md), footer link
  styling, smoke test design, wrangler.toml structure, deploy workflow structure,
  OpenAPI changes.

## Phase 5-6: Verification

- 386 tests pass across 19 files (baseline: 384 tests, +2 new log.js tests)
- OpenAPI lint: valid, 2 pre-existing explicit ignores
- No code review or documentation phases ran separately (the human executed and
  reviewed in a single pass)

## Where to read more

- Full specialist contributions: `docs/history/nefario-reports/` (companion directory for this run's report)
- Decisions with rejected alternatives: `docs/evolution/0018-staging-and-tos/decisions.md`
- What was produced: `docs/evolution/0018-staging-and-tos/outcome.md`
