# Lucy Review: seo-geo-optimization

## Verdict: ADVISE

The plan is well-scoped and closely aligned with the original request from issues #136 and #137. No goal drift detected. CLAUDE.md conventions (YAGNI, KISS, inline over partials, no frameworks, no unnecessary plugins) are explicitly respected throughout. The approval gate on Task 2 (FAQ content) is correctly placed at the point of highest irreversibility.

Two minor issues warrant attention before execution.

---

### Findings

- [governance]: llms.txt for docs site lists URLs that may not match actual page permalinks
  SCOPE: `site/content/llms.txt` in Task 1, step 5
  CHANGE: The hardcoded URL list in llms.txt (e.g., `/authentication/`, `/verification/`, `/batch/`) should be verified against actual Eleventy output permalinks before committing. The plan prescribes exact URLs but the agent should read frontmatter/permalink config to confirm paths rather than trusting the plan's assumptions.
  WHY: If any page uses a custom permalink or Eleventy resolves the slug differently than the filename, the llms.txt will contain dead links. This is a static file with no build-time validation.
  TASK: 1

- [governance]: Evolution log creation is not mentioned in the plan
  SCOPE: `docs/evolution/` directory
  CHANGE: The plan's execution or wrap-up must include creating the evolution log directory (`docs/evolution/NNNN-seo-geo-optimization/`) with `prompt.md`, `decisions.md`, and `outcome.md`, and updating `docs/evolution/README.md`. This is a CLAUDE.md hard requirement ("non-negotiable").
  WHY: CLAUDE.md Evolution Log rules 1-6 require every significant development phase to be documented. The plan's Cross-Cutting Coverage and Verification Steps sections do not mention evolution log creation. The calling session must ensure this happens even if the plan omits it.
  TASK: all (cross-cutting)

---

### Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|---|---|---|
| Unique keyword-optimized title/meta descriptions | Task 1 step 6, Task 2 step 1 | Covered |
| JSON-LD: Organization, Product, FAQ | Task 2 steps 3-5 (SoftwareApplication kept, FAQ added) | Covered |
| OG and Twitter Card tags | Task 1 step 2, Task 2 steps 2+6 | Covered |
| Google Search Console verified, sitemap submitted | Task 2 step 7 (sitemap fix), verification step 9 (HUMAN_ACTION_REQUIRED) | Covered |
| Lighthouse SEO 95+ | Task 3 title mentions it but step-by-step says DO NOT run Lighthouse | Partial -- see note |
| Semantic HTML, headings, canonical, robots.txt | Task 1 steps 2-4, Task 2 step 6, Task 3 step 5 | Covered |
| LLM-extractable content structure | Task 2 step 5 (FAQ with factual claims) | Covered |
| Schema.org: Product, Organization, FAQ, HowTo | Task 2 steps 3-5 | Covered |
| llms.txt | Task 1 step 5, Task 2 step 8 | Covered |
| Citation-friendly copy | Task 2 step 5 (FAQ with specific standards, numbers) | Covered |

**Note on Lighthouse**: The prompt requests "Lighthouse SEO audit score 95+". Task 3 explicitly says "Do NOT run Lighthouse (requires a deployed URL or a local server -- out of scope for this task)." This is a reasonable deferral -- Lighthouse requires a running server -- but the plan should acknowledge this as a post-deploy verification step rather than silently dropping it. The HUMAN_ACTION_REQUIRED in verification step 9 partially covers this (Search Console), but a Lighthouse run post-deploy should be noted too. This is not blocking since the structural checks in Task 3 cover the same ground that Lighthouse SEO checks.

### Scope Assessment

No scope creep detected. Every plan element traces to a stated requirement. The "DO NOT" lists in each task prompt are well-crafted and prevent common expansion patterns (no plugins, no image assets, no JS accordions, no per-page TechArticle schema). The 8 FAQ questions are reasonable for a product with this complexity and serve both SEO and GEO goals as stated.

### Approval Gate Assessment

The single gate on Task 2 is correctly placed. The FAQ section is the only element that adds visible, hard-to-reverse content to the landing page. Task 1 (docs site infrastructure) and Task 3 (validation) are low-risk mechanical work that does not warrant gates.
