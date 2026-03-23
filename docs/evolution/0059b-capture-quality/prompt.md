# Phase 0059b: Capture Quality Improvements

## Task Briefing

WRL's capture pipeline works but has never been battle-tested against complex
real-world sites. This phase addresses five concrete quality gaps:

1. **False successes** — captures of Chromium error pages (e.g. BBC bot-blocked)
   reported as `complete` with `renderQuality: full`. No validation that the
   captured content is the actual page.
2. **200 subresource limit** fails captures entirely on modern news sites
   (300-500+ requests).
3. **Missing images** because lazy-loaded content never triggers (no scrolling).
4. **Cookie banners persist** on major European sites (Sourcepoint CMP selector
   mismatch in vendored autoconsent v14.59.0).
5. **No systematic quality validation** — only 2 production captures exist.

## Scope

- Error page detection (top priority — prevents false successes)
- Raise subresource limit 200 → 500
- Update vendored autoconsent to v14.63.0 (Sourcepoint fixes)
- Lazy-load triggering via viewport scrolling
- Test battery script for manual staging validation
- File issue for automated autoconsent update pipeline (deferred)

## Execution Notes

- Worktree-based — autonomous supervisor is running on main
- No nefario — focused enough scope for direct implementation
- Phase numbered 0059b to avoid collision with orchestrator on main
