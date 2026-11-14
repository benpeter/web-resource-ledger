# Prompt

Same session as phases 0133 to 0152. Found while writing the deletion refusal in
phase 0152: the MCP tools `capture_url` and `batch_capture` never called
`checkQuota`, so captures made through MCP weren't stopped by the free-tier limit,
a block for non-payment or a pending deletion. The REST capture endpoints check all
three.
