# Meta-Plan: Restructure README as Project Landing Page

## Scope

**In scope**: Restructuring `README.md` content and ordering. Adding positioning/why section, curl-based usage examples (derived from `openapi.yaml`), `CAPTURE_API_KEY` setup documentation, despicable-agents mention, and two badges (despicable badge + vibe-coded-badge-action badge). Preserving all existing setup instructions.

**Out of scope**: Changes to `openapi.yaml`, source code, new documentation files, evolution log structure, `CLAUDE.md`. This is a single-file documentation task touching only `README.md`.

## Task Analysis

This task is primarily a **developer documentation / product positioning** task on a single file (`README.md`). The core challenge is information architecture: restructuring existing content and adding new content so the README serves as an effective landing page. The task requires:

1. **Product positioning expertise** -- Articulating what WRL does and why it matters in 1-2 sentences beyond the existing tagline. The current README jumps straight to prerequisites without explaining the value proposition.
2. **Developer experience expertise** -- Crafting curl-based usage examples that demonstrate the core capture-poll-retrieve-verify flow. The examples must be derived from `openapi.yaml` examples (which are comprehensive) but presented as a coherent narrative, not a spec reference.
3. **Documentation structure expertise** -- Ordering and structuring sections so the README follows landing-page conventions: hook (why) -> show (usage) -> enable (setup).
4. **Usability/journey review** -- Ensuring the restructured README serves the first-time-visitor journey from "what is this?" to "how do I use it?" to "how do I set it up?" without friction.

The task explicitly defines what each section should contain and the ordering, which constrains creative latitude. The main planning questions are about execution quality within those constraints.

## Planning Consultations

### Consultation 1: Developer Experience Review

- **Agent**: devx-minion
- **Planning question**: Given the WRL API flow (POST /v1/captures with Bearer auth -> poll status -> GET capture record -> GET artifacts -> GET /v1/verify), what is the most effective way to present curl-based usage examples in a README? Specifically: (a) Should the examples show the full async flow (capture, poll, retrieve, verify) as a numbered walkthrough or as separate code blocks? (b) How should we handle the CAPTURE_API_KEY in examples -- placeholder like `$WRL_API_KEY` or a literal fake token? (c) The capture ID acts as the access secret for retrieval (no auth needed for GET endpoints) -- should the examples highlight this distinction or keep it implicit? (d) Should we include error response examples or keep to the happy path?
- **Context to provide**: Current `README.md`, `openapi.yaml` (especially the examples in paths), `CONTRIBUTING.md` (which already mentions CAPTURE_API_KEY in .dev.vars), the fact that the capture endpoint requires Bearer auth but retrieval/verify do not.
- **Why this agent**: devx-minion specializes in developer onboarding and API usage patterns. The curl examples are the make-or-break element for first-time adoption -- they need to be copy-paste-runnable and clearly demonstrate the workflow.

### Consultation 2: Product Positioning

- **Agent**: product-marketing-minion
- **Planning question**: Given that WRL provides tamper-evident web archival with Ed25519-signed WACZ bundles on Cloudflare Workers, what is a compelling 2-3 sentence positioning statement that explains both WHAT it does and WHY someone would want it? Consider these audiences: (a) developers who need verifiable web evidence (legal, compliance, journalism), (b) developers evaluating archival tools (vs. Wayback Machine, Scoop, etc.), (c) open-source contributors browsing GitHub. The current tagline is "Tamper-evident archival of web resources -- captures rendered screenshots, HTML snapshots, HTTP headers, and resource manifests as cryptographically signed, immutable bundles." -- this describes WHAT but not WHY. Also: how should the despicable-agents mention be woven in naturally? The task says "natural, not promotional -- it's part of the project's story." The project's CLAUDE.md says it "serves a dual purpose: it is a real product AND a showcase of how despicable-agents can build software from scratch."
- **Context to provide**: Current README, `docs/evolution/README.md` (showing the 12 documented build phases), package.json description, the despicable-agents badge format from the despicable-agents repo.
- **Why this agent**: The positioning section is the first thing visitors read. product-marketing-minion can articulate the value proposition and competitive differentiation in a way that hooks the right audiences without being salesy.

### Consultation 3: Documentation Structure

