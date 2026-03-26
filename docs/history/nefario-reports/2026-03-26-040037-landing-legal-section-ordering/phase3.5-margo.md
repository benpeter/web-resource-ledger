## Margo — Complexity Review

**Verdict: APPROVE**

This plan is proportional to the task. Two HTML edits (section swap + nav link swap) handled by one task, followed by a mechanical Lighthouse check. No new dependencies, no new abstractions, no new code.

### Observations

1. **Task count is appropriate.** The request is "reorder two sections." The plan has two tasks: make the edit, verify with Lighthouse. That is the minimum responsible scope.

2. **No accidental complexity introduced.** No new CSS classes, no new JS, no new build steps, no framework additions. The background class swap is the only non-obvious detail and it is correctly specified.

3. **Trust bar rejection is sound from a complexity standpoint.** Adding a new UI component (trust strip with badges) for a section-ordering task would be scope creep. The plan correctly defers it.

4. **The "What NOT to do" guardrails are well-scoped.** They prevent the executing agent from gold-plating.

5. **Lighthouse task is lightweight but justified.** For a DOM reorder that changes heading/landmark sequence, a quick accessibility check is the minimum due diligence, not over-engineering.

### Complexity Budget

| Item | Cost | Column |
|------|------|--------|
| (no new technology) | 0 | — |
| (no new services) | 0 | — |
| (no new abstractions) | 0 | — |
| (no new dependencies) | 0 | — |
| **Total** | **0** | — |

No flags. Ship it.
