# UX Strategy Review -- Stripe Legal Pages

**Verdict: APPROVE**

## Assessment

### Journey Coherence

The four pages form a coherent set. Each page has a clearly bounded job:

- /privacy -- "what data do you hold about me?"
- /refund-policy -- "can I get my money back?"
- /terms -- "what are the rules of use?"
- /content-policy -- "what content is prohibited?"

No overlap in scope. Cross-links are correctly placed: Refund Policy links to Privacy for account deletion details; Terms links to Content Policy for the copyright contact. The footer groups these four under a labeled "Legal" nav column -- exactly where a user would look during Stripe review or when a compliance question arises.

### Cognitive Load

The plan gets the structure right for long-form legal text:

- 72ch max-width column keeps line length in the readable range (~75-80 characters rendered). This is the right call for dense policy prose.
- Clear heading hierarchy (h1 title, h2 sections, h3 subsections) lets users scan rather than read in full.
- Tables for the GDPR legal basis and data retention sections reduce cognitive load relative to prose paragraphs -- scanning a table is faster than parsing "X is processed under Art. 6(1)(b), Y is processed under..."
- The `article__meta` effective date immediately below the h1 answers the first question users have about legal documents.

The footer restructuring is appropriate. Moving from a single flat nav row to two labeled columns (Product / Legal) reduces satisficing failure -- users hunting for legal links no longer have to scan mixed navigation items. Ten-plus links in a flat row requires the eye to filter; two labeled groups of four require only a glance at the label.

### Simplification

The two-task execution split (CSS first, HTML second) is the right sequencing -- no simplification opportunity there. The decision to use flat .html files rather than directories avoids a redirect hop and matches the existing pattern.

The note that legal pages are "commodity" and don't need novel UX review is correct. The user journey is: footer link -> page -> scan headers -> find relevant section -> read. The article layout and heading hierarchy serve this adequately.

### One Minor Observation (Not a Blocker)

The Terms page "Copyright and Takedown" section currently tells users to see the Content Policy for contact details. The plan correctly cross-links this to /content-policy. However, the contact address (bp@ben-peter.com) appears in both pages independently. This redundancy is intentional and correct -- users should not have to navigate away from a page to find a contact address. No change needed.

### Risk 1 (DPA Verification)

The plan correctly flags this as a Ben action item, not a code task. The privacy policy's claim that DPAs are in place should be verified before the pages go live -- specifically for Coralogix, which is less universally covered than Cloudflare. This is outside my scope to enforce but worth noting: the effective date on the privacy policy is today (2026-03-23), so the window to verify before public launch is narrow.

## Summary

Journey coherence: strong. Cognitive load: well-managed through column width, heading hierarchy, and tables. Footer restructuring: correct decision, clear rationale. No UX issues warrant blocking or conditional approval.
