# Domain Plan Contribution: user-docs-minion

## Recommendations

### Information Architecture: The 30-Second / 5-Minute / 30-Minute Model

Enterprise procurement teams evaluate vendors at three depths. The IA must serve all three without forcing anyone to read more than they need.

**30 seconds -- Trust signal on landing site.** A "Security & Compliance" section on `webresourceledger.com` (or a dedicated `/security` page) that shows badges/claims at a glance: "GDPR compliant," "EU data processing," "Ed25519 signed," "Data Processing Agreement available," "Subprocessor list published." This is the equivalent of a trust page. Link from the landing page footer (next to existing Legal nav group) and from the main nav if there is room.

**5 minutes -- Executive summaries on the docs site.** A new `docs.webresourceledger.com/security/` hub page with short (200-300 word) executive summaries of each compliance document. Each summary answers: what is this, what does it commit to, and who should read the full version. This page is the entry point enterprise buyers bookmark and share internally.

**30 minutes -- Full documents on the docs site.** Each compliance document gets its own page under `/security/`, written in full detail. These are the pages procurement teams print, attach to vendor assessment forms, and send to their legal/infosec reviewers.

### Publishing Location Per Document

| Document | Primary location | Secondary location | Format |
|----------|-----------------|-------------------|--------|
| Security whitepaper | `site/content/security/index.md` (hub) + `site/content/security/whitepaper.md` | Landing site links to docs site | HTML (Eleventy MD) |
| Data Processing Agreement (DPA) | `site/content/security/dpa.md` | Landing `/security` links to it | HTML + downloadable PDF |
| Subprocessor list | `site/content/security/subprocessors.md` | Also referenced from privacy.html | HTML (Eleventy MD) |
| Incident response procedure | `site/content/security/incident-response.md` | None needed | HTML (Eleventy MD) |
| Data retention & deletion policy | `site/content/security/data-retention.md` | None needed | HTML (Eleventy MD) |
| Privacy policy | `landing/public/privacy.html` (already exists) | Link from docs site security hub | HTML (static, already exists) |

**Rationale for this split:**

1. **Docs site is the right home for compliance detail.** The Eleventy-based docs site (`site/content/`) already has the `doc.njk` layout with sidebar navigation, consistent styling, and the right reading experience for long-form content. All five new documents fit naturally here.

2. **Landing site gets a lightweight trust page, not duplicated content.** The landing site (`landing/public/`) is static HTML with a marketing tone. Duplicating full compliance docs there creates a maintenance burden (changes must be made in two places). Instead, add a `/security` page to the landing site that provides the 30-second trust signal and links to docs.webresourceledger.com/security/ for everything else.

3. **Privacy policy stays on the landing site.** It already exists at `landing/public/privacy.html`, is well-written, and follows the landing site's static HTML format. Moving it would break the existing `/privacy` URL. The docs site security hub should link to it rather than duplicate it.

4. **DPA needs a downloadable version.** Enterprise procurement teams need to attach the DPA to vendor assessment paperwork. Provide both an HTML page on the docs site (for reading and linking) and a downloadable PDF (for signing and attaching). The PDF can be a static asset in `site/assets/` served via Eleventy passthrough copy.

### Docs Site Navigation Changes

Add a "Security & Compliance" group to the sidebar nav in `site/_data/site.js`. The current nav is flat (9 items). Adding a grouped section keeps it scannable.

Proposed nav structure:

```
Getting Started
Authentication
Verification
Legal Evidence
Batch Captures
Limits & Quotas
Webhooks
Schedules
MCP Server
API Reference
---
Security & Compliance    <-- new group header
  Overview               <-- /security/ (hub with executive summaries)
  Security Whitepaper    <-- /security/whitepaper/
  Data Processing (DPA)  <-- /security/dpa/
  Subprocessors          <-- /security/subprocessors/
  Incident Response      <-- /security/incident-response/
  Data Retention         <-- /security/data-retention/
```

