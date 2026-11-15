# Prompt

Operational check on 2026-11-15, Ben away: what still gets a 401 on `/mcp`
since keyless discovery (phase 0144) and the `server/discover` fix after it? The `security.auth_fail` log
names the methods: besides `tools/call`, directory crawlers ask for
`resources/list` and `prompts/list` without a key.
