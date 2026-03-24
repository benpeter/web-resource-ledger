APPROVE

This is a pure CSS additions pass with a trivial DOM simplification in `ui-billing.js`. No security concerns.

Reviewed:
- `src/ui/ui-css.js`: All new rules use design-system CSS variables (no `var()` injection vectors; CSS custom properties are not script-executable). No user-supplied values flow into any of the new rules.
- `src/ui/ui-billing.js`: The inner wrapper `<div>` removal is structural cleanup only. No event handlers, API calls, or data flows are touched. The five builder functions create DOM elements using `document.createElement` and `textContent`; no `innerHTML` is involved in the affected code paths.
- All `innerHTML` usages across the UI codebase are exclusively used to clear container elements (mount points and view containers) before DOM construction — no user or API data is inserted via `innerHTML`. This pre-existing posture is unaffected by the plan.
- No auth/authz changes. No new input handling. No API surface changes. No secrets exposure.
- No new dependencies, no supply chain impact.

The plan's security assessment ("No new attack surface") is accurate.
