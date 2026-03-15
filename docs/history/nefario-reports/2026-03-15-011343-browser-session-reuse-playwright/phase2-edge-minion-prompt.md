You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Implement browser session reuse with Playwright migration for 10x capture throughput in a Cloudflare Workers project.

Captures should reuse browser sessions instead of launching and closing a browser per capture, increasing throughput from ~30 to ~300 captures/min within the existing 30-session Browser Rendering limit. Simultaneously migrates from Puppeteer to Playwright (GA on Cloudflare since Sep 2025).

## Your Planning Question
What is the correct session reuse pattern for Cloudflare Browser Rendering with Playwright? Specifically:
(a) How does browser.disconnect() vs browser.close() work in @cloudflare/playwright?
(b) What are the semantics of keep_alive on browser launch?
(c) How does session discovery work -- what API does Cloudflare expose to list active/idle sessions, and how should a Worker reconnect to an existing session?
(d) What happens when multiple Workers race for the same free session (contention)?
(e) What are the practical limits -- the 30-session cap, session timeout behavior, and how keep_alive interacts with Cloudflare's session garbage collection?

## Context
Current src/capture.js uses puppeteer.launch(browserBinding) / browser.close() per capture.
wrangler.toml has [browser] binding = "BROWSER".
The project is on the 30-session Browser Rendering limit.
Goal: ~300 captures/min throughput.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution with Recommendations, Proposed Tasks, Risks/Concerns, Additional Agents Needed
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-LBKu3b/browser-session-reuse-playwright/phase2-edge-minion.md
