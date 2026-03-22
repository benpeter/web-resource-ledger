## Verdict: ADVISE

Two issues within my domain (tool description quality and documentation completeness).

---

- [documentation]: The `capture_url` tool description does not explain what to do if `get_capture` still returns "pending" after 15+ seconds, leaving agents with no recovery path.
  SCOPE: `src/mcp.js` — `capture_url` tool description and output text
  CHANGE: Add a bounded retry instruction to the capture_url response text. After "Captures typically complete in 5-15 seconds," add: "If still pending after 30 seconds, the capture has likely failed — call get_capture once more to retrieve the error." This gives agents a concrete stop condition instead of an open-ended polling loop.
  WHY: Without a failure boundary, an agent following the description literally will poll indefinitely or until its own timeout. The synthesis doc acknowledges "Agent polling UX for capture_url" as a MEDIUM risk — the tool description is the mitigation, and as written it is incomplete. A confused agent loops; a clear description stops it.
  TASK: 2

- [documentation]: The `docs/mcp.md` tutorial section (Task 5) shows three sequential tool calls but does not show what the agent should do when `get_capture` returns "pending" — it omits the wait/retry step that is the only non-obvious part of the workflow.
  SCOPE: `docs/mcp.md` — "Tutorial: Capture and Verify a Web Page" section
  CHANGE: Add an explicit step between "Call get_capture to check status" and "Call verify_capture": "If get_capture returns pending, wait 5–10 seconds and call it again. After 30 seconds, treat it as failed." Show an example pending response and an example complete response so the reader can see what each looks like. The tutorial outline currently collapses this to a parenthetical "(may need to wait 5-15s)" which will cause confusion for anyone following the steps literally.
  WHY: The polling pattern is the only non-standard part of this API — it is exactly what users will get wrong. A tutorial that skips the hard step teaches the happy path and leaves users stranded on their first real capture. This is the highest-value clarification available in the documentation.
  TASK: 5
