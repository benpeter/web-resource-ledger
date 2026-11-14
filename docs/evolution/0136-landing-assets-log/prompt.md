# Prompt

Same session as phases 0133 to 0135 (Ben, 2026-11-14: "pick things off the backlog and
bring them until live").

Backlog item benpeter/wrl-backlog#69: `landing/src/index.js` wraps `env.ASSETS.fetch` in
a bare `catch {}` and returns a 500 without logging, which the repo's fail-loudly rule
forbids.
