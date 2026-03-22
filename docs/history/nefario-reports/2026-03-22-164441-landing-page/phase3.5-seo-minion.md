## SEO Minion Review

**Verdict: ADVISE**

The plan is well-structured and already incorporates the Offers omission correctly. All mandatory SEO elements are present. Two advisories for frontend-minion to pick up during Task 1 implementation.

---

### What is correct

**JSON-LD (Offers omission)**: The decision to omit `offers` from SoftwareApplication is correct. Google penalizes structured data that contradicts visible content. "Coming soon" badges with no prices cannot be paired with any Offers block. `isAccessibleForFree: true` is the right substitute signal. Add Offers when billing ships.

**Organization schema**: Clean and correct. `sameAs`, `contactPoint`, and `logo` are all present and valid.

**Title tag**: 55 characters, primary keyword included, brand name at end. Within target.

**Meta description**: 155 characters, includes technical differentiators (Ed25519, RFC 3161, WACZ), ends with a value hook. Within target.

**Canonical URL**: `https://webresourceledger.com/` (trailing slash) is consistent across canonical tag, og:url, and sitemap.xml. Correct.

**Twitter card**: `summary` without image is correct given the deferred OG image. Do not use `summary_large_image` without an actual image URL -- it degrades to a plain link card, same as `summary`, with no upside.

**robots.txt**: Syntactically correct. Sitemap directive present with absolute URL.

**sitemap.xml**: Single-URL sitemap is appropriate. Correct namespace and structure.

---

### Advisories (non-blocking, should-fix during Task 1)

**Advisory 1: Add `lastmod` to sitemap.xml**

The sitemap entry is missing `lastmod`. This element tells Google when the page was last modified and influences recrawl priority. For a newly launched page, set it to the deploy date.

Recommended change to sitemap.xml:
```xml
<url>
  <loc>https://webresourceledger.com/</loc>
  <lastmod>2026-03-22</lastmod>
  <changefreq>monthly</changefreq>
  <priority>1.0</priority>
</url>
```

Update `lastmod` whenever significant content changes are deployed. Low effort, moderate benefit.

**Advisory 2: Organization schema `url` trailing slash inconsistency**

The Organization schema has `"url": "https://webresourceledger.com"` (no trailing slash) while the canonical tag, og:url, and sitemap all use `https://webresourceledger.com/` (with trailing slash). These are technically the same URL, but consistent use of the canonical form throughout the schema graph is cleaner.

Recommended: change Organization `url` to `"https://webresourceledger.com/"`. Same fix applies to the SoftwareApplication `url` property.

---

### Noted but not flagged

**H1 keyword alignment**: The H1 "Web evidence you can prove." does not match the primary keyword phrase in the title tag ("Cryptographic Evidence of Web Content"). This is a real SEO gap -- H1 carries on-page weight, and keyword alignment between title and H1 is a best practice. However, this is a brand copy decision made by product-marketing-minion, and the product is pre-1.0 without established search demand. The risk is low at launch. Flag as a future consideration when the product has more content surface area.

**`twitter:site` tag absent**: Recommended but not required. Omitting it is acceptable for launch.

**OG image deferred**: Acknowledged and acceptable. `summary` card without image degrades gracefully. Add when OG image is created.

---

### No blockers found

The JSON-LD is correct, the meta tags are complete for launch, the canonical is consistent, the robots.txt and sitemap are valid. The two advisories above are easy to incorporate and should be applied during Task 1.
