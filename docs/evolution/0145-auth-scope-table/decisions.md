# Decisions

- The scope column comes from the handlers: `verifyAuth` asks for `capture` on the
  sitemap and all five schedule routes, the fetch gate asks for `read` on the diff
  route, and `GET /v1/account/usage` takes a `read` key since phase 0134. The
  certificate route is public, like the other capture routes.
- `test/routes-sync.test.js` gets a third check: every OpenAPI operation that declares
  `bearerAuth` has a row in the scope table. Public and admin operations aren't
  required: the table is about which scope a key needs, and the admin endpoints are
  covered in the operators' section below it.
- The scope column itself isn't checked against the code. OpenAPI doesn't record scopes,
  so the test would have to parse handler source; presence catches the drift that
  happened (endpoints added without a row).
- Release 1.1.0 (#363) is recorded here rather than as its own phase: it moved
  Unreleased to `## [1.1.0]`, tagged `v0.1.0`, `v1.0.0` and `v1.1.0`, published the
  GitHub release, and added a "Releases" section to OPERATIONS.md. `WRL-API-Version`
  answers 1.1.0 since the deploy of d859ba1.
