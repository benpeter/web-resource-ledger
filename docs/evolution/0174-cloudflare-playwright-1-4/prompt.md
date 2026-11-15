# Prompt

Same session as phases 0133 to 0173, not from the backlog. WRL captured with
`@cloudflare/playwright` 1.1.2; npm's latest is 1.4.0 (2026-11-10, Playwright
1.62.1). Since 1.3.0 the library talks plain CDP to Browser Run instead of its
own chunked protocol. Versions before 1.3.0 hang when a Worker's compatibility
date is 2026-03-17 or later (`websocket_standard_binary_type`,
cloudflare/browser-run#193), so the old version also kept WRL's compatibility
date stuck before that day.
