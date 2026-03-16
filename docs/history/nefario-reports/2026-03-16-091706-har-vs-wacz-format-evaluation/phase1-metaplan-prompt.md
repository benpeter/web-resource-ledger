MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
Should we switch the archive format to HAR? Are we already taking advantage of the Playwright capability for HAR recording?

Context from codebase review:
- WRL uses @cloudflare/playwright for browser rendering (src/capture.js)
- Current capture pipeline: screenshot (PNG) + rendered HTML + HTTP headers (via separate Workers fetch)
- Artifacts bundled into WACZ format (ZIP containing WARC records + SHA-256 manifest + Ed25519 signature)
- NO Playwright HAR capabilities are currently used (no recordHar, routeFromHAR)
- Playwright offers browserContext.recordHar() which captures all network traffic as HAR files
- The WACZ format was a deliberate MVP decision (see docs/evolution/0001-kickoff/decisions.md)

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
No project-local skills exist.

## Instructions
1. Read relevant files to understand the codebase context (especially src/capture.js, src/wacz.js, src/warc.js, docs/MVP.md)
2. This is a focused technical advisory — identify 2-3 specialists max. Don't over-staff for what is essentially a format comparison question.
3. For each specialist, write a specific planning question.
4. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-D6WP0B/har-vs-wacz-format-evaluation/phase1-metaplan.md