- **Agent**: user-docs-minion
- **Planning question**: Given the target README structure (positioning/why -> usage examples -> setup/deploy), how should we handle: (a) The relationship between the new "Usage" section and the existing terse "API" section at the bottom -- merge, replace, or keep both? (b) Badge placement -- top of file (conventional) or after the tagline? (c) The existing "Key Rotation" and "Public Key Endpoint" subsections are currently under setup -- should they stay there or move to a separate "Operations" or "Reference" section to keep the setup path focused on first-time deployment? (d) The CONTRIBUTING.md already mentions `CAPTURE_API_KEY` in `.dev.vars` -- should the README cross-reference CONTRIBUTING.md for local dev or be fully self-contained?
- **Context to provide**: Current README structure, `CONTRIBUTING.md`, the task's success criteria (especially "CAPTURE_API_KEY documented at parity with SIGNING_KEY" and "all existing setup instructions preserved").
- **Why this agent**: user-docs-minion specializes in user guides and progressive disclosure. The README restructure is essentially a user guide redesign -- the question is how to order information for progressive complexity (quick start -> full setup -> advanced operations).

## Cross-Cutting Checklist

- **Testing** (test-minion): NOT needed for planning. This task produces no executable code -- only markdown content. The existing CI (`npm run lint:api`) validates openapi.yaml, not README. No test strategy needed.
- **Security** (security-minion): NOT needed for planning. The task documents an existing secret (CAPTURE_API_KEY) -- it does not introduce any new attack surface, auth mechanism, or dependency. The documentation should include the existing security notes about not committing secrets, which is already established pattern from the SIGNING_KEY docs.
- **Usability -- Strategy** (ux-strategy-minion): ALWAYS include. **Planning question**: Review the proposed README structure (positioning/why -> usage examples -> setup/deploy) as a first-time visitor journey. What cognitive load issues exist in the current README? Is the proposed ordering optimal, or should any adjustments be made? Specifically: is there a risk that the usage examples section becomes too long before the reader reaches setup (which they need to complete before the examples actually work)?
- **Usability -- Design** (ux-design-minion, accessibility-minion): NOT needed. The README is rendered markdown on GitHub -- no UI components, visual layouts, or interaction patterns to review. Markdown rendering is handled by GitHub's platform.
- **Documentation** (software-docs-minion and/or user-docs-minion): Covered by Consultation 3 (user-docs-minion). software-docs-minion is NOT separately needed -- there are no architectural or API surface changes, just documentation restructuring. The user-docs-minion consultation covers the documentation structure question.
- **Observability** (observability-minion, sitespeed-minion): NOT needed. No runtime components, services, or web-facing code produced.

## Anticipated Approval Gates

**One gate expected: the restructured README content.**

This is a single-deliverable task modifying one file. The README structure and positioning are high blast radius (every visitor sees them) but easy to reverse (it's a markdown file). Under the gate classification matrix, this is "easy to reverse + high blast radius" = OPTIONAL gate. However, the positioning statement involves judgment where multiple valid approaches exist (how to articulate "why" and how to frame the despicable-agents mention), which triggers the supplementary rule. **Recommend one approval gate after the README draft**, before merge.

No other gates -- there are no sequential dependencies within this task.

## Rationale

This task requires three specialists for planning (devx-minion, product-marketing-minion, user-docs-minion) plus the mandatory ux-strategy-minion consultation. The split reflects the three distinct challenges:

1. **devx-minion** owns the curl examples -- the most technically demanding part of the README, requiring accurate API flow representation and developer-friendly formatting.
2. **product-marketing-minion** owns the positioning statement -- the most subjective part, requiring the right balance of technical credibility and value articulation, plus the natural despicable-agents integration.
3. **user-docs-minion** owns the information architecture -- how sections relate to each other, what stays/goes/moves, and how to handle the existing content without losing anything.
4. **ux-strategy-minion** provides the cross-cutting journey review to ensure the three specialists' contributions form a coherent first-time visitor experience.

Agents deliberately excluded from planning:
- **software-docs-minion**: No architecture or API surface changes. user-docs-minion covers the README-as-user-guide aspect.
- **api-spec-minion / api-design-minion**: The openapi.yaml is explicitly out of scope. Examples are derived from it but the spec itself is not changing.
- **frontend-minion**: No code changes.
- **security-minion**: Documenting an existing secret does not require security planning.
- **test-minion**: No testable output.

For execution, this will likely be a single task assigned to user-docs-minion (or software-docs-minion) with the planning input from all four specialists incorporated into the prompt. It's a one-file deliverable with no parallelism needed.

## External Skill Integration

### Discovered Skills

No external skills detected in project. The `.claude/skills/` and `.skills/` directories do not exist in the working directory. User-global skills (`~/.claude/skills/`) include obsidian-tasks, transcribe, juli, daily-recap, recap, session-review, srf-gruppennewsletter, copy-rtf, despicable-prompter, and nefario -- none are relevant to README content authoring.

### Precedence Decisions

No precedence decisions needed -- no external skills overlap with the task domain.
