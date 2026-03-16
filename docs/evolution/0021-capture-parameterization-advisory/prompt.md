# 0017: Capture Parameterization Advisory

## Task Briefing

Run an advisory with the specialist team to evaluate whether WRL should
establish a mechanism for parameterizing capture requests — allowing callers
to control browser behavior during capture.

## Motivation

WRL captures currently start with a blank browser session. This means:

1. **Cookie consent banners** dominate every screenshot — the browser has no
   prior consent state, so cookie pop-ups appear on virtually every capture.
   This is the single biggest fidelity issue for screenshots.

2. **No cookie control** — callers cannot instruct the capture to
   auto-accept, auto-reject, or skip cookie consent banners.

3. **No personalization control** — captures always show the anonymous/
   first-visit experience. There's no way to inject cookies, localStorage,
   or other session state to capture a personalized view.

4. **No viewport or rendering parameters** — viewport size, device
   emulation, wait conditions, and other rendering controls are hardcoded.

## Key Questions for the Advisory

- Should WRL support capture parameters at all, or is "clean slate capture"
  the right default for an evidence product?
- If yes, what parameter categories make sense? (cookie handling, viewport,
  wait conditions, session injection, etc.)
- How does parameterization interact with evidence integrity? If someone
  injects cookies, is the capture still "evidence"?
- What's the API surface? Query params, request body fields, presets?
- What are the security implications of accepting browser-controlling
  parameters from API callers?
- How do cookie consent tools (OneTrust, Cookiebot, etc.) work technically,
  and can we reliably dismiss them?

## Scope

Advisory only (--advisory). No implementation. Produce recommendations and
backlog items for future phases.
