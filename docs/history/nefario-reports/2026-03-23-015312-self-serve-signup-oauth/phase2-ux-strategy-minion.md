# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. First-Time User Journey: Discovery to First Capture

The journey has five phases. Each phase has cognitive load risks that need deliberate mitigation.

**Phase A: Discovery (landing page)**

Current state: The landing page hero CTA is "Read the docs" and "See how it works". There is no "Sign up" or "Try it" CTA. The pricing section has "Coming soon" badges on all tiers. The footer links to the Web UI, but the Web UI immediately demands an API key -- a dead end for anyone who doesn't already have one.

The job-to-be-done here is: "When I find WRL and want to try it, I want to sign up and capture a page, so I can evaluate whether it meets my needs."

Recommendation: The landing page hero needs a primary CTA that leads directly to signup. "Get started free" or "Try it now" pointing to `/ui` (which will now have the "Sign in with GitHub" button). The pricing "Explore" tier should replace "Coming soon" with "Sign up free". The current "Read the docs" CTA should become secondary. The footer Web UI link stays as-is.

Note: The meta-plan says landing page changes are out of scope (Phase 8). This is a risk -- without a landing page CTA, the funnel is broken at the top. I recommend either pulling in a minimal CTA change (one line of HTML) or accepting that the self-serve flow will only be discoverable via docs and direct `/ui` navigation until Phase 8 ships.

**Phase B: Auth gate (the `/ui` page)**

Current state: The auth gate shows "Web Resource Ledger" heading, "Enter your API key to get started" tagline, a password input with placeholder `wrl_live_...`, and a "Connect" button. This is the only path in.

With OAuth, there are now two user populations hitting this page:
1. *New self-serve users* who have no API key and want to sign up
2. *Existing operator-provisioned users* who have an API key and want the current behavior

These two populations have fundamentally different mental models. The new user thinks "I want to sign up." The existing user thinks "I want to paste my key." Showing both options simultaneously creates a choice that requires thinking about which one applies to you.

Recommendation: Make "Sign in with GitHub" the visually primary action. The API key input becomes a secondary disclosure. Structure:

```
Web Resource Ledger

Sign in with GitHub  [primary button]

--- or use an API key ---

[collapsed/secondary: API key input + Connect button]
```

Rationale (Krug): Users satisfice -- they take the first reasonable option. New users will hit the GitHub button. Existing users who know they have an API key will look for the secondary option. The "or" separator is a well-understood web pattern.

The "or use an API key" section should be visible by default (not hidden behind a click) because operator-provisioned users should not have to hunt for their input. But it should be visually subordinate -- smaller text, muted styling, no card or box around it. Progressive disclosure would add unnecessary interaction cost for a population that currently has zero-friction entry.

**Phase C: GitHub OAuth + ToS acceptance**

This is where the cognitive load question gets critical.

The flow: User clicks "Sign in with GitHub" -> GitHub authorization page -> redirect back to `/ui` -> first-time users see ToS acceptance -> tenant created -> first API key shown.

ToS cognitive load analysis:
- The current TERMS.md is 87 lines, roughly 800 words. That is too long to display inline.
- Users don't read ToS. This is empirically established. What they need is: (a) awareness that terms exist, (b) a way to read them if they want, (c) a clear acceptance action.
- A checkbox-before-proceed pattern ("I agree to the Terms of Service") with a link to the full terms is the lowest-cognitive-load approach. It's a must-be feature (Kano) -- users expect it in signup flows, its presence is neutral, its absence would be alarming.

Recommendation: After the GitHub callback, before tenant creation, show a ToS acceptance screen:

```
Welcome to Web Resource Ledger

By continuing, you agree to the Terms of Service
and Content Policy.

[x] I agree to the Terms of Service and Content Policy

[Continue]  [Cancel]
```

- "Terms of Service" and "Content Policy" are links that open in new tabs
- The checkbox is unchecked by default (GDPR-friendly, no pre-ticked consent)
- "Cancel" returns to the auth gate without creating anything
- This screen should be minimal -- no feature marketing, no secondary information
- Acceptance timestamp is recorded in D1 as specified in the success criteria

Do NOT combine this with the "first key" screen. Separate concerns reduce cognitive load -- one decision per screen.

**Phase D: First API key display ("shown once" semantics)**

This is the highest-risk moment in the entire journey. The user just signed up and is being asked to copy and store a secret they will never see again.

The "first key shown once" pattern is well-established (GitHub personal access tokens, Stripe API keys, AWS access keys). Users understand it. But the failure mode is real: if they close the tab, navigate away, or simply don't realize they need to save it, the key is gone.

