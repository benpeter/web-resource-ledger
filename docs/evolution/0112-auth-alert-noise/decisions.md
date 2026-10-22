# Decisions

## What fired

The alert counted every `security.auth_fail` event and fired above 3 in 15
minutes. The 2026-10-22 firing was 13 events between 16:56 and 16:58 UTC:

- 7 `missing_header`, 3 of them through the MCP endpoint (a client connecting
  without a key first)
- 3 `key_not_found` through MCP, all with the same unknown key
- 3 `invalid_admin_key` from three different client hashes within 20 seconds

That is a client or directory checker trying the MCP server and a few wrong
keys, not an attack. The 2026-10-05 events are past Coralogix's retention.

## Change

- Don't count `missing_header`. A request without any credential says nothing
  about keys being misused, and MCP clients and crawlers send them routinely.
  Rate limiting already covers floods of them.
- Fire above 10 failures with a credential in 15 minutes instead of 3. Key
  enumeration needs far more attempts than that; a client with a revoked key on
  a schedule produces a few an hour and is better found in the logs than paged.
- Priority stays P1, and the alert still emails bp@ben-peter.com.

The filter was checked against the last 8 days before the change: it matches 6
of the 13 events on 2026-10-22 and nothing else.

## Also fixed

- `docs/operations/alerts.md` still said six alerts trigger an automated
  investigation; phase 0110 removed that pipeline.
- The runbook listed failure reasons that the code doesn't use
  (`invalid_format`, `insufficient_scope`, `revoked`) and a `path` field the
  events don't have. It now lists the reasons `src/auth.js` logs and the `via`
  field.

## E4: no missing cron logs

The plan said Coralogix held about a fifth of the expected cron log lines. That
estimate was wrong: the scheduler logs `schedule.tick_start` only when a
schedule is due and `schedule.tick_empty` otherwise. Between 2026-10-21 22:00
and 2026-10-22 22:00 UTC there were 1,416 empty ticks and 24 with work, 1,440 in
total, one per minute. Nothing is missing.
