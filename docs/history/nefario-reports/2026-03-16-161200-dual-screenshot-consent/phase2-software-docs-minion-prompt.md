You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Issue #58: Dual-screenshot cookie consent dismissal for captures. Update documentation for the new dual-screenshot feature.

## Your Planning Question
What documentation artifacts need updating for dual-screenshot cookie consent?
1. `openapi.yaml` schema changes for captureSettings, dual screenshots, consent metadata
2. JSDoc updates for modified functions: `buildWacz()`, `buildWarc()`, `performCapture()`, `completeCapture()`, `defaultRenderer()`
3. WARC record order comments in `warc.js` -- now 5 records instead of 4
4. Header comments in `capture.js` (the session reuse/isolation model docs are extensive)
5. Should this warrant an ARCHITECTURE.md update documenting the capture pipeline stages?
6. What inline code comments should change to reflect the dual-screenshot pipeline?

## Context
Key files to read:
- `src/capture.js` -- extensive header comments documenting session reuse, isolation, security
- `src/wacz.js` -- header comments, JSDoc
- `src/warc.js` -- header comments, record order documentation
- `src/kv.js` -- JSDoc on completeCapture()
- `openapi.yaml` -- current API spec

## Instructions
1. Read the source files listed above for existing documentation patterns
2. Identify all documentation that needs updating
3. Prioritize: what's essential vs. nice-to-have
4. Return your contribution in structured format
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-software-docs-minion.md`
