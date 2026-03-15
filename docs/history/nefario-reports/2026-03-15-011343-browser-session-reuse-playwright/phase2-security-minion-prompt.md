You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Implement browser session reuse with Playwright migration. The fundamental shift is from browser-per-capture to shared-browser-with-context-isolation.

## Your Planning Question
What are the security implications of browser session reuse? Specifically:
(a) Is BrowserContext isolation sufficient to prevent cross-capture data leakage (cookies, localStorage, cache), or does browser-level state persist between contexts?
(b) What is the threat model for session contention -- if two Workers both try to connect to the same idle session, what happens and what can go wrong?
(c) Does browser.disconnect() (keeping the browser alive) create any risk of state leakage between captures that browser.close() would prevent?
(d) The issue mentions documenting "why BrowserContext isolation is sufficient" -- what specific threats should that threat model address?
(e) Does the Playwright migration change the TOCTOU threat landscape -- does page.route() close the cross-domain navigation gap?

## Context
Current security constraints documented in src/capture.js header:
- Browser context is always closed (try/finally)
- Header fetch uses redirect:'manual' (no unvalidated redirects)
- Set-Cookie values redacted in captured headers
- Scheme guard on captureHeaders()
- Request interception for subresource counting only (not for cross-domain navigation blocking)

The issue body contains a detailed Browser Isolation Analysis with specialist agreement/disagreement. BrowserContext provides complete application-layer isolation. The issue concluded BrowserContext is sufficient for WRL specifically because: (a) no sensitive cross-tenant data, (b) no timing oracle, (c) Cloudflare gVisor provides VM-level isolation.

TOCTOU backlog items to be marked DONE when Playwright page.route() is implemented.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution with Recommendations, Proposed Tasks, Risks/Concerns, Additional Agents Needed
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-security-minion.md