Cognitive load analysis:
- The user must understand: (a) this is their API key, (b) they need it for API access, (c) it won't be shown again, (d) they should copy it now
- Four pieces of information competing for attention. That's manageable but only if the hierarchy is right.

Recommendation for the first-key screen:

```
Your API key

wrl_live_aBcDeFg...full-key-here  [Copy]

Save this key now -- it won't be shown again.
You can use this key to authenticate API requests.

[Continue to dashboard]
```

Design requirements:
- The key is displayed in a monospace `<code>` block with high visual weight
- "Copy" button with immediate feedback ("Copied!") -- reduces the chance of not saving
- The warning "Save this key now" is styled as a caution/warning alert (yellow background from the existing design system's `--color-warning-bg`), not just body text
- "Continue to dashboard" is the only forward action. No navigation options, no sidebar, no header links. The user must actively choose to move past this screen.
- There is NO "skip" or "I'll do this later" option. The key is being shown; they should copy it. But we don't block progress -- they can click Continue without copying.

Recovery strategy for "I closed the tab before copying":
- The user can sign in again (session cookie or re-auth via GitHub) and go to Account Settings to create a new API key. The first key is still active even if they didn't copy it -- they just can't see it. Creating a second key is the recovery path.
- This should be documented in the account settings view with a note: "Lost your key? Create a new one and revoke the old one."
- Do NOT try to show the key again on next login. "Shown once" must mean shown once. Any other behavior trains users that the warning is empty.

**Phase E: First capture**

After continuing to the dashboard, the user lands on the existing captures view (the submit form + empty list). The current empty state message is: "Submit a URL above to create your first capture. The page will be captured with a screenshot and cryptographic verification."

This is good. It's a clear call to action in context. The user now has a session cookie, so `apiFetch` works without them needing to paste anything.

BUT: There's a critical question about how `apiFetch` works post-OAuth. Currently it reads `sessionStorage.getItem('wrl_api_key')` and adds a Bearer header. With session cookies, the auth is the cookie itself -- no Bearer header needed for session-authenticated users.

Recommendation: `apiFetch` needs to detect which auth mode is active. If a session cookie is present (the user signed in via GitHub), `apiFetch` should send requests with `credentials: 'same-origin'` (which sends the cookie) and NOT add a Bearer header. If `sessionStorage` has an API key (the user connected via the key input), use the current Bearer header approach. This is transparent to the user -- they don't need to know or choose.

The captures view, submit form, and detail view should work identically regardless of auth mode. No visible difference. This is the "invisible computing" principle -- the auth mechanism change should be invisible to the user.


### 2. Account Settings: Key Management UX

The account settings page is a new view in the hash router (e.g., `#/account` or `#/settings`).

**Information architecture:**

The nav bar currently has "Captures" and "Disconnect". With OAuth, it becomes:
- "Captures" (existing)
- "Account" or "Settings" (new -- for key management)
- User identity indicator + "Sign out" (replaces "Disconnect")

Recommendation: Use "Account" as the nav label (matches GitHub, Stripe, most developer tools). Show the GitHub avatar + username in the nav (small, right-aligned) with a "Sign out" action. This provides system status visibility (Nielsen #1: who am I logged in as?).

For operator-provisioned users (API key auth), the nav should NOT show Account or identity -- they don't have an account. Show "Disconnect" as today.

**Key list view:**

Show keys as a list:
```
API Keys
You have 2 of 5 keys.

Name          Created        Status    Actions
primary       Mar 23, 2026   Active    [Revoke]
ci-pipeline   Mar 22, 2026   Active    [Revoke]

[Create new key]
```

- Keys are masked: show only the name, created date, and status (Active/Revoked)
- Do NOT show the key hash or any part of the key value. The user doesn't need it for management -- name is the identifier.
- "Revoke" requires confirmation (a modal or inline confirmation: "Revoke key 'primary'? This cannot be undone. [Cancel] [Revoke]")
- "Create new key" opens an inline form: just a name input + create button. The new key is displayed once (same "shown once" pattern as first-key).
- Show the limit ("2 of 5 keys") to prevent frustration at the cap and to provide system status.

**Cognitive load audit:**
- One view, one purpose: manage your API keys
- No settings that aren't about keys (no profile editing, no email preferences, no notification settings). YAGNI.
- The limit is visible before they hit it (prevents the error state of "you've reached your limit" with no prior warning)


### 3. Auth Model Transition for Existing Operator-Provisioned Users

This is the subtlest UX risk. There are two categories of existing users:

**Category A: Operator-provisioned users who will never use OAuth**
These users got their API key from the operator (Ben) via the admin API. They paste it into the UI. Nothing changes for them -- the API key input remains. "Disconnect" in the nav clears their sessionStorage key. They have no account, no GitHub identity, no session cookie. The admin manages their keys.

Risk: If the auth gate changes to prioritize "Sign in with GitHub", these users might be confused ("I don't have a GitHub account / I don't want to sign in with GitHub, I just have a key"). Mitigation: The "or use an API key" path must be clearly visible, not buried. Use language like "Already have an API key?" to signal that this is a valid, expected path.

**Category B: GitHub users who already have an operator-provisioned tenant**
The prompt says: "Must handle the case where a GitHub user has previously been provisioned as an operator tenant (link, don't duplicate)." This is a data-level problem (data-minion's territory), but it has a UX implication.

Scenario: A user was given a tenant by the operator. They later sign in with GitHub. The system links their GitHub identity to the existing tenant. What does the user see?

Recommendation: The user should NOT see the first-key screen in this case. They already have keys. The ToS acceptance screen should still appear (it's a legal requirement for the new auth pathway). After ToS acceptance, they land directly on the captures view. Their existing keys work. Their account settings page shows their existing keys.

If the system cannot automatically link (e.g., no way to match GitHub ID to existing tenant), the user is treated as new -- they get a new tenant. The operator can merge tenants later. This is the safe default. The error message for failed auto-linking should never be shown to the user -- it's an internal concern.

**Category C: Users who signed in with GitHub AND pasted an API key**
This shouldn't happen in a single session, but edge cases exist (user signs in, then opens a second tab and pastes a key from a different tenant). The system should treat these as independent auth contexts. The session cookie wins when present; the API key input is only accessible when no session cookie exists.

Recommendation: When a user is signed in via GitHub (session cookie present), the auth gate is skipped entirely -- they go straight to the app shell. The "or use an API key" input is not shown. To use a different API key, they must sign out first. This prevents token confusion.


### 4. ToS Acceptance: Minimal Cognitive Load Approach

The Terms of Service acceptance is a legal gate, not a feature. Users should spend the minimum possible time on it while the system satisfies its legal obligations.

Recommendations:
- One screen, one checkbox, one button
- Links to full ToS and Content Policy open in new tabs (don't navigate away from the signup flow -- that's abandonment risk)
- No scrollable ToS text inside the page. Nobody reads it. Forcing a scroll interaction is theater.
- Record timestamp, GitHub user ID, and ToS version hash in D1
- ToS version tracking enables re-consent: if the ToS changes, users who accepted the old version can be prompted on next login. This is a SHOULD, not a MUST for initial implementation, but the data model should support it (store `tosVersion` alongside `tosAcceptedAt`).


### 5. Error States and Recovery Paths

Every step in the OAuth flow can fail. Each failure needs a user-facing recovery path.

| Failure | What user sees | Recovery |
|---------|---------------|----------|
| GitHub OAuth denied (user clicks "Cancel" on GitHub) | Auth gate with message: "GitHub authorization was cancelled." | Click "Sign in with GitHub" again |
| GitHub OAuth callback error (invalid state, token exchange failure) | Auth gate with message: "Sign-in failed. Please try again." | Click "Sign in with GitHub" again |
| Network error during OAuth callback | Auth gate with message: "Connection failed. Check your network and try again." | Retry |
| ToS declined (user clicks Cancel) | Auth gate (back to start) | Can sign in again later |
| Key creation fails (D1 error) | Error alert on first-key screen: "Could not create your API key. Please try again." with retry button | Retry on same screen |
| Session expired mid-use | Auto-redirect to auth gate (same as current 401 handling) | Sign in again |
| Already signed in (user navigates to `/ui` with valid session cookie) | Skip auth gate, go to app shell | n/a |

Every error message follows Nielsen's heuristic #9: explain what happened and suggest what to do next. No generic "Something went wrong" messages.


## Proposed Tasks

### UX-1: Redesign auth gate for dual auth paths
Update `renderAuthGate()` to show "Sign in with GitHub" as primary action and "or use an API key" as secondary. Maintain current API key input behavior. Visual hierarchy: GitHub button dominates; API key input is subordinate but visible.

### UX-2: Design first-key display screen
New view after OAuth first-login: shows the raw API key in monospace, copy button with feedback, warning alert ("Save this key now"), and "Continue to dashboard" as the sole forward action. No navigation chrome on this screen.

### UX-3: Design ToS acceptance screen
New view between OAuth callback and tenant creation: checkbox (unchecked by default) + link to Terms and Content Policy (new tab) + Continue/Cancel buttons. Minimal copy, no marketing. Record version identifier for future re-consent.

### UX-4: Add Account view to hash router
New `#/account` route: list API keys (masked, with name + created date + status), revoke with confirmation, create new key (inline form), key limit indicator. Only shown for OAuth-authenticated users.

### UX-5: Update nav bar for dual auth contexts
OAuth users: show Captures | Account | avatar+username + Sign out. API key users: show Captures | Disconnect (unchanged). The nav dynamically reflects which auth mode is active.

### UX-6: Adapt apiFetch for dual auth modes
Detect session cookie vs sessionStorage key. Session cookie: use `credentials: 'same-origin'`, no Bearer header. SessionStorage key: use Bearer header (current behavior). Transparent to all view code.

### UX-7: Error state coverage for OAuth flow
Implement user-facing error messages for each OAuth failure mode (denied, callback error, network error, session expired). Each error shows on the auth gate with a clear recovery action.


## Risks and Concerns

### Risk 1: Funnel breakage without landing page CTA (HIGH)
The meta-plan explicitly excludes landing page changes (Phase 8). But the current landing page has no signup CTA -- only "Read the docs". Users who discover WRL via the landing page have no visible path to self-serve signup. The Web UI link in the footer leads to the auth gate, but footer links have notoriously low discovery rates.

Mitigation: Either pull in a minimal landing page change (one `<a>` tag in the hero section) or accept that organic signup discovery is deferred to Phase 8.

### Risk 2: "Shown once" key loss (MEDIUM)
Users will lose their first API key. Some will close the tab. Some will copy it to clipboard and then copy something else before pasting it anywhere. The recovery path (create a new key in Account Settings) must be discoverable without external documentation.

Mitigation: The Account Settings view should include a prominent note: "Don't see your key? API keys can only be viewed at creation. Create a new key and revoke the old one." This covers the recovery path without requiring the user to read docs.

### Risk 3: Operator-provisioned users confused by OAuth-first auth gate (MEDIUM)
Changing the auth gate from "API key input" to "Sign in with GitHub (primary) / API key input (secondary)" may confuse operator-provisioned users who expect the old layout.

Mitigation: The API key input must remain visible without interaction (not behind an expand/collapse). Use the label "Already have an API key?" to signal legitimacy. Consider whether operator-provisioned tenants warrant a changelog notice or email.

### Risk 4: Two mental models for "how auth works" (LOW-MEDIUM)
After this ships, WRL has two auth models in the UI: session cookie (OAuth users) and sessionStorage Bearer token (API key users). While the UX should make this invisible, edge cases (expired session vs expired key, mixed contexts in multiple tabs) could create confusion.

Mitigation: Clear session/auth state on sign-out and disconnect, ensuring a clean slate. Don't allow both auth contexts simultaneously. If a session cookie exists, API key input is not offered.

### Risk 5: ToS version tracking as tech debt (LOW)
If the initial implementation doesn't store a ToS version identifier alongside the acceptance timestamp, re-consent on ToS changes becomes a migration headache later.

Mitigation: Store `tosVersion` (a hash or version string) in D1 from day one, even if re-consent prompting isn't implemented yet. The data model cost is one column; the retrofit cost is a migration and backfill.

### Risk 6: Account Settings scope creep
Account Settings is a natural magnet for feature requests (profile editing, usage stats, webhook management, notification preferences). Each addition increases cognitive load for all users.

Mitigation: Scope Account Settings to API key management only. No other settings. The view title should be "API Keys" not "Account Settings" to signal narrow scope and resist expansion. If/when more settings are needed, that's a separate UX decision.


## Additional Agents Needed

- **ux-design-minion**: Needed for the interaction design of the auth gate dual-path layout, first-key display, ToS acceptance screen, and Account view. Strategy defines what should exist and why; design defines the specific layout, spacing, button hierarchy, and visual treatment. The design system tokens exist but the new screens need specific wireframes.

- **frontend-minion**: Needed for implementation of all new views and the `apiFetch` dual-mode adaptation. The vanilla JS, no-framework constraint means careful DOM management for the new views (ToS screen, first-key screen, Account view, updated auth gate).

- **software-docs-minion**: The self-serve onboarding flow needs API reference updates (new OAuth and account endpoints), and the docs site needs a "Getting Started" guide update that reflects the new signup flow.

- **test-minion**: The auth gate now has branching logic (OAuth vs API key), the OAuth callback has multiple failure modes, and the Account view has create/revoke workflows. Each needs test coverage, including the edge case of session-cookie users vs API-key users seeing different nav states.
