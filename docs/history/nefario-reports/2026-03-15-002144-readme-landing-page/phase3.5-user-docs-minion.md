## user-docs-minion Review

**Verdict: APPROVE**

The documentation hierarchy is sound. Specific observations below.

### What works well

**README -> CONTRIBUTING.md cross-reference is correctly scoped.** The plan strips the bare `npm run dev` from README.md and replaces it with a single-sentence pointer to CONTRIBUTING.md. This is the right call. CONTRIBUTING.md already covers the nuance (full local dev requires paid plan, environment setup, test gotchas) -- duplicating any of that in README.md would create a maintenance split.

**README -> openapi.yaml pointer placement is correct.** The Usage section ends with an explicit pointer to openapi.yaml for all endpoints, schemas, and error codes. This positions README.md as the entry point for operators and evaluators, and openapi.yaml as the reference layer. The plan explicitly prohibits adding a separate "API Specification" subsection in Reference to prevent a redundant second pointer. Both decisions are correct.

**CAPTURE_API_KEY gap is real and the plan fills it properly.** The current README has no mention of CAPTURE_API_KEY. CONTRIBUTING.md line 21 already references it ("A `.dev.vars` file with `SIGNING_KEY` and `CAPTURE_API_KEY` set"), which means contributors arriving through CONTRIBUTING.md currently have to go find setup docs that don't exist. The plan documents CAPTURE_API_KEY at full parity with SIGNING_KEY (generation, production, local dev, security note) and adds a bridge sentence back to the Usage section. This closes the gap without duplicating content.

**Progressive disclosure is correctly structured.** The page order (positioning -> what you get -> usage -> setup -> reference) follows a clear evaluator-to-operator progression. First-time visitors get the value proposition before any setup asks. Operators get complete setup steps. Reference content (key rotation, public key endpoint) sits at the bottom for lookup, not in the onboarding flow. This matches the Divio framework's task-oriented and reference separation.

**Development section handled correctly.** One-line cross-reference to CONTRIBUTING.md is the right pattern. GitHub auto-surfaces CONTRIBUTING.md in the UI -- the README reference reinforces, not duplicates.

### One minor flag (not a blocker)

The plan removes the Deploy section as a standalone heading and folds `wrangler deploy` into Setup as Step 6. The current README has Deploy as its own heading, which means it is currently anchored (e.g., any external links using `#deploy`). This is low-impact for a young project with no established external documentation, and the numbered setup flow is clearly better UX. Not blocking -- just worth awareness at the approval gate.

### Nothing missing in the doc hierarchy

- README covers: evaluation, usage, operator setup, reference
- CONTRIBUTING.md covers: contributor setup, test environment, design philosophy, process
- openapi.yaml covers: full API spec, schemas, error codes
- docs/evolution/ covers: build history and rationale

No gaps between these layers. The plan does not introduce new content that would need a new file. The `.dev.vars.example` idea is correctly deferred to a future phase.
