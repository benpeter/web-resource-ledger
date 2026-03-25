## UX Strategy Review

**Verdict: ADVISE**

---

[accessibility-implementation]: The `.sr-only` span for the docs link must be placed **inside** the `<a>` tag, not adjacent to it. The Task 1 prompt says "via a visually-hidden span" but does not specify placement.

- **SCOPE**: Task 1 (Fix C — docs link), `src/ui/ui-auth.js`
- **CHANGE**: Add explicit placement instruction: the `.sr-only` span with "(opens in new tab)" must be a child of the `<a>` element, not a sibling. Correct: `<a ...>Docs <svg ...></svg><span class="sr-only">(opens in new tab)</span></a>`. A sibling span is not associated with the link by screen readers.
- **WHY**: Screen readers only announce text content that is a descendant of the focusable element. A sibling span will be ignored when focus is on the link, defeating the purpose of the screen reader text entirely. This is a silent failure — it looks correct in the DOM but announces nothing.
- **TASK**: Add one sentence to the Task 1 Fix C prompt: "The `.sr-only` span must be a child element inside the `<a>` tag, not a sibling."

---

All other aspects of the plan are sound.

- Docs link in nav-actions (not nav-links): correct. Primary navigation should reflect primary workflows. Docs is utility. Six nav items would have exceeded comfortable scan range.
- "Docs" label: correct. Short labels reduce reading load. "Documentation" adds no disambiguation value here.
- Billing status dedup: correct removal target. The `buildRefreshRow()` status text is the redundant element — the status-specific UI in `buildPaymentSection()` carries more information and should survive.
- Ghost button border deferred: correct. A global token change affecting cards, tables, inputs, and dividers is not a "small fix" — scope discipline here is the right call.
- Coralogix alert over email pipeline: correct. YAGNI. The log event already emits the needed data. Zero code change is the minimal viable solution.
- Contrast token change (`#6e6a66` → `#595550`): correct approach. Single token, globally improves readability, easily reversible. No cognitive load implication for users — they simply see readable text.
