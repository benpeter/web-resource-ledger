# Prompt

Same session as phases 0133 to 0137 (Ben, 2026-11-14: "check if anything has been
missed in the past"; backlog benpeter/wrl-backlog#15, CQP phase 4, "adds a WACZ
captureQuality field").

A production check found that partial captures (navigation timed out after
DOMContentLoaded) complete with screenshot, HTML and headers but no WACZ, signature,
timestamp, certificate or verify link: 30% of the founder's hourly apache.org captures in
November. Phase 0023 skipped the WACZ for partial captures only because captures then
ran inside the HTTP request with a tight time budget, and noted that partial captures
should get a WACZ once captures moved to Queues (R16). They moved, and this was never
done.
