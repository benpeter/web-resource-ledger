You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Issue #58: Dual-screenshot cookie consent dismissal for captures. Extend API responses for dual screenshots and consent metadata.

## Your Planning Question
How should API responses evolve for dual screenshots and consent metadata?
1. The `artifacts` object currently has `screenshot` (single key). Options: rename to `screenshotBefore`/`screenshotAfter`, use an array, or keep `screenshot` as primary + add `screenshotBefore`?
2. Backward compatibility: existing consumers expect `artifacts.screenshot`. Breaking change?
3. Where does `captureSettings` appear in the retrieval response (`GET /v1/captures/:id`)?
4. Verification endpoint: how to present consent metadata? New check? Informational field?
5. When autoconsent fails, should `artifacts.screenshot` point to the before (only) screenshot?
6. Screenshot URL paths in R2: `captures/{id}/screenshot-before.png` and `captures/{id}/screenshot-after.png`?

## Context
Key files to read:
- `openapi.yaml` -- current API spec, capture response schema, artifacts schema
- `src/kv.js` -- current artifacts shape in completeCapture()
- `src/verify-page.js` -- verification page, current screenshot display

## Instructions
1. Read the source files listed above
2. Design the API schema evolution with backward compatibility
3. Propose concrete OpenAPI schema changes
4. Return your contribution in structured format
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0dmgCV/dual-screenshot-consent/phase2-api-design-minion.md`
