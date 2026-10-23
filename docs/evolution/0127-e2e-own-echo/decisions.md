# Decisions

- The echo lives in the landing Worker under `/__e2e/` instead of a new Worker: no new deploy pipeline, DNS record or secret. A test on staging confirmed that the staging Worker can deliver a webhook to the landing Worker on the same zone (a temporary webhook to `/robots.txt` got a real 405).
- `POST /__e2e/echo` answers 200 with `{ ok, bytes }`. It reflects neither body nor headers, so it can't be used to bounce content back. `/__e2e/status/<200-599>` answers with that status, for the failure test. GET answers 405, responses carry `X-Robots-Tag: noindex`, and JSON responses are never counted as page views.
- The spec reads `E2E_WEBHOOK_TARGET_BASE` (default `https://webresourceledger.com/__e2e`) so another target can be used without editing the test.
- E2E has been green since 2026-10-15 because httpbin happened to be up; this removes the dependency rather than the symptom.
