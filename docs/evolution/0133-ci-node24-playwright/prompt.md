# Prompt

Ben, 2026-11-14: "do good for WRL. pick things off the backlog and bring them until
live. all merges, PRs, etc. are approved. don't forget about docs, all the surfaces
like MCP and API and all when you do things. also check if anything has been missed
in the past and check on operational stuff."

The operational check found the scheduled E2E runs failing since 2026-11-09:
`ubuntu-latest` now resolves to Ubuntu 26.04, and Playwright 1.58.2 refuses to
install Chromium there ("Playwright does not support chromium on ubuntu26.04-x64").
Backlog item benpeter/wrl-backlog#70 (actions pinned to Node 20 runtimes) touches
the same workflow files, so it goes in the same phase.
