# Margo Review: Landing Page Delegation Plan

## Verdict: APPROVE

This plan is well-proportioned to the problem. A single static HTML page gets one HTML/CSS task, one infra task, and one docs task. The key simplicity decisions are already made correctly:

- **Standalone over 11ty**: Correct call. Coupling a zero-dependency HTML file to a build pipeline with npm, 11ty, link checking, and Lighthouse CI would be textbook accidental complexity. Different domain, different deploy cycle, zero shared runtime -- keeping them independent is the KISS choice.
- **Zero JavaScript**: Enforced both by design (CSS smooth scrolling, CSS pseudo-element badges) and by infrastructure (`script-src 'none'` CSP). This is the right constraint for a marketing page.
- **No web fonts**: Eliminates FOIT/FOUT, font network requests, and font loading CSS. System stack is correct for this use case.
- **3 tasks, not 27**: The plan explicitly rejected splitting into per-specialist-domain tasks. Good. Coordination overhead on 27 tasks for one HTML file would dwarf the work itself.
- **OG image deferred**: Correct YAGNI call. Ship the page, add the image later.
- **No pricing in structured data**: Correct. Placeholder data in JSON-LD would be worse than omission.

### Minor observations (non-blocking)

1. **Task 1 prompt length**: The prompt for Task 1 is ~250 lines of detailed specification. This is not over-engineering -- it is consolidating guidance from multiple specialists into a single prompt so one agent can execute without ambiguity. The alternative (multiple back-and-forth tasks) would be worse. However, the executing agent should treat the prompt as guidance, not a rigid contract -- if a CSS detail from the spec makes the implementation worse, deviate and document why.

2. **7 architecture reviewers for a static HTML page**: The plan selects 7 reviewers (5 mandatory + 2 discretionary: accessibility-minion, seo-minion). For a zero-JS static page, this is at the upper bound of proportionate. The accessibility and SEO reviews are justified given this is the public-facing marketing page. No change needed, but if review turnaround becomes a bottleneck, the discretionary reviewers are the ones to drop.

3. **`_headers` Cache-Control**: `max-age=3600, s-maxage=86400` is fine for a rarely-changing landing page. Just noting that Cloudflare's edge cache will serve stale content for up to 24 hours after a deploy unless purged. The deploy workflow does not include a cache purge step. This is acceptable for a landing page (content changes are rare and non-urgent), but worth knowing.

### Complexity budget tally

| Item | Cost (managed) |
|------|---------------|
| New Cloudflare Worker (wrl-landing) | 2 |
| GitHub Actions workflow | 1 |
| landing.css (new file, consumes design system) | 0 |
| Total | 3 |

Budget spend of 3 for a production landing page on a custom domain is proportionate. No flags.
