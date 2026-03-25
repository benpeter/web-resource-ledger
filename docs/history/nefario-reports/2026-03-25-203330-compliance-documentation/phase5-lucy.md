# Phase 5: Lucy Review -- Convention Adherence and Intent Alignment

**Verdict: ADVISE**

The output is well-aligned with the requirements. The docs site security section is comprehensive, internally consistent, and follows Eleventy conventions. The landing page security.html is structurally correct but contains three factual inaccuracies that contradict the authoritative docs site content. These should be fixed before merge.

---

## Findings

### 1. CONVENTION: Eleventy frontmatter is correct and consistent

All six new `site/content/security/*.md` files use `layout: layouts/doc.njk` with `title` and `description` fields, matching the pattern of every other doc page in the site. No issues.

### 2. CONVENTION: Nav entries in site/_data/site.js follow existing patterns

The security section entries are grouped under a comment and use the same `{ title, url }` shape as all other entries. URLs use trailing slashes. No issues.

### 3. DRIFT (minor): landing/public/security.html -- "signing key is tenant-specific"

**File:** `landing/public/security.html`, line 58
**Claim:** "The signing key is tenant-specific"
**Reality:** The whitepaper (Section 5.3) and the residual risks table (Section 12) both state there is a **single** Ed25519 signing key stored as a Cloudflare Worker secret. The key is **not** tenant-specific -- all tenants' bundles are signed with the same key.

**Fix:** Replace "The signing key is tenant-specific and the verification process is documented and open to independent audit." with "The public verification key is published at a well-known URL and the verification process is documented and open to independent audit."

### 4. DRIFT (minor): landing/public/security.html -- Coralogix region is "Ireland", should be "Frankfurt"

**File:** `landing/public/security.html`, line 50
**Claim:** "Coralogix's EU2 region (Ireland)"
**Reality:** Every other document in this PR (subprocessors.md, dpa.md Annex B, dpa.md Annex C, dpa.md Annex D) consistently says "EU2 region, Frankfurt" or "Frankfurt, Germany". The project's own history (`docs/history/nefario-reports/...phase3.5-lucy.md`) previously caught an EU1/EU2 confusion where EU1 was Ireland. EU2 is Frankfurt/Stockholm, not Ireland.

**Fix:** Change "(Ireland)" to "(Frankfurt)" on line 50.

### 5. DRIFT (minor): landing/public/security.html -- notification timeline conflates customer and authority deadlines

**File:** `landing/public/security.html`, line 53
**Claim:** "affected customers will be notified within 72 hours of discovery, in accordance with GDPR Article 33"
**Reality:** The incident response page and DPA consistently define two timelines: **48 hours** to affected customers, **72 hours** to the supervisory authority. The 72-hour obligation under Art. 33 is the authority notification, not customer notification. The landing page incorrectly applies the authority deadline to customer notification.

**Fix:** Change to "the supervisory authority will be notified within 72 hours and affected customers within 48 hours, in accordance with GDPR Articles 33 and 34."

### 6. CONVENTION (minor): privacy.html shared header/footer comments not updated

**File:** `landing/public/privacy.html`, lines 18 and 312
The shared header comment says `update in all pages (index, 404, privacy, refund-policy, terms, content-policy)` -- it was not updated to include `security` in the list, unlike the identical comment in `security.html` itself which does include it. The shared footer comment in `privacy.html` also omits `security`.

**Fix:** Update both comments in `privacy.html` to include `security` in the page list, consistent with the `security.html` version.

### 7. Cross-document consistency check

Timelines, terminology, and cross-references are internally consistent across the docs site pages:

- **48-hour customer / 72-hour authority** breach notification timeline: consistent across `incident-response.md`, `dpa.md` Section 9, `dpa.md` Annex B, `whitepaper.md` Section 9.3, and `index.md` (security hub). Only the landing page `security.html` deviates (finding #5).
- **Subprocessor list**: The 8 subprocessors (Cloudflare, GitHub, Stripe, Coralogix, Resend, DigiCert, Sectigo, Google Web Risk) are consistent between `subprocessors.md`, `dpa.md` Annex C, `dpa.md` Annex D, `whitepaper.md` architecture diagram, and `index.md` hub summary.
- **30-day deletion grace period**: consistent between `data-retention.md` and `dpa.md` Section 11.
- **Cross-links**: `legal-evidence.md` links to `/security/whitepaper/#5-encryption`. `authentication.md` links to `/security/whitepaper/`. `data-retention.md` links to `../authentication/` and `../security/`. `index.md` (docs hub) links to `/security/`. All reciprocal.
- **DPA PDF link**: `dpa.md` line 9 references `/assets/wrl-dpa.pdf` with a "(to be published)" note. This is fine as long as it's tracked.

### 8. CLAUDE.md compliance

- **Serverless-first**: All documents describe Cloudflare Workers serverless infrastructure. Compliant.
- **Vanilla solutions**: No frameworks introduced. Landing page is plain HTML/CSS. Compliant.
- **Technology preferences**: No new dependencies introduced. Compliant.
- **Engineering philosophy (YAGNI, KISS)**: The scope is proportional to the requirement. Six focused documents covering distinct compliance topics rather than one monolithic page. Compliant.
- **Fail loudly**: Documents accurately describe the fail-open threat check design with its compensating controls and distinct status values. Compliant with the "degrade intentionally" principle documentation.

---

## Summary

| # | Type | Severity | File | Action needed |
|---|------|----------|------|---------------|
| 3 | DRIFT | Medium | `landing/public/security.html:58` | Fix "tenant-specific" signing key claim |
| 4 | DRIFT | Medium | `landing/public/security.html:50` | Fix Coralogix region from "Ireland" to "Frankfurt" |
| 5 | DRIFT | Medium | `landing/public/security.html:53` | Fix notification timeline (48h customers, 72h authority) |
| 6 | CONVENTION | Low | `landing/public/privacy.html:18,312` | Add "security" to shared header/footer comment lists |

Findings 3-5 are factual inaccuracies on the public-facing landing page that contradict the authoritative docs site. They should be corrected before merge. Finding 6 is a minor housekeeping item.
