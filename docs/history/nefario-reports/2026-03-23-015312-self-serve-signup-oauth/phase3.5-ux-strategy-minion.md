# UX Strategy Review -- Self-Serve Signup via GitHub OAuth

**Verdict: APPROVE**

The plan is sound from a UX strategy standpoint. The core user journey is coherent,
the cognitive load choices are well-reasoned, and the simplification decisions are
consistently applied. Three observations and one recommendation follow, none of which
block execution.

---

## Journey Coherence

The planned flow maps cleanly onto the user's job: "When I want to start using WRL,
I want to sign up with minimal friction, so I can start capturing resources without
waiting for an operator to provision me."

The journey has a logical shape:

```
Login screen -> GitHub OAuth -> [new: ToS gate] -> Welcome (first key) -> App shell
                             -> [returning: no gate] -> App shell
```

Each transition serves a clear purpose. No dead ends. No ambiguous states.

The `?flow=welcome` query param routing on boot is the one place where the journey
relies on ephemeral state (the welcome view only renders if the param is present in
the URL after the OAuth redirect). This is intentional and the plan handles the
graceful-degradation case (first-key 404 with link to settings). Coherent.

The dual-auth boot flow (session cookie OR API key in sessionStorage) is a necessary
accommodation for existing operator users. The decision to keep both paths active
and check session first is correct -- satisficing behavior means users take the first
reasonable option, and session cookie users should not have to think about which auth
path they are on.

---

## Cognitive Load

### What the plan gets right

**ToS gate placement**: Creating the tenant immediately on callback and enforcing the
ToS gate in the UI is correct. The alternative -- presenting ToS before OAuth -- would
add a decision point before the user has any investment in completing the flow. Post-
auth gating converts a cold ask into a warm one.

**First-key delivery via dedicated endpoint**: Storing the key in KV and fetching it
via `/v1/account/first-key` is the right mechanism. The ack endpoint (`/v1/account/
first-key/ack`) gives users explicit control over dismissal, which is important --
"I have saved this key" is a meaningful action, not a dismissal of a modal. The 2-
second "Copied!" feedback satisfies Nielsen's system-status heuristic at the exact
moment users need reassurance.

**Last-key guard with disabled Revoke button + tooltip**: Correct application of
constraints to prevent errors by design. Better than a confirmation dialog that fires
after the user has committed to the action.

**Inline revocation confirmation rather than a modal**: This is the right call. Modals
interrupt spatial context. Inline confirmation keeps the user anchored to the key they
are revoking.

**Settings scope (keys only, no profile editing)**: YAGNI applied correctly to UX.
Every additional settings section is a navigation decision the user must make. The
plan constrains settings to one job (key management), which eliminates that decision
cost.

### One load concern: `?error=` query params on the login screen

The plan sends OAuth errors back as URL query params (`/ui?error=missing_params`,
`/ui?error=invalid_state`, etc.). The error messages defined are appropriately user-
facing ("GitHub authorization was cancelled"), but the technical values in the URL
(`missing_params`, `invalid_state`) will be visible in the address bar.

This is not a blocker -- the error values are not sensitive and the user-facing text
is what matters. However, frontend-minion should ensure that the technical error key
is never rendered directly in the UI. The plan shows human-readable mappings for three
cases; the prompt should specify a fallback for unmapped values ("Sign-in failed.
Please try again.") rather than surfacing the raw param. The prompt does say "generic"
for unknown errors -- this is sufficient as written if frontend-minion implements it
defensively.

---

## Simplification

### What the plan correctly simplified

The synthesis removed `csrf_token` and `ip_hash` columns from the sessions table.
These were scope-creep in the schema. Their removal is the right call -- fewer columns
means less mental surface area for every developer who reads that migration in the
future.

The decision to defer the admin GitHub-linking endpoint is correct. The linking
scenario is an edge case with a manual workaround (direct D1 SQL). Adding it now
would add a route, a handler, and a test surface for a job that no current user has.

### No additional simplification needed

The task breakdown (9 tasks across 7 files) looks large, but each task is appropriately
scoped to a single concern. The only alternative would be collapsing oauth.js and
session.js into a single file -- but the separation serves a clear purpose (session
management is reused by account.js; keeping it separate avoids circular dependencies
and makes the contract explicit).

---

## Jobs-to-be-Done Assessment

Every user-facing task in the plan maps to a real user job.

| Task | User job | Assessment |
|------|----------|------------|
| Login screen with GitHub button | "I want to sign up without creating another account" | Correct primary CTA. Satisficing: users see GitHub first, take it. |
| ToS gate | "I need to accept terms before using the service" | Gating is legally necessary. Design makes acceptance feel like a positive step (checkbox + explicit button), not a dark-pattern wall. |
| Welcome / first-key view | "I need my API key to start using the product" | Full attention, no navigation chrome, copy-to-clipboard, explicit ack. Serves the job completely. |
| Settings / key management | "I need to rotate or add keys as my usage evolves" | Correctly scoped to this job. Limit indicator ("2 of 5") sets expectations proactively. |
| Session-based nav ("Sign out") | "I want to know I'm logged in and can leave cleanly" | Username in nav satisfies recognition over recall. Logout is discoverable. |

The secondary job of existing operator users ("I want to continue using my API key
without disruption") is preserved by the dual-auth path. No regression.

---

## Recommendation (non-blocking)

**Welcome screen: consider whether "Continue to Dashboard" should navigate directly
to the captures list or to account settings.**

The plan routes the user to `#/captures` after acknowledging the first key. This is
reasonable -- captures is the core job. However, a brand-new user who just received
their first key has an immediate next job: use that key somewhere. The captures list
is empty for a new user, which creates a cognitive valley ("I signed up, I have a
key, and now I'm looking at an empty list").

The plan is correct to navigate somewhere meaningful after ack. The `#/captures` route
is a defensible choice if the empty-state in that view includes guidance (e.g., "Make
your first capture using the API key you just received -- see the docs."). If the
captures empty-state is not currently that useful, `#/settings` would give the user
one more look at their key and the settings context before they leave.

This is a detail for frontend-minion to consider at implementation time. It does not
require a plan change.

---

## Summary

The plan makes correct, principled UX decisions throughout. The first-key delivery
mechanism is particularly well-designed. The ToS placement is pragmatic. The dual-
auth boot preserves backward compatibility without adding visible complexity. The
scoped settings page applies YAGNI at the UX layer. No blocking issues.

**APPROVE**
