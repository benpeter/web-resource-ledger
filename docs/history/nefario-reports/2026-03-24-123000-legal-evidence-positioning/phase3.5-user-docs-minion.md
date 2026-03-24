## user-docs-minion Review: Legal Evidence Docs Guide (Task 2)

**Verdict: ADVISE**

The plan is well-constructed and the documentation brief is the strongest part of this delegation. Structure, framing language, and disclaimer placement are all sound. My issues are targeted and fixable before execution.

---

### Issue 1: FRE 901(b)(9) language drifts between prompt and original request

The original request (`prompt.md`) lists the 901(b)(9) description as "automated process producing accurate results." The synthesis prompt correctly tightens this to "process producing verifiable results" and explicitly forbids "accurate results" (to avoid implying WRL self-certifies accuracy). That is the right call.

However, the prompt text for Task 2 contains one instance where it describes WRL's capture pipeline as "process producing verifiable results" but the evidence foundation checklist row says "Automated process, no human intervention" for "Who captured it?" -- which is accurate but does not map to 901(b)(9) framing specifically. The checklist is fine as-is because it answers opposing counsel's questions (a different purpose), but the implementing agent should understand these two framings serve different purposes. The prompt does not explain this distinction.

**Recommendation**: Add one sentence to the Task 2 prompt clarifying that the checklist answers opposing counsel's questions (practical) while the 901(b)(9) section maps to the rule (legal standard). Without this, the agent may try to make the checklist row sound more like the rule text and lose the plain-language value.

---

### Issue 2: 902(13) appears in Task 2 prompt but is absent from the landing page (correct) -- potential agent confusion

The Task 1 prompt explicitly says "Do NOT mention FRE 902(13) anywhere." The Task 2 prompt says 902(13) must appear as a brief "Planned" section. These are correct and intentional. However, the synthesis document does not signal to the implementing agents that this is a deliberate difference between surfaces, not an inconsistency.

If Task 1 and Task 2 run in parallel and either agent reads the other's constraints (possible in some orchestration setups), the "do not mention 902(13)" instruction from Task 1 could bleed into Task 2's execution.

**Recommendation**: Add a sentence to Task 2's prompt: "Note: 902(13) is intentionally excluded from the landing page but appears here on the docs guide as 'Planned' -- this difference is deliberate."

---

### Issue 3: Standalone entry point requirement needs an explicit H1/opening test

The prompt correctly requires the opening paragraph to orient search-arriving visitors who have never seen the landing page. This is good documentation practice. However, "2-3 sentences" for the opening is tight if those sentences must cover: what WRL is, what it produces, what this page covers, and orient a legal professional who may not know what a WACZ bundle is.

The prompt gives a draft opening: "WRL captures web pages and produces cryptographically signed, independently timestamped evidence bundles. This guide explains how those bundles map to specific legal standards for evidence authentication." This is two sentences that accomplish the goal. But "WACZ bundles" (referenced later in the page) is an unexplained acronym that legal professionals will not know. The page should either expand the acronym on first use or substitute "signed archive bundles."

**Recommendation**: Add to the writing rules: "Expand WACZ on first use: 'Web Archive Collection Zipped (WACZ)' -- legal professionals will not know this acronym."

---

### What works well (confirm, do not change)

- Disclaimer at bottom as blockquote: correct call. Top-of-page disclaimers undermine confidence before the reader has context.
- "Designed to support" framing throughout: precise and defensible.
- No case law citations: the right call for this audience. Mischaracterizing Lorraine v. Medlink to attorneys would be worse than omitting it.
- Competitor comparison using descriptive patterns, not brand names: reduces staleness and legal risk.
- Cross-reference to verification.md rather than duplicating it: correct structure.
- 902(13) as one short "Planned" paragraph on the docs page only: honest without creating timeline expectations.
- eIDAS standard vs. qualified timestamp distinction: clearly specified. The DigiCert / qualified TSA distinction is the most technically precise part of this brief and it is handled correctly.

---

### Summary of changes needed before execution

1. Add a clarifying sentence to Task 2 prompt explaining checklist vs. rule-mapping serve different purposes (prevents agent over-correcting the checklist).
2. Add a sentence to Task 2 prompt flagging that 902(13) omission from the landing page is deliberate, not an inconsistency.
3. Add a writing rule to Task 2: expand WACZ acronym on first use.

None of these require structural changes. The delegation plan can proceed with these three targeted additions to the Task 2 prompt.