This requires a minor change to `base.njk` to support nav groups (currently flat `<ul>`). The sidebar template needs to handle a `children` array on nav items. This is a small Eleventy change.

### Landing Site Trust Page

Add `landing/public/security.html` following the same pattern as `privacy.html`:

- Same header/footer as other landing pages (shared header comment in source confirms this pattern).
- Content: a concise trust page with headline claims, linking out to docs site for each full document.
- Add "Security" to the landing site footer under the "Legal" nav group.

### Progressive Disclosure Within Each Document

Each compliance document should follow this internal structure:

1. **TL;DR box** (3-5 sentences) at the top. State the commitment in plain language. This is what the 5-minute reader sees on the hub page and what appears at the top of the full document.
2. **Full content** with standard heading hierarchy (H2 for major sections, H3 for subsections).
3. **Details/summary elements** (`<details>`) for technical implementation specifics that only infosec reviewers need. This is progressive disclosure within the page -- procurement generalists see the commitments, technical reviewers expand for implementation details.

This mirrors the pattern already used on the docs site (see the `<details>` block for "Legacy Single-Key Mode" in `authentication.md`).

### Content Principles for Compliance Docs

- **Write for the reader, not the regulator.** Procurement teams are not lawyers. Use plain language for commitments, reference specific regulations/articles in parentheses for those who need to map to frameworks.
- **Be concrete.** "SHA-256 hashed API keys" is better than "industry-standard encryption." WRL already does this well in the privacy policy -- maintain that level of specificity.
- **State what WRL does, not what it aspires to.** These documents describe current state. If something is planned but not implemented, do not include it. The existing privacy policy sets the right tone with its disclaimer ("reasonable-effort privacy policy for a small, early-stage project").
- **Cross-link aggressively.** The security whitepaper should link to the verification docs page for cryptographic details. The DPA should link to the subprocessor list. The data retention policy should link to the privacy policy's retention table. Avoid duplicating content across documents.

### DPA Format Details

The DPA is unique among these documents because it is a contractual template, not just informational content.

- **HTML version** on docs site: full text with blanks/placeholders clearly marked (e.g., "[Customer Name]", "[Effective Date]"). Include a "Download PDF" button at the top.
- **PDF version**: same content, formatted for print/signing. Store as `site/assets/wrl-dpa.pdf`. Serve via Eleventy passthrough copy.
- **Do NOT build a dynamic form.** Enterprise buyers will download the PDF, fill in their details, and counter-sign. A web form adds complexity with no value for this audience.

### Subprocessor List: Keep It a Living Document

The subprocessor list already exists in embryonic form in `privacy.html` (the "Third-Party Processors" table). The dedicated subprocessor page should:

- Expand that table with additional columns: entity name, purpose, data processed, location, DPA status, date added.
- Include a "Last updated" date at the top.
- Note the notification mechanism for subprocessor changes (email to customers, or changelog on this page, or both -- this is a business decision to make during writing).

---

## Proposed Tasks

### Task 1: Create docs site security hub page
**File:** `site/content/security/index.md`
**Deliverable:** Hub page with executive summaries (200-300 words each) for all six compliance areas. Each summary links to the full document. This is the 5-minute page.
**Depends on:** Tasks 3-7 (summaries are written after full documents, but structure can be scaffolded first).

### Task 2: Create landing site trust page
**File:** `landing/public/security.html`
**Deliverable:** Static HTML page following `privacy.html` pattern. Trust signals, short descriptions, links to docs site. Update footer nav in all landing pages to include "Security" link.
**Depends on:** Task 1 (needs to know what to link to).

