# User-Docs Minion Review: Compliance Documentation

**Verdict: ADVISE**

---

## Summary

The plan is well-structured and shows clear documentation thinking. The three-tier disclosure model (30-second trust page, 5-minute hub, 30-minute full docs) is the right architecture for this audience. Four targeted issues need attention before execution.

---

## Issues

### 1. Hub page executive summaries risk being written last, summarizing incompletely

Task 6 (hub page) is blocked on all five content tasks completing first, and the prompt tells the software-docs-minion to "read each one first" and write 200-300 word summaries. This is a downstream execution risk: the summaries will only be as accurate as the agent's reading of documents it did not write. The DPA in particular has 4 annexes and 15 clauses — a 200-300 word summary written by a different agent than the one who drafted it may miss the most enterprise-relevant commitments (audit rights scope, transfer mechanism coverage).

**Recommendation:** Add a note to the Task 6 prompt specifying the one or two most important facts to surface per document. For the DPA specifically, the summary must call out: (a) audit is questionnaire-only, not on-site, and (b) 48-hour breach notification. These are the details enterprise procurement teams will look for first and are easy to under-represent in a 200-word summary.

---

### 2. DPA readability: the TOMs annex will read as an engineering spec

The Annex B (Technical and Organizational Measures) prompt lists controls at a very technical level: "HMAC-signed session cookies (__Host- prefix), timing-safe comparison, scope-based authorization, AUTH_RATE_LIMITER." Lawyers and procurement teams reading a DPA want to see security outcomes, not implementation details. The technical specifics belong in the whitepaper, not in a contractual document.

**Recommendation:** The Task 5 prompt should explicitly instruct the agent to write TOMs in outcome language: "Session authentication uses cryptographically signed tokens with short expiry" rather than "__Host- prefix HMAC-signed." Implementation references (see `session.js`) are appropriate for the whitepaper but inappropriate for a DPA annex that enterprise legal teams will attach to vendor assessments. Consider adding: "Write Annex B in plain-language outcome terms. The whitepaper contains implementation detail; the DPA records the commitment."

---

### 3. Progressive disclosure has a gap: no path from landing trust page to specific compliance documents

The landing `security.html` links to the docs hub (`/security/`), and the hub links to each full document. That is correct. But the trust page's bullet list (Ed25519 signatures, RFC 3161 timestamps, etc.) does not link individual claims to the relevant sections. A user who cares specifically about GDPR and DPA availability has to click to the hub and then find the DPA. For enterprise buyers in procurement mode, one extra click matters.

**Recommendation:** In Task 8, update the trust signal list so GDPR-relevant bullets link directly to the DPA and subprocessor pages, not just to the hub. Specifically: "GDPR compliant with Data Processing Agreement available" should link to `/security/dpa/`, and "Published subprocessor list" should link to `/security/subprocessors/`. This does not require structural changes — just two anchor tags.

---

### 4. Data retention document: the "honest disclaimer" about manual deletion needs to be prominent

The Task 2 prompt correctly instructs the agent to write: "The deletion procedure is currently operator-initiated. Automated self-service deletion is planned." This is essential honesty. However, the instruction is buried in the "What NOT to do" list. There is a risk the executing agent treats this as a minor caveat rather than a prominent disclosure.

**Recommendation:** Move the disclosure instruction from the "What NOT to do" section into the deletion procedure section requirements. State explicitly that the absence of self-service deletion should appear in the TL;DR box, not just in body text. Enterprise procurement reviewers read TL;DR boxes and skip body text.

---

## Non-Issues (within scope)

- The decision to keep all full compliance documents on the docs site is correct. No concern.
- The flat nav decision is correct for now. Six items is manageable.
- The 48-hour customer / 72-hour authority notification timeline is consistent across the DPA and incident response prompts.
- The `<details>` blocks for technical deletion implementation details in Task 2 are the right progressive disclosure pattern for that content.
- Cross-referencing strategy is coherent: subprocessors page is the canonical source, privacy policy and DPA annex both reference it.

---

## Recommended Action

These are fixable with prompt edits before execution — not blockers that require redesign. The plan should proceed with targeted adjustments to Task 5 (TOMs language), Task 6 (DPA summary specificity), Task 8 (direct links for GDPR bullets), and Task 2 (TL;DR placement of manual deletion disclosure).
