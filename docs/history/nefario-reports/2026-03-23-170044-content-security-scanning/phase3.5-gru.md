# Gru Technology Review -- Content Security Scanning

**Verdict: APPROVE**

All four questions answered below.

---

## 1. Web Risk API vs Safe Browsing v4 for Commercial SaaS

**Correct choice. Non-negotiable.**

Safe Browsing v4 Terms of Service explicitly prohibit use "for sale or revenue generating purposes." WRL has Stripe billing and paid tiers -- this is unambiguously commercial use. Using Safe Browsing v4 in production would expose the project to ToS violation risk.

Web Risk is the correct commercial equivalent. Same Google threat data, same threat type taxonomy (MALWARE, SOCIAL_ENGINEERING, UNWANTED_SOFTWARE), Google Cloud billing instead of ToS restrictions. The synthesis correctly identifies this and even names the reason. No issue here.

The provider-agnostic API naming (`threatCheck` in external API, `threat-check.js` module) is sound defensive architecture. If Web Risk pricing becomes untenable, switching to an alternative backend does not break the API contract.

## 2. Lookup API (Stateless) vs Update API (Local Cache) for Cloudflare Workers

**Lookup API is correct for this deployment target.**

The Update API requires maintaining a local threat hash database. Cloudflare Workers have no persistent local storage between requests -- Workers are stateless by design. The Update API pattern assumes a long-lived process that can apply incremental diffs and cache the database in memory. That is fundamentally incompatible with Workers architecture.

The Lookup API (stateless, per-request HTTPS call) is the only viable option for Workers. The synthesis correctly identifies this. The prompt.md constraint ("use Update API with local cache if Lookup API is too slow") is a fallback that cannot apply on Workers -- the implementing agent should be aware this constraint is architecturally impossible in this environment, not just suboptimal.

One legitimate concern: the 2000ms timeout is aggressive. The Web Risk API endpoint is `webrisk.googleapis.com`, an external HTTPS call from Workers. Cloudflare Workers have a 50ms CPU time limit on the free plan but wall-clock time is more generous. The 2000ms timeout should be sufficient for pre-capture checks but could add 200-2000ms of tail latency on cold network paths. The synthesis correctly gates on "must not add >200ms" -- this constraint needs to be verified empirically, not assumed.

## 3. Cost Projections -- Free Tier vs Paid Tier

**100K/month free tier is realistic for current WRL scale. Paid tier math is correct.**

Verified pricing (Google Cloud, March 2026):
- First 100,000 calls/month: $0
- 100,001 to 10,000,000 calls: $0.50 per 1,000 calls
- Beyond 10M: contact sales

For WRL at early SaaS scale (hundreds to low thousands of captures/day), the free tier covers it comfortably. At 3,000 captures/day that is ~90,000/month -- just under the free tier ceiling.

**Important nuance the synthesis does not call out explicitly**: the daily re-scan cron will multiply API calls. If WRL has 50,000 existing captures and runs a daily re-scan, that is 50,000 additional calls/day. The synthesis uses de-duplication by URL (GROUP BY url in `listCapturesNeedingThreatCheck`), which is the right mitigation -- many captures may share the same URL. The implementing agent must ensure the dedup logic is in place before the cron runs at scale, or the free tier will be exhausted quickly.

Rate limit: 6,000 requests/minute (100 req/sec). The cron limit of 500 URLs per run (the `limit = 500` in `listCapturesNeedingThreatCheck`) is well within this. No throttling concern at current scale.

**Cost at modest scale (500K calls/month)**: $200/month. At 10x growth: $2,000/month. These are real costs the operator should factor into pricing. Not blocking, but worth monitoring as volume grows.

## 4. Alternative URL Reputation Services

**Web Risk is the right call for this stack, but the operator should know the alternatives.**

| Service | Free Tier | Paid | Notes |
|---------|-----------|------|-------|
| Google Web Risk | 100K/month | $0.50/1K | Correct commercial choice for this use case |
| Cloudflare Gateway (zero-trust) | N/A | Requires Teams subscription | Only relevant if using CF's own threat feeds; no per-URL API |
| VirusTotal | 500/day (4 req/min) | $0.50-2.00/query depending on tier | Much stricter free tier; better for file hash scanning than URL screening at volume |
| URLhaus (abuse.ch) | Free | Free (CC BY) | Open threat feed, malware-focused. Good complement, not a replacement. Can be polled as a local blocklist |
| PhishTank | Free | Free | Phishing only; coverage narrower than Web Risk |
| Cisco Talos | Contact sales | Enterprise | Overkill for current scale |

**Recommendation for now**: Web Risk is the right choice. The free tier fits current scale, the API is stable (GA since 2019), and it is a Google Cloud product with SLA-backed uptime. The provider-agnostic naming in the implementation means adding a supplementary feed (e.g., URLhaus as a free local blocklist for known malware domains) later would be additive, not a replacement.

If the operator wants defense-in-depth at zero marginal cost, URLhaus publishes a daily domain blocklist (CC BY license, no commercial restrictions) that could be loaded into Workers KV as a local lookup before hitting Web Risk. That is YAGNI for now but worth noting as a future option.

---

## Summary

All technology decisions in the synthesis are sound. The Web Risk API choice is not just a preference -- it is the only legally compliant option for a commercial SaaS. The Lookup API is the only architecturally viable option for Cloudflare Workers. The cost model is realistic with one caveat: the re-scan cron's URL deduplication must be verified in the implementation to prevent free tier exhaustion.

No blocking issues. Proceed to implementation.

**APPROVE**