### Task 3: Write security whitepaper
**File:** `site/content/security/whitepaper.md`
**Deliverable:** Full security whitepaper covering: architecture overview (Cloudflare Workers, no persistent servers), cryptographic model (Ed25519, RFC 3161), data handling (hashing, pseudonymization), access control (API keys, scopes, admin separation), infrastructure security (Cloudflare's security posture), and operational security (logging, monitoring). Cross-links to existing docs pages (verification, authentication, legal-evidence).

### Task 4: Write DPA template
**Files:** `site/content/security/dpa.md` + `site/assets/wrl-dpa.pdf`
**Deliverable:** Data Processing Agreement with standard GDPR Article 28 clauses, adapted to WRL's actual processing activities. HTML page with download link. PDF for offline signing. Incorporates subprocessor list by reference.

### Task 5: Write subprocessor list
**File:** `site/content/security/subprocessors.md`
**Deliverable:** Expanded version of the privacy policy's processor table. Columns: entity, purpose, data categories, location, DPA status, date added. "Last updated" date. Notification mechanism description.

### Task 6: Write incident response procedure
**File:** `site/content/security/incident-response.md`
**Deliverable:** Public-facing incident response overview: classification levels, response timelines, notification commitments, communication channels. This is the customer-facing version (what you can expect from us), not the internal runbook.

### Task 7: Write data retention and deletion policy
**File:** `site/content/security/data-retention.md`
**Deliverable:** Detailed retention schedule expanding on what is in the privacy policy. Covers: capture data lifecycle, account data, logs, backups. Deletion procedures (how to request, what happens, timelines). Technical deletion details in `<details>` blocks for infosec reviewers.

### Task 8: Update docs site navigation
**File:** `site/_data/site.js` + `site/_includes/layouts/base.njk`
**Deliverable:** Add "Security & Compliance" nav group to sidebar. Requires adding support for grouped nav items in the base layout template (currently flat list).

### Task 9: Cross-link existing pages
**Files:** `site/content/index.md`, `site/content/legal-evidence.md`, `site/content/authentication.md`
**Deliverable:** Add links from existing docs pages to relevant security/compliance pages where contextually appropriate. Add "Security & Compliance" card to the Getting Started "What's next" grid.

---

## Risks and Concerns

### 1. Legal accuracy without legal review
These are compliance documents with legal implications. The existing privacy policy includes a disclaimer ("not professional legal advice"). All new documents should carry the same disclaimer. However, the DPA in particular is a contractual document -- enterprises may rely on it. Consider having a lawyer review the DPA before publishing, or at minimum label it clearly as a template/starting point.

### 2. Maintenance burden
Six new documents that must stay accurate as the product evolves. Every architectural change (new subprocessor, new data type, new retention period) must be reflected in multiple compliance documents. Mitigate by: cross-linking rather than duplicating (the subprocessor list lives in one place and is referenced by DPA and privacy policy), and adding a compliance docs review step to the release process.

### 3. Overpromising for a small project
WRL is a solo-operator early-stage project. Enterprise compliance documents can set expectations (SLAs, incident response times, audit rights) that are difficult to meet at this scale. Every commitment in these documents must be achievable today. "We will notify affected customers within 72 hours" is only credible if there is actually a mechanism to do that.

### 4. PDF generation for DPA
The DPA needs a PDF version. Options: (a) manually create a PDF from the markdown and check it into `site/assets/`, (b) add a build step to generate PDF from markdown. Option (a) is simpler and fits the project's KISS philosophy, but creates a sync risk between HTML and PDF versions. Option (b) adds a build dependency. Recommend (a) with a note in the evolution log that the PDF must be regenerated when the DPA content changes.

### 5. Landing site header duplication
The landing site uses a shared header/footer pattern maintained manually across 6 HTML files (noted in source comments: "update in all pages"). Adding `security.html` means 7 files. This is an existing maintenance concern, not new -- but worth noting that every new landing page amplifies it.

---

## Additional Agents Needed

- **software-docs-minion** -- The Eleventy navigation change (adding grouped nav support to `base.njk` and `site.js`) is a code change, not a content task. The software-docs-minion or a frontend implementer should handle the template modification.
- None beyond that. The content writing is squarely in the user-docs-minion domain. The legal review concern (Risk 1) is a human task, not an agent task.
