# Prompt

Own finding while Ben was away: after merging #459 and #458, production kept
its old commit. "Deploy to Staging" had failed twice in its smoke job with
"POST /v1/captures returned 429" and production was skipped. Find the cause,
get the deploys through, and make the next occurrence quick to read.
