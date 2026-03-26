## UX Strategy Review — seo-geo-pass

**Verdict: ADVISE**

---

### Assessment Summary

The plan is coherent and the invisible SEO changes (meta tags, canonical URLs, structured data, sitemaps, robots.txt, llms.txt) are straightforwardly good. They add signal without adding user-facing complexity. No concerns there.

The one area requiring guidance is the **visible 8-question FAQ section** on the landing page.

---

### Finding

- [usability]: The 8-question FAQ substantially duplicates content already present in dedicated landing page sections, adding scroll depth without proportional user value.

  SCOPE: `landing/public/index.html` — FAQ section (Task 2, step 5)

  CHANGE: Reduce the FAQ to 3–4 questions that address prospect anxieties not already answered by existing page sections. Specifically:

  **Keep (genuinely new or synthesizing):**
  1. "How does WRL differ from a screenshot or PDF?" — This is the core differentiating argument. It currently exists only implicitly, scattered across the hero, features, and use cases sections. A direct answer consolidates it usefully.
  2. "Is WRL evidence admissible in court?" — The legal use case card covers FRE 901/902 and eIDAS, but the FAQ answer adds the critical caveat ("consult legal counsel") that the use case card omits. That nuance matters for prospects evaluating legal risk.
  3. "Can I verify a capture without an account?" — This is a high-anxiety friction point for prospects deciding whether to trust the service. The hero mentions it in passing but a direct FAQ answer addresses the trust question explicitly.
  4. "Can I self-host WRL?" — Open-source and self-hosting is a genuine differentiator. The features section mentions it in one sentence. A FAQ answer gives it the prominence it deserves for a developer audience evaluating vendor lock-in.

  **Remove (already covered in dedicated sections above the fold):**
  - "What is Web Resource Ledger?" — The hero, tagline, and use cases section answer this. FAQ is the wrong format for a definition; it signals that the existing messaging isn't landing.
  - "What is a WACZ file?" — The features section covers this. A WACZ definition is implementation detail, not a prospect concern.
  - "How does pricing work?" — The pricing section is directly above the FAQ. Restating it in Q&A format is pure duplication.
  - "Does WRL work with AI agents?" — The Use Cases section has a dedicated AI Agent Grounding card with a link to MCP docs. Restating this as a FAQ answer adds no new information.

  WHY: The landing page already has six sections — hero, use cases, features, how it works, comparison, pricing — each addressing a specific prospect concern. A FAQ that largely re-answers those concerns increases total reading load without serving a user who missed them. Users who scanned past the use cases section will also scan past the FAQ. More importantly, a FAQ full of questions the page already answers signals to prospects that the core messaging is unclear, which undermines confidence. The FAQPage JSON-LD schema for rich results works with any number of questions; 4 well-chosen questions serve both the SEO goal and the user.

  TASK: Task 2 (step 5 — FAQ section and FAQPage JSON-LD); the nav link and FAQPage JSON-LD should be updated to reflect the reduced question count.

---

### Other Observations (No Action Required)

- The nav addition (`#faq` link) is fine at 4 questions; at 8 it risks over-indexing on a section that is largely redundant. At 4 questions, the nav link is still warranted — FAQ as a nav destination sets honest expectations.
- The `<dl>` / `<dt>` / `<dd>` markup with no JavaScript accordion is the right call. No cognitive load concerns with the static pattern.
- The HowTo JSON-LD, AggregateOffer refinement, and secondary page OG tags are straightforwardly correct — no UX concerns.
- Removing `changefreq`/`priority` from the sitemap is a good simplification; those attributes add maintenance overhead with no user impact.
