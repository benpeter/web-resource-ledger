# Lucy Review: Legal-Evidence Positioning Plan

## Verdict: ADVISE

The plan is well-aligned with the original request (R42) and can proceed with the noted adjustments.

---

## Traceability Matrix

| R42 Requirement | Plan Coverage | Status |
|---|---|---|
| Landing page evidence-grade positioning with FRE 901(b)(9), 902(14), eIDAS Art. 41(2) | Task 1: Legal Evidence card with rule-specific list | COVERED |
| FRE 902(13) noted as future enhancement (R41 not shipped) | Task 2: one-paragraph "Planned" section in docs; omitted from landing page | COVERED |
| Docs site "Legal Evidence" guide page | Task 2: full page at `site/content/legal-evidence.md` | COVERED |
| How WRL captures satisfy FRE authentication | Task 2: sections 3 and checklist table | COVERED |
| Comparison: WRL vs. traditional screenshots + affidavits | Task 2: section 5 comparison table | COVERED |
| eIDAS qualified timestamps explanation | Task 2: section 4 | COVERED |
| Disclaimer (not legal advice) | Task 2: bottom blockquote disclaimer | COVERED |
| Remove/avoid vague terms ("FRCP compliant", "legally admissible") | Task 1 and Task 2: explicit prohibition lists | COVERED |
| Competitor comparison with integrity approach | Task 2: section 6 (verification comparison table) | COVERED |
| Copy reviewed for accuracy, no overclaiming | All tasks: language rules, "designed to support" framing | COVERED |
| In scope: landing page copy update | Task 1 | COVERED |
| In scope: cross-references | Task 3 | COVERED |
| Out of scope: attorney review | Excluded (disclaimer instead) | RESPECTED |
| Out of scope: jurisdiction-specific guides | Excluded | RESPECTED |
| Out of scope: marketing campaigns, blog posts | Excluded | RESPECTED |

No stated R42 requirements are missing from the plan. No plan elements lack traceability to a stated requirement.

---

## Findings

### 1. [ADVISE] R42 success criterion references "FRE 901(b)(9) - automated process producing accurate results" -- plan correctly avoids the word "accurate"

R42's prompt.md line 7 says: `"FRE 901(b)(9) - automated process producing accurate results"`. The plan's Task 1 prompt changes this to `"process producing verifiable results"` and explicitly prohibits "accurate results" (line 65-66: "Use 'process producing verifiable results' NOT 'accurate results' for 901(b)(9)"). This is a deliberate, justified deviation from the literal success criterion text. The plan's framing is more defensible than the original request's wording. No action needed -- noting for the record that this is intentional improvement, not drift.

### 2. [ADVISE] R42 success criterion mentions "What the certification document contains and how to use it in proceedings" -- plan correctly scopes this down

R42 line 13 asks the docs guide to explain "What the certification document contains and how to use it in proceedings." The plan's Task 2 reduces this to a single paragraph marked "Planned" because R41 (certification document) has not shipped. This is the correct call given the R41 constraint stated in the prompt itself (line 27). The plan should not describe contents of an unbuilt feature. No action needed.

### 3. [CONVENTION] Task 1 prompt references line numbers that may drift

Task 1's prompt references specific line numbers (e.g., "hero tagline (line 105)", "Legal Evidence card (lines 155-158)", "featureList (lines 59-66)"). I verified these match the current file. However, if any other change lands on `main` before this plan executes, the line numbers will be wrong.

**Recommendation**: The prompt already provides enough surrounding context (HTML snippets, section names) that agents can locate the right content even if line numbers shift. Low risk, but worth noting -- the prompt is not fragile because it duplicates the identification with content snippets.

### 4. [CONVENTION] Task 3 cross-reference insertion point in verification.md

Task 3 says to add a cross-reference "after line 100" in verification.md. The current line 100 reads: `When all checks pass, you know: every byte matches...` and line 102 is `---`. The insertion point is correct. However, the prompt says "after the paragraph 'When all checks pass...' and before the `---` divider on line 102" -- this is precise enough to survive minor line shifts.

### 5. [SCOPE] "Learn more" links on all four cards -- justified scope addition

R42 does not explicitly request adding "Learn more" links to the three non-legal cards. The plan adds them (Task 1, item 3) for "visual parity." This is a minor scope addition. The gate rationale explains it: the legal card getting a list + link would look visually unbalanced without matching links on sibling cards. This is proportionate and justified. The links point to existing docs pages, not new content.

### 6. [CONVENTION] CSS addition location is correctly specified

Task 1 specifies adding `.use-case-details` and `.use-case-cta` styles "after the existing `.use-case-card p` rule (around line 367)." I verified `.use-case-card p` is at lines 363-367 in the current CSS. Correct.

### 7. [COMPLIANCE] CLAUDE.md engineering philosophy adherence

- **YAGNI**: No speculative features. 902(13) is scoped to one paragraph on the docs page only. No certification document UI, no certification API endpoints.
- **KISS**: Three tasks, two files modified, one file created. Proportionate to the ask.
- **Vanilla solutions**: Static HTML + CSS changes, Markdown docs page. No framework additions, no new dependencies.
- **Fail loudly**: Not applicable (no runtime code).

All clean.

### 8. [TRACE] Budget constraint: $30

R42 specifies a $30 budget. The plan uses sonnet for all three tasks, which is cost-appropriate. Two tasks run in parallel (Tasks 1 and 2), Task 3 is small. The total token cost for three sonnet sessions doing copywriting should be well within budget.

### 9. [CONVENTION] Approval gates are proportionate

Task 1 (landing page): gate justified -- public-facing legal claims, hard to reverse once indexed.
Task 2 (docs guide): gate justified -- legal rule references, standalone entry point for professionals who will scrutinize accuracy.
Task 3 (nav + cross-references): no gate -- mechanical changes, low blast radius. Correct.

### 10. [ADVISE] Docs nav includes "Schedules" page not in plan's nav array

The plan's Task 3 prompt shows the nav array without a "Schedules" entry. However, `site/content/schedules.md` exists in the repo. I checked `site/_data/site.js` -- "Schedules" is also absent from the current nav array, so the plan correctly mirrors the current state. No issue.

---

## Summary

The plan is a faithful execution of R42 with two justified deviations (softening "accurate results" to "verifiable results"; scoping down 902(13) documentation given R41 is unshipped) and one minor justified scope addition ("Learn more" links on all four cards). All R42 requirements are covered. No scope creep beyond what is proportionate. CLAUDE.md conventions (YAGNI, KISS, vanilla solutions) are respected. Approval gates are placed on the right tasks.

Proceed with execution.
