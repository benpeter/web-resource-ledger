# Prompt

Same session as phases 0133 to 0171, not from the backlog: checking the DPA
and the subprocessor list against the code (backlog #91). `src/analytics.js`
sends capture events to Pirsch with `ip: body?.ip` from the capture queue
message, and phase 0113 says capture events carry the submitter's ip. The
queue message's `ip` is the captured site's address.
