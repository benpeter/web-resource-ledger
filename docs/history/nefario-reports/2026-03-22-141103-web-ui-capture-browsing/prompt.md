**Outcome**: WRL is demonstrable without a terminal — evaluators can try it by clicking a link, significantly lowering the barrier to first experience.

**Success criteria**:
- Browser-based interface for submitting a URL and viewing capture status
- Capture list view showing recent captures with status
- Capture detail view with verification status, screenshot, metadata
- Auth flow for web (API key input or session-based)
- Works on mobile browsers
- No JavaScript framework — vanilla HTML/JS/CSS per project philosophy

**Scope**:
- In: Capture submission form, capture list view, capture detail view, auth flow, responsive design
- Out: Admin dashboard, user management UI, advanced search, offline support

**Constraints**:
- R1 (list endpoint) and R3 (CORS) must ship first
- Should ship after Act 1 is complete — a web UI on top of sharp edges invites negative first impressions
- Vanilla JS/CSS/HTML only (project philosophy: no frameworks unless demonstrably needed)
