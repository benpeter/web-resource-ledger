# UX Strategy Contribution: UI/UX Fixes Batch (Item 1 + Item 3)

## Item 3: Documentation Link Placement

### Analysis

**Jobs-to-be-done**: Users need docs during three moments: (1) initial setup/integration (API key generation, first capture), (2) troubleshooting a failed capture or unexpected result, (3) understanding billing/usage. These are interrupt-driven -- the user hits a wall and needs reference material *now*, not as a browsing activity.

**Current nav cognitive load**: Session users see 5 nav items (Captures, Schedules, Billing, Notifications, Settings) plus username and Sign Out. That is already near the practical limit for a horizontal nav. Adding a 6th link increases scan time (Hick's Law) and dilutes the visual weight of the primary navigation items.

**API-key users**: They see only "Captures" in the nav plus Sign Out. This is a sparse interface -- adding Docs here would actually improve utility without overloading.

### Recommendation: Nav bar link, right-aligned near actions -- NOT in the primary nav links

Place the docs link in the `nav-actions` area (right side of the nav bar), not in the `nav-links` group (left side). This preserves the primary navigation hierarchy while making docs discoverable.

**Rationale**:
- Docs is a support/utility action, not a primary workflow destination. It belongs with "meta" actions (username, sign out), not with workflow routes (Captures, Schedules, etc.).
- Placing it in `nav-actions` avoids increasing the left-side nav item count from 5 to 6.
- Right-side placement matches the mental model of "utility/help" controls (most SaaS apps place help icons or links near user account controls).
- The link appears for BOTH auth paths (session and API-key), solving the API-key user coverage problem without a separate solution.

**Implementation specifics**:
- Use text "Docs" (not "Documentation" -- shorter, scannable, unambiguous in context).
- Add a small external-link icon (inline SVG, not a font icon) after the text. This is a critical affordance: it signals "this opens somewhere else" and prevents the disorientation of an unexpected new tab.
- Set `target="_blank"` with `rel="noopener noreferrer"`.
- Style it as a `nav-link` visually but position it in `nav-actions`, before the username/sign-out cluster. Use a subtle visual separator (e.g., a thin border-left or extra gap) between the Docs link and the user controls to group them correctly.
- Add `aria-label="Documentation (opens in new tab)"` for screen reader users.

**Rejected alternatives**:
1. **Footer link**: Low discoverability. Users in trouble don't scroll to footers. Also, this SPA has no persistent footer -- adding one just for a docs link is overhead.
2. **Settings page**: Buries the link two clicks deep. Users needing docs during capture setup won't think to check Settings.
3. **"?" icon only**: Ambiguous -- could mean contextual help, a tooltip, a chat widget. Text is clearer than an icon for a link to a separate documentation site.
4. **Adding to primary nav-links**: Inflates the primary nav to 6 items for session users, increasing cognitive load on every page view for a link most users click rarely.

### API-key path detail

For API-key users, the nav currently shows: `[Captures]` (left) + `[Sign out]` (right). After this change: `[Captures]` (left) + `[Docs] [Sign out]` (right). This is a net improvement -- API-key users (often developers integrating the API) are the most likely to need documentation, and they currently have zero help affordance.

---

## Item 1: Login Page Contrast Analysis

### Findings

I examined the actual color tokens and their application.

**"Sign in with GitHub" button (`.btn--github`)**:
- Background: `var(--color-primary)` = `#2a3444` (dark blue-grey)
- Text: `var(--color-primary-text)` = `#f8f8fa` (near-white)
- Computed contrast ratio: approximately 10.5:1
- **Verdict: This passes WCAG AA and AAA. Not the problem.**

**"Connect" button (`.btn--ghost`)**:
- Background: `transparent` (inherits white from `.auth-card` / `--color-surface: #ffffff`)
- Text: `var(--color-primary)` = `#2a3444`
- Border: `var(--color-border)` = `#dddbd8`
- Text contrast against white: approximately 10.5:1
- **Verdict: Text contrast passes. But the button itself has low *perceived prominence* -- not a contrast ratio problem, a visual weight problem.** The ghost style makes it look like a secondary/disabled control. This may be what the issue reporter interpreted as "low contrast."

**The actual contrast problem is likely the "or" divider and the "Already have an API key?" label**:
- Divider text (`.login-divider-text`): `var(--color-text-muted)` = `#6e6a66` on `var(--color-surface)` = `#ffffff`
  - `#6e6a66` on `#ffffff` = approximately 4.7:1. Passes AA for normal text (4.5:1 minimum) but barely. At `--text-sm` (13px), this is functionally small text and 4.7:1 is marginal.
- API key label (`.login-apikey-label`): Same `--color-text-muted` at `--text-sm`. Same marginal ratio.

**There is also a potential issue with the input placeholder**:
- Placeholder text `wrl_live_...` uses browser-default placeholder color, which is typically a light grey around `#767676` or lighter. On white, this can fail WCAG AA depending on the browser. However, placeholder contrast is a common accepted trade-off -- it is hint text, not content.

### Recommendations for Item 1

1. **Do not change `.btn--github` contrast** -- it already passes at 10.5:1. Changing it would be solving the wrong problem.

2. **Investigate whether the issue is about the "Connect" button's visual weight, not its text contrast.** The ghost style (transparent background, thin border) makes it visually subordinate to the GitHub button -- this is intentional design (GitHub OAuth is the primary path, API key is secondary). If the issue reporter's concern is that the Connect button "looks faded," the fix is to slightly increase border contrast or add a subtle background tint, not to make it a filled button (that would break the visual hierarchy).

3. **Consider bumping `--color-text-muted` from `#6e6a66` to something like `#5c5955`** -- this would increase the contrast ratio from ~4.7:1 to ~5.5:1, improving readability of the divider text, API key label, and all other muted text throughout the app. This is a global token change so it affects every use of `text-muted`, which is desirable (muted text should be legible, not decorative).

4. **Ask for clarification on the issue**: Before implementing, the team should determine exactly which element the reporter found low-contrast. The fix depends entirely on which element they meant. If the issue has a screenshot, that would resolve ambiguity.

### Risk: Global token change

Changing `--color-text-muted` affects every instance across the entire UI. This is actually a *good* thing from a UX perspective (consistency), but it means the change should be reviewed across views (captures list, settings, billing) to ensure the slightly darker muted text doesn't create visual noise where the current lighter value works well. A quick visual scan of all views using muted text should be part of the PR review.

---

## Summary of Recommendations

| Item | Recommendation | Confidence | Risk |
|------|---------------|------------|------|
| Docs link placement | `nav-actions` area (right side), both auth paths, "Docs" text + external-link icon | High | Low -- additive change, no existing patterns broken |
| Docs link for API-key users | Same placement -- they get it in `nav-actions` alongside Sign Out | High | None |
| Login contrast (btn--github) | No change needed -- 10.5:1 passes | High | Risk of wasted effort if "fixed" unnecessarily |
| Login contrast (real issue) | Likely `.btn--ghost` visual weight or `--color-text-muted` at small sizes | Medium -- need issue reporter clarification | Token change is global |
| `--color-text-muted` bump | Darken from `#6e6a66` to ~`#5c5955` for better small-text legibility | Medium | Low -- improves all muted text; verify across views |

### Tasks for Implementation

1. Add docs link element in `renderAppShell()` within `navActions` div, before user controls, for both `session` and `apikey` paths.
2. Create a small inline SVG for the external-link icon (no dependency needed -- 12x12px, matches `currentColor`).
3. Add minimal CSS for the docs link styling and the visual separator from user controls.
4. For contrast fix: clarify with issue reporter which element is the problem before changing tokens. If no clarification available, bump `--color-text-muted` and verify across views.
