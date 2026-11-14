# Prompt

Same session as phases 0133 to 0156. During the docs pass (backlog #46) the
landing page and the compare page said WRL has no scheduled monitoring, although
schedules shipped in phase 0059. Checking the schedule docs against the code
then showed that the schedule-limit `429` lacked the `limitType: "schedules"`
that the OpenAPI spec and the schedules guide promise, and that the admin config
endpoint answered 500 for an out-of-range `schedules.maxSchedules`.
