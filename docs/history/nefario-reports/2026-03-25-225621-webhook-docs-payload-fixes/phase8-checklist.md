# Phase 8a: Documentation Assessment Checklist

## Items

### MUST

1. **[software-docs] OpenAPI spec: PingResponse schema missing new fields** (Task 2)
   - `signatureHeader`, `timestampHeader`, `sentPayload` added to ping response but not in PingResponse schema
   - Ping response examples need updating
   - File: `openapi.yaml` lines 1033-1057

2. **[software-docs] OpenAPI spec: WebhookEventPayload example uses wrong field names** (Task 3)
   - Example shows `data.id` instead of `data.captureId`
   - Example shows `data.createdAt` (not sent by code)
   - Example shows `renderQuality` (not sent by code)
   - Example shows `verifyUrl` instead of `verificationUrl`
   - Missing `verificationUrl` on failed event example
   - File: `openapi.yaml` lines 1099-1125

### SHOULD

3. **[software-docs] OpenAPI spec: capture.quarantined payload fields undocumented**
   - `quarantineReason` and `quarantinedAt` fields in quarantined payload not in spec data description
   - File: `openapi.yaml` lines 1092-1098

4. **[software-docs] OpenAPI spec: changeDetection conditional block not documented**
   - `capture.complete` can include `changeDetection` object when `changeSummary` exists
   - Not reflected in spec examples or data description

### Verified (addressed in Phase 4)

- ✅ Docs site (`site/content/webhooks.md`): All 9 documentation fixes applied in Task 3
- ✅ `capture.quarantined` documented in webhooks.md
- ✅ `changeDetection` documented in webhooks.md
- ✅ Ping signature echo documented in webhooks.md
- ✅ Retry schedule label corrected in webhooks.md
- ✅ `updatedAt` in list response documented in webhooks.md

### Not applicable

- Landing page: No pricing/tier changes, no new headline capabilities
- MCP server: Webhook endpoints not exposed as MCP tools (unchanged)
- Legal pages: No new data collection or third-party services
