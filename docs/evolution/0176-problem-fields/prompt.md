# Prompt

Same session as phases 0133 to 0175, not from the backlog. `npm run lint:api`
had 12 warnings that CI accepted. Eight came from examples showing fields that
the problem schema didn't have (`limitType`, `quota`, `threatTypes`), fields
the API does send. One was the unused `QuotaDetail` schema, written for them
and never referenced.
