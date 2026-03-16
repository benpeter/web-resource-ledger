## Margo Review: Simplicity & YAGNI Assessment

**Verdict: ADVISE**

This plan is well-scoped overall. The conflict resolutions are correct -- rejecting Worker-served legal endpoints, rejecting the `/abuse` route, and rejecting the styled `/terms` page are exactly the right calls. Serving static Markdown from GitHub is the simplest approach. The three-task parallel structure with no file overlap is clean. Three specific items warrant attention:

- [simplicity]: Smoke test capture round-trip adds significant complexity for marginal value in CI
  SCOPE: `scripts/smoke-test.sh`, Task 2b check #4 (capture round-trip)
  CHANGE: Ship the smoke test with checks 1-3 only (health, headers, signing key). Add the capture round-trip later when staging is stable and Browser Rendering availability is confirmed. The optional `SMOKE_SKIP_CAPTURE` escape hatch signals the plan already anticipates this check will fail in practice.
  WHY: The round-trip polls for 60 seconds, depends on Browser Rendering being enabled for the staging account, and the plan itself notes it will accept `failed` as passing -- meaning it validates "infrastructure responded" not "capture works." Checks 1-3 already validate the Worker deployed correctly. A test that passes on failure is not providing signal, it is providing comfort. This is premature: build the simple smoke test, confirm staging works, add the round-trip when the environment is proven. Risk: wasted CI minutes and false confidence from a test designed to accept failure.
  TASK: 2

- [simplicity]: `ci.yml` change detection may break under `workflow_call` context
  SCOPE: `.github/workflows/ci.yml`, Task 1c
  CHANGE: The plan acknowledges this risk (#2 in Risks) but proposes a fallback of "duplicating test steps in deploy-staging.yml." Instead, consider whether `deploy-staging.yml` should simply run `npm ci && npm test && npm run lint:api` directly rather than calling `ci.yml` as a reusable workflow. The ci.yml change-detection logic (`github.event.pull_request.base.sha || github.event.before`) is designed for PR/push contexts; under `workflow_call` from a different workflow, `github.event.before` may reference the calling workflow's event context, not the code change boundary. A three-step inline job in deploy-staging.yml (checkout, setup-node, npm ci + test + lint) is ~10 lines and avoids coupling two workflows through shared event context semantics.
  WHY: Reusable workflows add a layer of indirection (workflow_call trigger semantics, input/output contracts, event context inheritance) to save ~10 lines of YAML duplication. The change-detection logic in ci.yml is a PR optimization that is irrelevant for deploy-staging (which always runs on push to main and always wants full tests). Coupling the two creates a maintenance burden: changes to ci.yml's skip logic could silently skip tests in the staging deploy pipeline. Simpler to inline and decouple.
  TASK: 1, 2

- [simplicity]: Footer link color differentiation adds design complexity for two links
  SCOPE: `src/verify-page.js`, Task 3e
  CHANGE: Use the existing footer color (`#6d6d6d`) for footer links, same as the surrounding text, with `text-decoration: underline` for discoverability. Drop the color-contrast visual hierarchy between "Terms" and "Report Abuse" -- both are low-priority footer links, not calls to action.
  WHY: Using `#1a1a1a` (body text color) for footer links to create "subtle visual hierarchy" within a two-link footer is over-designed. The plan invokes ux-strategy-minion's recommendation, but for two plain footer links on a verification page, matching the existing footer style is sufficient. Users who need to report abuse will find the clearly labeled "Report Abuse" link without color contrast tricks. Less CSS, less cognitive overhead for the next person reading the template.
  TASK: 3
