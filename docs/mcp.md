# MCP Server

The MCP server guide is published at https://docs.webresourceledger.com/mcp/ and its
source is [`site/content/mcp.md`](../site/content/mcp.md). It covers client setup, every
tool with its parameters and example output, and troubleshooting.

This file used to hold a second copy of that guide. The copy fell behind (it had no
`read_sitemap` or `update_schedule`), so it was replaced by this pointer in phase 0137.
`npm run test:sync` checks that every tool registered in `src/mcp.js` has a row and a
section in `site/content/mcp.md`.
