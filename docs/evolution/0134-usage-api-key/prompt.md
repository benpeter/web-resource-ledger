# Prompt

Same session as phase 0133 (Ben, 2026-11-14: "pick things off the backlog and bring them
until live ... don't forget about docs, all the surfaces like MCP and API ... check if
anything has been missed in the past").

Found while fixing the E2E suite: `GET /v1/account/usage` answers 401 to an API key, but
`openapi.yaml` documents it with `bearerAuth` and tells API users to call it before large
batches. MCP's `get_usage` returns the same numbers with an API key, so REST and MCP
disagree. The quota E2E test also needs a way to wait for the usage counter, which an
API-key usage endpoint gives it.
