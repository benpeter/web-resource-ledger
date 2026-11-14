# Prompt

Same session as phases 0133 to 0143. Coralogix showed 644 `security.auth_fail` events
in about 36 hours, all `missing_header` on `/mcp`, at a steady 10 to 29 an hour.
Cloudflare's request analytics named the senders: MCP directory and liveness crawlers
(mcpbeat, rokmcp, alalanet, EveryMCP, mcptry, sniffmcp, histor, WellknownBot and
others), several of them saying they only call `tools/list`. Every one got 401, so no
directory could list WRL's tools. Backlog benpeter/wrl-backlog#8 (directory listings)
and #9 (Glama score) want WRL visible there.
