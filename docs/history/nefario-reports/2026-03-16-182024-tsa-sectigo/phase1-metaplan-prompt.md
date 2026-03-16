MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task

Switch RFC 3161 TSA from DigiCert to Sectigo (#66)

RFC 3161 timestamps are reliably obtained for every capture because the TSA endpoint actually works from Cloudflare Workers. The current DigiCert TSA (timestamp.digicert.com) is HTTP-only (port 80) but the configured URL uses https://, causing silent failures on Workers where the HTTPS request hits port 443 and gets connection refused.

Success criteria:
- TSA_URL in wrangler.toml updated to Sectigo for both production and staging environments
- Captures on staging obtain RFC 3161 timestamps (verification page shows timestamp check as "pass" instead of "skip")
- All existing tests pass
- Documentation references to the TSA URL are updated

Scope:
- In: wrangler.toml TSA_URL vars (production and staging), any docs referencing the TSA endpoint
- Out: RFC 3161 implementation changes, multi-TSA failover, TSA selection UI

Constraints:
- Sectigo (http://timestamp.sectigo.com) -- supports HTTP and HTTPS, trusted root CA in all major stores, SHA-256, 99.9% stated SLA

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/tsa-sectigo

## Codebase Context (pre-analyzed)

Files that need changing (3 total):
1. wrangler.toml line 44: TSA_URL = "https://timestamp.digicert.com" (production vars)
2. wrangler.toml line 89: TSA_URL = "https://timestamp.digicert.com" (staging vars)
3. vitest.config.js line 28: TSA_URL: 'https://timestamp.digicert.com' (test bindings)

Files that reference DigiCert TSA but are HISTORICAL (do not modify):
- docs/evolution/0025-rfc3161-timestamps/* (historical evolution records)
- docs/history/nefario-reports/2026-03-16-160550-rfc3161-timestamps/* (historical nefario reports)

No test files hardcode the DigiCert URL -- they use env.TSA_URL from vitest.config.js.
No source code references DigiCert -- src/rfc3161.js uses the TSA_URL env var dynamically.

## External Skill Discovery
No external skills discovered in .claude/skills/ or .skills/ relevant to this task.

## Instructions
1. Read relevant files to understand the codebase context
2. Analyze the task against your delegation table
3. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning)
4. For each specialist, write a specific planning question
5. Return the meta-plan in structured format
6. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-OXpBDw/tsa-sectigo/phase1-metaplan.md
