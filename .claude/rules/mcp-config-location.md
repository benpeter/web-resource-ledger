MCP servers are configured in `~/.claude.json` under the top-level `mcpServers` key.

- Always read `~/.claude.json` first before adding servers
- Do NOT use `~/.claude/settings.json` (schema rejects it)
- Do NOT use `~/.claude/mcp.json` (not authoritative)
- Match the format of existing entries -- stdio servers need `"type": "stdio"`
