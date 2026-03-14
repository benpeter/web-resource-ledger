MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task

<github-issue>
## Goal
Signed WACZ bundles stored in R2, verifiable via signing round-trip test.

## Context
Capture endpoint exists and browser rendering produces raw artifacts (Step 3 complete). This step packages those artifacts into a standards-based WACZ bundle, computes integrity hashes, signs with Ed25519, and writes to R2.

## Work Items
- [ ] WARC records constructed via `warcio.js`; CDXJ index generated from WARC records
- [ ] SHA-256 hash computed per artifact (HTML, screenshot, headers, WARC)
- [ ] `datapackage.json` manifest assembled with per-artifact hashes
- [ ] `bundleHash` = SHA-256 of canonical JSON (keys sorted alphabetically, no whitespace)
- [ ] Ed25519 key pair: private key as base64-encoded raw 32 bytes from `crypto.generateKey("Ed25519")` + `exportKey("raw")`, stored as `wrangler secret` named `SIGNING_KEY`
- [ ] Public key derived at Worker startup from the stored private key
- [ ] Manifest `signatures` array receives one entry of `type: "self"` containing the Ed25519 signature over `bundleHash`
- [ ] WACZ ZIP written to R2 at `captures/{sha256}.wacz`
- [ ] Capture metadata (ID, URL, timestamp, artifact locations) written to KV
- [ ] Document key generation procedure in README
- [ ] Test: canonical JSON stability (same input always produces identical bytes)
- [ ] Test: signing round-trip (sign then verify returns true)

## Acceptance Criteria
- `vitest run` signing round-trip test passes
- `vitest run` canonical JSON stability test passes (deterministic serialization)
- R2 contains a `.wacz` object after a capture completes in `wrangler dev`
- Key generation procedure documented in README (`wrangler secret put SIGNING_KEY`)

## Dependencies
- Blocked by: #3
- Blocks: #5

## Technical Notes
- The signing key MUST NEVER be committed to VCS or appear in `wrangler.toml` -- use `wrangler secret put SIGNING_KEY` for both local dev (`.dev.vars`) and production
- Canonical JSON stability is critical: `bundleHash` must be deterministic -- always sort keys alphabetically and strip all whitespace before hashing
- The `signatures` array structure is designed to accommodate RFC 3161 TSA timestamps later without format changes -- keep it as an array, not a single signature field
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## Codebase Context

This is a Cloudflare Worker project (vanilla JS, no framework). Key existing files:
- src/index.js -- Router with 3 routes (health, create capture, capture status)
- src/capture.js -- Browser rendering pipeline (Puppeteer, stores artifacts in R2, updates KV)
- src/kv.js -- KV access layer (create/complete/fail/get capture records)
- src/auth.js -- API key auth (timing-safe comparison)
- src/url-validation.js -- SSRF prevention
- src/responses.js -- JSON/problem response helpers
- wrangler.toml -- R2 bucket (BUCKET), KV namespace (KV), rate limiter, browser binding
- vitest.config.js -- Cloudflare Workers vitest pool config
- 7 test files, 191 passing tests
- package.json -- dependencies: @cloudflare/puppeteer; devDeps: vitest, @cloudflare/vitest-pool-workers, wrangler

Current capture flow: POST /v1/captures -> validate URL -> auth check -> rate limit -> create KV record (pending) -> ctx.waitUntil(performCapture) -> 202. performCapture renders with Puppeteer, stores screenshot.png, rendered.html, headers.json in R2 at captures/{captureId}/, updates KV to complete/failed.

Step 4 needs to add WACZ bundling AFTER existing artifacts are stored: take the existing R2 artifacts, construct WARC records, build a manifest with hashes, sign, and write a .wacz ZIP bundle back to R2.

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan
(see your Core Knowledge for the output format).

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution -- planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase1-metaplan.md`
