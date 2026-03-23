---
layout: layouts/doc.njk
title: Scheduled Captures
description: Automate recurring captures with cron-style schedules. WRL runs each schedule at its configured interval and submits a new capture automatically.
---

# Scheduled Captures

Scheduled captures let you automate recurring snapshots of a URL. Define a cron expression, and WRL will submit a new capture at each interval without any polling or manual intervention.

Each scheduled run submits a standard capture and counts against your monthly quota. The capture artifacts, verification, and audit trail work exactly the same as manually submitted captures.

## Prerequisites

- An API key with `capture` scope. See [Authentication](/authentication/).

---

## Create a schedule

Send a `POST /v1/schedules` request with the URL, a human-readable name, and a cron expression.

```bash
curl -X POST https://api.webresourceledger.com/v1/schedules \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "name": "Daily homepage capture",
    "cron": "0 0 * * *"
  }'
```

The response is `201 Created` with the new schedule record.

```json
{
  "id": "sch_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "url": "https://example.com",
  "name": "Daily homepage capture",
  "cron": "0 0 * * *",
  "paused": false,
  "nextRunAt": "2026-04-01T00:00:00.000Z",
  "lastRunAt": null,
  "lastCaptureId": null,
  "lastCaptureStatus": null,
  "createdAt": "2026-03-23T10:00:00.000Z"
}
```

Save the `id` — you will use it to retrieve or delete the schedule.

---

## List schedules

```bash
curl https://api.webresourceledger.com/v1/schedules \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "data": [
    {
      "id": "sch_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      "url": "https://example.com",
      "name": "Daily homepage capture",
      "cron": "0 0 * * *",
      "paused": false,
      "nextRunAt": "2026-04-01T00:00:00.000Z",
      "lastRunAt": "2026-03-31T00:00:00.000Z",
      "lastCaptureId": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "lastCaptureStatus": "complete",
      "createdAt": "2026-03-01T10:00:00.000Z"
    }
  ]
}
```

`lastCaptureId` and `lastCaptureStatus` reflect the most recent run. Use `lastCaptureId` to retrieve the full capture record or verify the artifact.

To see only captures triggered by a specific schedule, add the `schedule_id` filter when listing captures:

```bash
curl "https://api.webresourceledger.com/v1/captures?schedule_id=sch_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Delete a schedule

```bash
curl -X DELETE https://api.webresourceledger.com/v1/schedules/sch_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "id": "sch_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "deleted": true
}
```

Deletion is permanent. Any capture currently in progress from the schedule's last run is not affected. The schedule will not trigger any further captures after deletion.

---

## Cron expression format

Schedules use standard 5-field cron syntax:

```
+------------ minute (0-59)
|   +-------- hour (0-23)
|   |   +---- day of month (1-31)
|   |   |   + month (1-12)
|   |   |   | +- day of week (0-7, where 0 and 7 are Sunday)
|   |   |   | |
*   *   *   * *
```

**Minimum interval: 1 hour.** Expressions that would fire more than once per hour are rejected with `400`.

Common patterns:

| Expression | Meaning |
|---|---|
| `0 * * * *` | Every hour (at :00) |
| `0 0 * * *` | Every day at midnight UTC |
| `0 9 * * 1` | Every Monday at 9:00 AM UTC |
| `0 0 1 * *` | First day of every month at midnight UTC |
| `0 0 * * 0` | Every Sunday at midnight UTC |
| `0 6,18 * * *` | Twice daily, at 6:00 AM and 6:00 PM UTC |

All times are UTC. There is no DST adjustment.

---

## Schedule limits

Each tenant tier has a maximum number of concurrent active schedules. If you reach the limit, `POST /v1/schedules` returns `429` with `limitType: "schedules"` in the response body. Delete an existing schedule to free up a slot.

---

## Quota impact

Each scheduled run submits one capture. Scheduled captures count against your monthly quota exactly the same as manually submitted captures. If your quota is exhausted when a schedule fires, that run is skipped and `lastCaptureStatus` reflects the failure.

For current quota status, see [GET /v1/account/usage](/api-reference/) or the [Limits & Quotas](/limits/) guide.
