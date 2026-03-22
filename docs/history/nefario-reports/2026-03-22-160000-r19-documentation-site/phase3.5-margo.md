# Margo -- Simplicity Review

## Verdict: ADVISE

The plan is well-proportioned to the problem. Six tasks for a 6-page static docs site with CI deployment is a reasonable 1:1 ratio. The key architectural decisions (11ty over ReDoc, CSS-only mobile nav, Workers Static Assets, Getting Started as homepage eliminating an interstitial page) all reduce complexity. No JS framework, no client-side rendering engine, no unnecessary services. The conflict resolutions are sound -- every one chose the simpler option.

Three non-blocking concerns:

---

- [simplicity]: `@apidevtools/swagger-parser` may be unnecessary when `@redocly/cli` (already a devDep) can bundle and dereference the spec
  SCOPE: Task 1 dependencies, Task 2 data pipeline (`site/_data/api.js`)
  CHANGE: Before adding `@apidevtools/swagger-parser` as a new dependency, check whether `redocly bundle openapi.yaml -o site/_data/openapi-bundled.json --dereferenced` produces a fully dereferenced JSON file that the 11ty data file can simply `JSON.parse`. If it does, the data pipeline becomes a build step plus a JSON import -- no additional dependency needed. The `yaml` package (already a root devDep) is also unnecessary if Redocly outputs JSON.
  WHY: The plan already uses `@redocly/cli` for linting. Using it for bundling too eliminates two dependencies (`@apidevtools/swagger-parser` and `yaml` in the site package.json) while keeping the same build-time dereferencing behavior. Fewer dependencies means fewer supply chain trust relationships and a simpler `site/package.json`. The dependency minimalism test: "What does swagger-parser give me that redocly bundle doesn't?" -- likely nothing for this use case.
  TASK: Task 1 (dependency list), Task 2 (data pipeline implementation)

- [simplicity]: Task 1 prompt specifies 12 deliverables with very granular CSS class names -- risk of over-specifying implementation details that constrain the executing agent unnecessarily
  SCOPE: Task 1 prompt
  CHANGE: No change required, but flag for awareness: the prompt prescribes specific CSS class names (`.docs-layout`, `.docs-sidebar`, `.docs-prose`, `.method-badge`, `.docs-endpoint`, `.docs-content`) and specific responsive breakpoints (768px). This is fine if the executing agent treats these as guidance rather than rigid requirements. If the build produces working, accessible HTML with design-system tokens, minor deviations from the prescribed class names should not trigger rework.
  WHY: Over-specified prompts can cause thrashing when the executing agent discovers that the prescribed structure doesn't quite fit 11ty's conventions or the design system's existing patterns. The success criteria are clear enough (semantic HTML, design system tokens, no client-side JS) to guide the work without the granular CSS spec. This is an observation, not a change request.
  TASK: Task 1

- [simplicity]: Copy-to-clipboard in Task 5 introduces the only client-side JS -- verify it stays truly minimal
  SCOPE: Task 5 (accessibility audit and final polish)
  CHANGE: The prompt says "~15 lines" -- enforce that literally. If the implementation exceeds 20 lines of JS (excluding whitespace/comments), it has grown beyond "progressive enhancement" into "feature." No polyfills, no fallback UI beyond hiding the button, no animation on copy success beyond a brief text change ("Copied!"). The `navigator.clipboard` check is the entire feature gate.
  WHY: The project philosophy is zero client-side JS. This is the single exception and it must stay small. The risk is not this specific feature but precedent -- once JS exists, future tasks will find it easier to add more. Keeping it ruthlessly minimal sets the right expectation.
  TASK: Task 5

---

### What the plan gets right

- **No unnecessary abstraction layers**: content goes from markdown/nunjucks straight to HTML. No intermediate data layer, no component framework, no state management.
- **Dependency count is low**: 11ty + syntax highlighting plugin + one OpenAPI parser (which could be zero if the Redocly suggestion is adopted). Compare this to a typical docs site with React, MDX, a bundler, a CSS-in-JS library, and a search engine.
- **Infrastructure is proportional**: one wrangler.toml, one GitHub Actions workflow, one Worker. No staging environment for the docs site (unnecessary for static content), no preview deployments, no edge functions.
- **Boring technology throughout**: 11ty (stable since 2018), Nunjucks (mature), Cloudflare Workers (GA since 2018), GitHub Actions (mature). Zero innovation tokens spent.
- **Scope discipline**: the "Out" list in the issue (Swagger UI, search, auth, localization, interactive API explorer) is respected. No scope creep detected.
- **Complexity budget**: approximately 2 points (one managed service for Workers Static Assets, one new build tool in 11ty). Well within budget for a docs site.
