Investigate the 25s NAV_TIMEOUT_MS constraint in capture.js and evaluate a staged fallback strategy for heavy pages that timeout.

Current situation: page.goto uses waitUntil:'networkidle' with a 25s timeout inside a 30s ctx.waitUntil budget. Heavy sites like tagesschau.de never reach networkidle within 25s and fail entirely -- losing the capture.

Proposed approach: staged fallback -- if the 25s networkidle timeout fires, check if the page has already passed DOMContentLoaded or load events. If yes, capture whatever we have (screenshot + rendered HTML at that point) and mark the capture with metadata indicating it was a partial/degraded capture (e.g., a field like renderQuality: 'partial' or waitUntil: 'timeout-after-load'). This way heavy pages still produce usable evidence rather than failing entirely.

Key questions:
1. Is 30s ctx.waitUntil actually hard on the paid Workers plan, or can it be extended?
2. Is the staged fallback approach sound from a security and evidence-integrity perspective?
3. What metadata should accompany a degraded capture so consumers know what they got?
4. Should we try domcontentloaded first with a short timeout, then networkidle with remaining budget?
5. Does this affect WACZ signing integrity claims?
