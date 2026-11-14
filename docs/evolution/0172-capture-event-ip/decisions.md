# Decisions

- The four producers (`POST /v1/captures`, the batch endpoint, MCP
  `capture_url` and `batch_capture`) put `result.ip` from `validateUrl` into
  the queue message: the first public address the captured site's name
  resolves to, the same value `createCapture` stores. `trackCaptureEvent`
  passed it on as the visitor's ip, so Pirsch would have counted every capture
  as a visit from the captured site's server, with the submitter's user agent.
  `test/analytics.test.js` had the same value under the name "submitter ip".
- Capture events now send no ip, so `trackServerEvent` uses the documentation
  address `192.0.2.1`, as phase 0113 decided for events without one. The user
  agent and source stay, so event counts and the split by source don't change.
- The submitter's own ip is not in the message; only the pseudonym `cip` is.
  Adding the raw ip would keep it in queue storage for every capture, which the
  privacy policy doesn't describe, and it would only let Pirsch join a capture
  to the visit before it. Not done; it would be Ben's call.
- No wrong event reached Pirsch: since 0113 went live on 2026-10-23, every
  capture came from a tenant in `ANALYTICS_EXCLUDE_TENANTS` (production D1, 0
  captures by any other tenant).
- The privacy policy says product events carry no personal data beyond the
  analytics ip, user agent and page URL; sending less keeps that true. The DPA
  sentences about ips are a separate matter, added to backlog #91.
