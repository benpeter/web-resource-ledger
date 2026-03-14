# Phase 0013: Decisions

## 1. Information architecture: positioning -> usage -> setup

The current README opens with prerequisites and infrastructure commands before explaining what the product does. All four specialists (devx-minion, product-marketing-minion, user-docs-minion, ux-strategy-minion) agreed on the reorder. ux-strategy-minion framed it as serving the "Evaluator" persona first (most common first-time visitor), with "Implementer" content below the fold.

## 2. Placeholder hostname: `wrl.example.com` over `$WRL_URL`

- ux-strategy-minion recommended `$WRL_URL` (env var avoids copy-paste confusion)
- devx-minion recommended `wrl.example.com` (matches openapi.yaml, avoids second env var)
- Resolved in favor of `wrl.example.com`: consistency with the API spec matters more, and a note above the examples handles the copy-paste risk

## 3. Four usage steps (not three)

- product-marketing-minion and ux-strategy-minion recommended 3 steps (combine poll+retrieve)
- devx-minion recommended 4 steps (capture, poll, retrieve, verify) because the async API makes poll a distinct operation
- Resolved for 4 steps: hiding the async nature would confuse developers trying to use the API

## 4. Badge set: CI, license, despicable, vibe-coded (not Node version)

- user-docs-minion recommended 3 badges (CI, license, Node version)
- Issue requires despicable and vibe-coded badges
- Resolved with 4 badges, dropping Node version (visible in prerequisites and package.json)

## 5. `$WRL_API_KEY` in examples, `CAPTURE_API_KEY` in setup

- devx-minion recommended `$WRL_API_KEY` (follows `{PRODUCT}_{TYPE}` convention, shorter)
- Actual Cloudflare secret name is `CAPTURE_API_KEY`
- Resolved with both: usage shows `$WRL_API_KEY`, setup documents `CAPTURE_API_KEY` with explicit bridge sentence

## 6. "What you get" section included

- product-marketing-minion strongly recommended a separate artifact list between positioning and usage
- ux-strategy-minion preferred jumping straight to usage
- Resolved to include: 7-line bullet list communicates value faster than curl output, doesn't push usage below the fold

## 7. Key Rotation and Public Key Endpoint moved to Reference

- user-docs-minion recommended moving both to a Reference section at the bottom
- ux-strategy-minion recommended Key Rotation go to an Operations section
- Resolved to Reference: these are day-2 operations and third-party integrator reference, not first-time setup

## 8. Development section cross-references CONTRIBUTING.md

- user-docs-minion recommended removing the bare `npm run dev` and pointing to CONTRIBUTING.md
- The current `npm run dev` was misleading without context (needs Cloudflare account, env vars, etc.)
- CONTRIBUTING.md already has the full two-tier setup (zero-account Quick Start + full dev)

## 9. No `.dev.vars.example` file

- user-docs-minion flagged this as a gap
- Deferred: issue scope is README.md only, creating a new file is out of scope
