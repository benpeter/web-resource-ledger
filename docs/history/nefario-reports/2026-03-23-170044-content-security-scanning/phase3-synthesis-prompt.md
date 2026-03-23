MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
WRL checks URLs against Google Safe Browsing before capture and periodically re-scans existing captures, preventing the platform from being used to archive or serve known-malicious content. Flagged captures are quarantined with metadata preserved but artifact access restricted.

Success criteria: pre-capture URL screening, HTTP 422 rejection with threat type, Cron Trigger re-scan, quarantined artifact returns 451, quarantine status in metadata, Coralogix alert >5/24h, graceful degradation on API failure, API key as Worker secret.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase2-data-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase2-observability-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase2-software-docs-minion.md

## Key consensus across specialists:

1. security-minion: Use Google Web Risk Lookup API (not Safe Browsing -- commercial restriction). Stateless, fits Workers. Platform-level key. Fail-open pre-capture with re-scan safety net. Quarantine is one-way (no auto-restore).
2. data-minion: Hybrid schema -- quarantine columns on captures + audit table. Quarantine orthogonal to lifecycle status (complete AND quarantined). Migration 0009.
3. api-design-minion: HTTP 422 for rejection, HTTP 403 (not 451) for quarantined artifacts. Metadata returns 200 with artifact URLs stripped. Quarantined visible in list by default. New webhook event.
4. iac-minion: Dedicated daily cron (0 3 * * *) for re-scan -- 15min CPU budget. Confirms Web Risk API. No batch API (one URL per call). Rate limit 6000 req/min.
5. observability-minion: Two alerts -- quarantine spike (>5/24h, P3) and API failures (>2/10min, P2). Subsystem "security". Four log events. Fail-closed vs fail-open is product decision.
6. test-minion: Follow injectable dependency pattern. fetchMock for Web Risk API. Direct worker.scheduled() for cron tests.
7. ux-strategy-minion: "Content restricted" terminology user-facing. Proposes contentRestriction overlay instead of status:"quarantined". Don't show threat types to tenants. Graceful degradation invisible to users.
8. software-docs-minion: 10 doc tasks. Provider-agnostic "threatCheck" naming. OpenAPI, README, runbook, alert docs.

## Key Conflicts to Resolve:
- **451 vs 403**: Issue spec says 451, api-design-minion says 403 (451 is for legal demands, not reputation). Need to decide.
- **status:"quarantined" vs contentRestriction overlay**: Issue spec says status:"quarantined", ux-strategy-minion says keep status:"complete" with overlay. Breaking change concern vs simplicity.
- **Fail-open vs fail-closed pre-capture**: security-minion says fail-open, observability-minion says product decision. Issue spec says "capture proceeds" (fail-open).
- **Field naming**: "safeBrowsing" vs "threatCheck" -- provider-agnostic vs descriptive.
- **Safe Browsing vs Web Risk**: Both security-minion and iac-minion flag that Safe Browsing is non-commercial. Web Risk is the correct API. BUT: the issue spec says "Safe Browsing". Decision needed on naming throughout.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions (read the scratch files)
2. Resolve all conflicts between recommendations with clear rationale
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format with:
   - Numbered tasks with complete, self-contained prompts
   - Agent assignments and model selections
   - Dependencies between tasks
   - Approval gates where needed
   - For each task: what to do, which files to create/modify, deliverables
5. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase3-synthesis.md`

Important constraints:
- This is a Cloudflare Worker project (JavaScript, not TypeScript)
- Follow existing code patterns in the codebase
- CLAUDE.md mandates: YAGNI, KISS, fail loudly, test real boundaries
- wrangler.test.toml must be regenerated if wrangler.toml changes (remove [[queues.consumers]] sections)
- The issue says "Safe Browsing" but we may need to use Web Risk API -- decide and document
