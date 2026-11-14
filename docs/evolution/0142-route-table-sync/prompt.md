# Prompt

Same session as phases 0133 to 0141. While checking whether the dashboard's account
routes (`/v1/account/keys` and others) were left out of `openapi.yaml` on purpose, the
route table in `docs/INTERNALS.md` turned out to be missing routes added since it was
written, and `openapi.yaml` declared the notification preference routes as needing no
auth. Ben's standing brief: keep every surface (API, MCP, docs) current, and check what
was missed in the past.
