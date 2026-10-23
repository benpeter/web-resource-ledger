# Decisions

- `src/retention.js` has two jobs, run from the weekly cron: delete captures
  quarantined more than 90 days ago (R2 artifacts first, then the capture row and
  its threat checks), and delete usage counters older than the current period
  minus 12. Each job runs on its own, so one failing doesn't skip the other.
- R2 objects go first. If deleting the row fails afterwards, the next run deletes
  it; deleting a missing R2 key is a no-op.
- The WACZ object is stored under its content hash, so the purge keeps it when
  another capture still references the same key.
- Up to 100 captures per run. Production has none quarantined today.
- The weekly cron was `0 9 * * 1`. Cloudflare numbers weekdays from 1 = Sunday,
  so the "Monday" digest ran on Sundays. It is now `0 9 * * MON`.
- That cron also ran the per-minute schedule tick and the hourly meter report,
  because `scheduled()` fell through to them for every cron. At Sunday 09:00
  both crons ran the tick, and twice (2026-08-02 and 2026-10-04) the same hourly
  schedule produced two captures. The weekly cron now returns after its jobs,
  the tick only runs on `*/1 * * * *`, and an unexpected cron is logged and
  ignored.
- The storage limit keeps counting bytes captured this month; nothing changes
  there.
