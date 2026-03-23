# Test-Minion Review: Stripe Legal Pages

**Verdict: ADVISE**

## Summary

The deliverables are static HTML files and CSS additions. No automated test suite is specified in the plan, which is fine for the implementation tasks themselves -- but the success criteria in the prompt include assertions that are verifiable and should be checked before the PR is considered done.

## What Testing Is Appropriate Here

For static HTML at this scale, the right testing is lightweight post-deploy validation, not a full test suite. The following checks should be run manually (or scripted as a smoke test) after deploy:

### 1. HTTP reachability (all four routes must return 200)

```bash
for path in /privacy /refund-policy /terms /content-policy; do
  echo -n "$path: "
  curl -s -o /dev/null -w "%{http_code}" "https://webresourceledger.com$path"
  echo
done
```

If any return 404, the Cloudflare Workers Static Assets routing for extensionless paths is misconfigured. This is a real risk: `privacy.html` may not automatically serve at `/privacy` depending on how static assets routing is configured. The plan does not address this.

### 2. Robots/crawlability check

The success criteria require pages are "publicly accessible, crawlable". Verify:
- `<meta name="robots" content="index, follow">` is present on all four pages (the template specifies this, so this should be satisfied by construction)
- `robots.txt` does not disallow these paths (not mentioned in the plan -- worth checking the existing file)

### 3. Sitemap validation

The plan updates `sitemap.xml`. After the update, check that:
- The file is valid XML: `xmllint --noout sitemap.xml`
- All four new URLs are present with correct paths (not `.html` extensions -- the canonical paths are `/privacy`, `/terms`, etc.)

### 4. Internal link integrity (footer links on all pages)

The footer is updated on 6 pages (index, 404, privacy, refund-policy, terms, content-policy). Each footer contains 8 links. A broken link in a shared footer component is high-impact -- it affects every page. Spot-check that all footer links are present and correctly spelled on at least index.html and one legal page after the changes land.

### 5. Canonical URL accuracy

Each page sets a `<link rel="canonical">`. The plan specifies correct paths (`/privacy`, `/terms`, etc.), but the implementation should be verified -- a canonical pointing to `/privacy.html` instead of `/privacy` would be a crawlability issue.

## Concerns Not in My Domain

- Whether the legal content satisfies Stripe's review requirements (legal-minion concern)
- Whether the CSS design token references resolve correctly (frontend-minion concern)

## Risk Assessment

**Medium risk item**: The plan does not address how Cloudflare Workers Static Assets routes extensionless URLs. If the worker serves `privacy.html` at `/privacy.html` but not `/privacy`, the Stripe verification will fail silently (the page loads locally but fails from Stripe's checker). This is worth verifying explicitly after deploy, not assuming it works.

The implementation plan itself is well-specified. No blocking issues from a test coverage perspective -- the checks above are verification steps, not gaps that require new code.
