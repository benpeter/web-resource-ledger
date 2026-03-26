## Gru Technology Assessment: seo-geo-pass

**Verdict: ADVISE**

---

### Assessment Summary

The plan is technically sound overall. Schema type choices are correct, the llms.txt approach is appropriate for WRL's target audience, and the implementation strategy (inline JSON-LD, no plugins, static generation) aligns with the project's KISS philosophy. One item needs a correction before execution: the HowTo JSON-LD is targeting a Google rich result that Google retired in 2024.

---

### Advisories

- [HowTo JSON-LD]: Google deprecated HowTo rich results in 2024 -- they are no longer shown on desktop or mobile. The HowTo markup the plan specifies is inert for SEO rich result purposes.
  SCOPE: `landing/public/index.html` -- Task 2, Step 4 (HowTo JSON-LD block)
  CHANGE: Keep the HowTo JSON-LD block, but do not justify it as a Google rich result opportunity. Justify it purely as GEO/AI extractability signal -- structured step-by-step content that AI retrieval pipelines can parse. The block is still worth including; the rationale just needs to be accurate so the team does not expect rich result impressions in Search Console and mistake their absence for an implementation error.
  WHY: If the team expects HowTo rich results in Search Console and sees none, they will waste debugging time assuming the structured data is malformed. Calibrating expectations now prevents that loop.
  TASK: Task 2

---

### Technology Confirmations (No Action Required)

**llms.txt -- correct call for this product.** As of March 2026, llms.txt remains a community proposal (not IETF/W3C). Google explicitly does not support it (Gary Illyes stated this in July 2025 and compared it to the deprecated keywords meta tag). However, adoption is concentrated exactly where WRL operates: developer tools, AI-native companies, technical documentation sites. Anthropic, Cursor, and Vercel all publish it. For a product with an MCP server targeting AI agent workflows, the signal is in the right channel. The plan's implementation follows the spec correctly (Markdown format, curated link list, concise summary block). Low cost, right audience. Confirmed appropriate.

**SoftwareApplication + AggregateOffer -- correct and current.** Google's January 2026 structured data deprecations removed: Course Info, Claim Review, Estimated Salary, Learning Video, Special Announcement, Vehicle Listing, and Practice Problems. SoftwareApplication is not on that list and remains a supported rich result type. The plan's AggregateOffer with lowPrice: "0" correctly represents the freemium model per Google's own guidance for freemium SaaS. The decision to keep SoftwareApplication over Product type is validated -- SoftwareApplication is the more specific type and Google treats it as such for software products.

**FAQPage JSON-LD -- still active.** FAQPage structured data was reduced to desktop-only display in 2023, but it was not fully deprecated in the January 2026 round. It remains a valid rich result type. The plan correctly requires that visible FAQ content matches the JSON-LD content (Google's validation requirement).

**GEO strategy alignment.** The plan's approach -- FAQ section, factual density, specific numbers (200 captures/month, EUR 0.05, Ed25519, RFC 3161, FRE 901(b)(9)) -- matches 2026 GEO best practices: structured content for extraction, citation-worthy specifics, definition-lead copy. No gaps identified.

---

### One Observation (Not an Advisory)

The plan notes "HUMAN_ACTION_REQUIRED: Verify both sites in Google Search Console and submit sitemaps" as a verification step. This is correct to call out. The Google Search Console verification meta tag is not in scope for this pass, which means search console verification remains unblocked work after this PR merges. Worth tracking in backlog if not already there.

---

### Sources Consulted

- [Is llms.txt Dead? The Current State of Adoption in 2025](https://llms-txt.io/blog/is-llms-txt-dead)
- [Should Websites Implement llms.txt in 2026?](https://www.linkbuildinghq.com/blog/should-websites-implement-llms-txt-in-2026/)
- [What Is llms.txt? – Semrush](https://www.semrush.com/blog/llms-txt/)
- [Software App (SoftwareApplication) Schema – Google Search Central](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Google Dropped 7 Schema Types – What Still Drives Clicks](https://serpclix.com/blog/google-dropped-7-schema-types-what-still-works)
- [Changes to HowTo and FAQ rich results – Google Search Central Blog](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Simplifying the search results page – Google Search Central Blog](https://developers.google.com/search/blog/2025/06/simplifying-search-results)
- [Mastering generative engine optimization in 2026 – Search Engine Land](https://searchengineland.com/mastering-generative-engine-optimization-in-2026-full-guide-469142)
