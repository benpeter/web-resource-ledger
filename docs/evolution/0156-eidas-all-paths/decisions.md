# Decisions

- Every path reads the setting from the `checkQuota` result it already has
  (`eidasQualified`), as the single-capture handler does: no extra D1 read. The
  MCP quota helper now returns the setting with its refusal (`mcpQuotaCheck`).
  The legacy key has no tenant row and gets none, as before.
- The tests stub `CAPTURE_QUEUE` on a copy of the env and read the messages, one
  test per path, plus one for an account without the setting. Nothing tested the
  flag before, which is how three paths went without it.
- Production: two accounts have the setting on. Their usage counters show fewer
  qualified timestamps than complete captures (7 of 8, 2 of 3); whether the
  missing ones came through these paths, predate the opt-in or hit a Sectigo
  failure can't be told from the data. Existing captures aren't changed: a
  timestamp can only be obtained at capture time.
- Qualified timestamps are billed past 50 a month, so accounts with the setting
  will now see them counted on batch, MCP and scheduled captures too. That is
  what the setting promises.
