ADVISE

- [devx-minion]: The `fetchMock` gotcha is incomplete -- it names the pattern but omits the critical failure mode that will confuse contributors.
  SCOPE: CONTRIBUTING.md -- "Running Tests" section, `fetchMock` bullet
  CHANGE: The gotcha should state what happens when you forget to call `deactivateFetchMock()` -- specifically that it leaks into subsequent tests, causing them to fail in confusing ways unrelated to their own code. The current wording "required for tests with outbound HTTP calls (`activateFetchMock()` / `deactivate()` pattern)" tells contributors the syntax but not the consequence of getting it wrong. Add one sentence: "Forgetting to deactivate leaks the mock into later tests, causing failures that appear unrelated to the test that owns the mock."
  WHY: The `isolatedStorage: false` gotcha already includes the "why" (SQLite WAL files, failure error message). The `fetchMock` gotcha without a consequence description is weaker and won't prevent the failure -- it will just tell contributors the name of the tool. Contributors debugging a leaked fetchMock will not know where to look.
  TASK: Task 1

- [devx-minion]: The Quick Start section is missing `nvm use` before `npm install`, leaving a gap for contributors on a different Node version who will get a cryptic build failure.
  SCOPE: CONTRIBUTING.md -- "Quick Start" section
  CHANGE: Add `nvm use` (or equivalent: "If you use nvm, run `nvm use` first -- the .nvmrc pins Node 22") as the first step after `git clone`. The section currently goes straight from `cd web-resource-ledger` to `npm install`. A contributor on Node 18 will get an error from wrangler, not from npm install itself -- the error will look like a wrangler internals failure, not a Node version problem. This is the single most common onboarding failure for Cloudflare Workers projects.
  WHY: The plan correctly pins .nvmrc to 22 and engines to >=20. But CONTRIBUTING.md must close the loop: a contributor who skips the Node version step gets a confusing failure, not a clear "wrong Node version" message. TTFS is the metric -- this gap adds 5-15 minutes of confusion for a sizable fraction of first-time contributors.
  TASK: Task 1

- [devx-minion]: The "How This Project Is Built" section instruction says "do not emphasize the agent aspect" but the example phrasing still leads with "AI agent orchestration." The framing should lead with "transparent build process" and let the agent detail be secondary.
  SCOPE: CONTRIBUTING.md -- Step 8 "How This Project Is Built"
  CHANGE: The prompt instructs the implementing agent to write "WRL is built transparently using AI agent orchestration" as the lead sentence. This will read as an AI novelty pitch rather than project context, which undermines the "frame as project history" intent. Reframe: lead with "Each development phase is documented in docs/evolution/ -- including the prompt that initiated it, decisions made, and outcome" and let "using AI agent orchestration" appear as a descriptor, not the headline. The section's job is to orient contributors to the evolution log, not to announce the AI tooling.
  WHY: Contributors reading CONTRIBUTING.md are evaluating whether to contribute, not whether to be impressed by the build process. Front-loading AI agent language creates a signal that the project values novelty over craft, which may filter out exactly the experienced contributors this project wants. The plan's own framing goal ("frame the evolution log as project history and design rationale -- do not emphasize the agent aspect") contradicts the lead sentence in the prompt.
  TASK: Task 1
