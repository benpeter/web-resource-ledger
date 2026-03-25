## Security Review: ui-ux-fixes-batch

ADVISE

---

[security]: `updateNavCurrent` selects all `.nav-link` elements and attempts to match their `href` against the current hash route. The new docs link uses `class="nav-link"` but points to an absolute external URL (`https://docs.webresourceledger.com`). This means the router will call `removeAttribute('aria-current')` on every navigation event for a link whose `href` will never match a hash route -- harmless in itself, but the link will also be silently included in any future logic that iterates `.nav-link` elements (keyboard nav helpers, active-state logic, analytics). More specifically: if a future dev writes `querySelectorAll('.nav-link')` assuming all results are internal hash routes and calls `.replace(/^#/, '')` on `https://...`, they get an unhandled string, not a path. The architectural concern is that the external link shares a class with internal nav links, blurring the internal/external distinction in code.

SCOPE: `src/ui/ui-auth.js` (docs link construction), `src/ui/ui-shell.js` (updateNavCurrent)
CHANGE: Add `nav-link--external` class to the docs link in addition to `nav-link` (the plan already mentions this class for CSS purposes in `ui-css.js`). In `updateNavCurrent`, guard against external URLs: `if (linkPath.startsWith('http')) { links[i].removeAttribute('aria-current'); continue; }`. This prevents the external link from being misidentified as an internal route now or by future code.
WHY: Defense in depth -- the current code is safe but the shared class creates a latent footgun for iterators that assume all `.nav-link` hrefs are hash routes.
TASK: Add the guard to `updateNavCurrent` and ensure the docs link receives both `nav-link` and `nav-link--external` classes (the CSS task already calls for this class; the JS task must set both on the element).

---

No other security concerns. The remaining changes (color token update, billing dedup, Coralogix alert documentation) introduce zero new attack surface. The docs link correctly specifies `rel="noopener noreferrer"` matching the existing pattern in `ui-tos.js`. The link destination is a hardcoded literal string with no user input -- no open redirect or injection risk. The Coralogix alert is read-only operator notification with no code changes.
