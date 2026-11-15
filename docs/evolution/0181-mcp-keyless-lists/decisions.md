# Decisions

- `resources/list`, `resources/templates/list` and `prompts/list` join the
  keyless methods. WRL registers tools only, so the SDK answers each with
  "method not found" (-32601), which is the MCP way to say there are none. A
  401 says "sign in to find out", and a crawler that scores a server on what
  it can list counts that against it.
- The list stays an allowlist. Letting everything through except
  `tools/call` would be shorter, but a resource or prompt added later could
  then answer without a key by accident. With the allowlist that needs a
  decision here.
- Unknown methods still get a 401 without a key (one crawler sends
  `mcp-index/does-not-exist` to see how a server reacts). Answering those
  would mean inverting the allowlist; one request a day doesn't justify it.
- `tools/call` without a key stays a 401, and so does a batch that mixes a
  keyless method with any other.
