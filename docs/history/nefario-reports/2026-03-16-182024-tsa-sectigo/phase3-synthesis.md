# Delegation Plan: Switch RFC 3161 TSA from DigiCert to Sectigo

## Task Summary
Replace the DigiCert TSA URL with Sectigo's HTTPS endpoint in all configuration files. 3-line change across 2 files.

## Execution Plan

### Task 1: Update TSA URL configuration
- **Agent**: iac-minion (sonnet)
- **Mode**: bypassPermissions
- **Dependencies**: none
- **Gate**: none
- **Deliverables**: Updated wrangler.toml (2 lines) and vitest.config.js (1 line)

**Prompt**:
You are making a targeted configuration change to switch the RFC 3161 TSA provider from DigiCert to Sectigo.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/tsa-sectigo

Make these exact replacements:

1. In `wrangler.toml` line 44 (production [vars]):
   Change: `TSA_URL = "https://timestamp.digicert.com"`
   To:     `TSA_URL = "https://timestamp.sectigo.com"`

2. In `wrangler.toml` line 89 (staging [env.staging.vars]):
   Change: `TSA_URL = "https://timestamp.digicert.com"`
   To:     `TSA_URL = "https://timestamp.sectigo.com"`

3. In `vitest.config.js` line 28 (test bindings):
   Change: `TSA_URL: 'https://timestamp.digicert.com',`
   To:     `TSA_URL: 'https://timestamp.sectigo.com',`

Do NOT modify any other files. Historical docs and evolution logs are out of scope.

After making changes, verify by reading both files to confirm the replacements are correct.

## Execution Order
1. Task 1 (no dependencies, no gates)

## Risks
None. This is a string replacement in configuration files with no behavioral change to code.

## Conflicts
None. No specialist planning was conducted (none needed).
