## Verdict: ADVISE

The 4-tool design is coherent. The async polling pattern is sound and well-argued — LLMs handle multi-step tool workflows fine, and the tool descriptions make the pattern explicit. No structural changes needed.

One description is misleading in a way that will cause agent errors:

---

- [ux-strategy]: The `get_capture` tool description says "The capture ID is the access credential -- no additional auth needed for this tool," which an LLM will read as "I can call this without a Bearer token" — but the route still requires one.
  SCOPE: `src/mcp.js` — `get_capture` tool description string
  CHANGE: Reword to clarify that route-level auth (Bearer token) is still required; what the description means is that no *extra scope* beyond the base `read` scope is required. Suggested replacement: "Get the status and details of a capture by ID. Returns status (pending, complete, failed), and when complete, includes artifact URLs (screenshot, HTML, WACZ) and a verification URL. Use the same API key as the other tools. No extra scope beyond `read` is required — the capture ID determines what you can access."
  WHY: Tool descriptions are the primary documentation LLMs read. The phrase "no additional auth needed" violates Nielsen's heuristic of matching the real world — agents *always* need to send the Bearer token to reach the endpoint. An LLM that infers it can omit auth will get a 401 and may either retry without diagnosis or surface a confusing error to the user. This is a high-frequency failure path because `get_capture` is called on every polling loop.
  TASK: Task 2 (mcp.js implementation, approval gate)
