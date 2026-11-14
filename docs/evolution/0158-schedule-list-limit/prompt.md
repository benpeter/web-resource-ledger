# Prompt

Same session as phases 0133 to 0157. After phase 0157 documented the schedule
limit and the operator override, checking the dashboard showed that the schedule
panel takes the limit from `body.limit` of `GET /v1/schedules`, which the API
never sent. The panel fell back to 10, so an account whose limit an operator had
raised still saw "10 of 10 schedules" and was refused an eleventh in the browser.
