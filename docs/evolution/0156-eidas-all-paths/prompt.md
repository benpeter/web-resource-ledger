# Prompt

Same session as phases 0133 to 0155. While comparing the REST and MCP capture
paths after phases 0153 and 0155: the REST single-capture handler puts
`qualifiedTimestamps` (the account's eIDAS setting) on the queue message. The
REST batch handler, both MCP capture tools and the scheduler don't, so captures
started those ways never requested a qualified timestamp, although the
architecture page, the whitepaper and the marketplace-evidence page describe the
setting as account-wide.
