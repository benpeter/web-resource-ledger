## UX Strategy Review

**Verdict: ADVISE**

---

### Overall Assessment

The plan is sound. The three-view architecture (auth gate -> combined submit+list -> detail) maps directly onto the user's job: authenticate once, submit a URL, watch it resolve, inspect the result. The combined form+list decision is correct — it eliminates navigation, provides immediate feedback, and makes the empty state natural. The cognitive load is appropriately low for MVP scope: three views, no filtering, no settings, polling handled silently in the background.

One issue requires attention before implementation begins.

---

### Findings

- [usability]: The "Try again" button on failed captures passes a URL back to the submit form across a view boundary, but the plan does not specify the mechanism — leaving the implementation undefined and risking a broken or confusing retry experience.
  SCOPE: `src/ui/ui-detail.js` (Task 3) and `src/ui/ui-submit.js` (Task 2)
  CHANGE: Either (a) define the cross-view URL handoff mechanism explicitly — a hash parameter like `#/captures?prefill=<encoded-url>` is the cleanest option and avoids global state — OR (b) cut the "Try again" prefill behavior entirely for MVP and replace it with a plain "Back to captures" link. Option (b) is recommended. Failed captures are exceptional; the user can paste the URL again. The prefill adds cross-view state coordination complexity disproportionate to how often it will be used.
  WHY: An unspecified state handoff mechanism risks two failure modes: the submit form renders empty (user confused, has to retype), or a stale URL from a previous view populates the form unexpectedly. Either outcome undermines trust in an interface that is supposed to lower the barrier to first experience. The "Try again" path is an excitement feature trying to solve an infrequent problem — it does not belong in MVP scope.
  TASK: Task 3

---

### Confirmed Good Decisions

These plan choices are validated from a UX strategy perspective and should not be revisited:

- **Combined form+list at `#/captures`**: Eliminates navigation, provides optimistic UI, makes empty state natural. Correct.
- **sessionStorage over localStorage**: Right security posture for the evaluator use case. Ephemeral auth per tab prevents credential leakage on shared machines.
- **Inline auth gate, not a separate page**: Zero routing friction. Users land at `/ui`, enter their key, and immediately see the app.
- **No sorting or filtering controls**: YAGNI. Newest-first is the right default and covers the overwhelming majority of use cases at MVP scale.
- **Empty state IS the form with guidance text**: No illustration, no separate empty-state page. The call to action is always visible. Correct.
- **E2E tests deferred**: Pragmatic. The client-side JS is thin; Vitest on the HTML output provides adequate coverage for MVP.
