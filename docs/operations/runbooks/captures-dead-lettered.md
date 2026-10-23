---
alert: "[WRL] Captures Dead-Lettered"
events:
  - capture.dlq
priority: P2
---

# Runbook: [WRL] Captures Dead-Lettered

## What fires this

At least one `capture.dlq` event in 30 minutes. A capture failed on all 4
attempts and the queue moved it to the dead-letter queue. The DLQ handler marks
the capture failed with the reason of its last attempt, followed by "WRL tried
4 times.", and sends the `capture.failed` webhook and the failure email.

## Check

Coralogix, to see which captures and sites:

```
source logs | filter $l.applicationname == 'wrl' && $d.event == 'capture.dlq'
```

Each event has `captureId`, `tenantId`, `url` and `attempts`. Then the reason
of each attempt:

```
source logs | filter $l.applicationname == 'wrl' && $d.event == 'capture.stage.fail' && $d.captureId == '<captureId>'
```

The capture record holds the reason the user sees (`error` in
`GET /v1/captures/{id}/status`, or the `captures.error` column in D1).

## Likely causes

**One site, one tenant:** the site times out, renders blank, or the browser
can't take its screenshot. Check whether the site loads in a normal browser. If
it does and the failure is reproducible, it's a capture-quality bug worth a
backlog issue (example: pages taller than 8,000 px, fixed in phase 0117).

**Many sites at once:** a platform problem. Check Browser Rendering status, the
`[WRL] Worker Errors (5xx)` alert, and recent deploys (the last deploy is the
first suspect).

## Act

- Single site that can't be captured: nothing to do for the user, the failure
  email already told them why. File a backlog issue if the site class matters.
- Platform problem: roll back the last deploy if it correlates, then re-submit
  the affected captures for the tenants if they ask.

## Not this alert

Bot checks, invalid TLS certificates, blank pages and browser error pages fail
on the first attempt, so they never reach the dead-letter queue.
