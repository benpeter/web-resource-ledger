# Prompt

Same session as phases 0133 to 0161. The route sync tests check that every route
has an OpenAPI operation, but nothing compared what the routes return with the
response schemas. A read-only pass over the production API (a script that calls
each GET once and diffs the JSON against `openapi.yaml`) found fields the
reference didn't list and one it got wrong.
