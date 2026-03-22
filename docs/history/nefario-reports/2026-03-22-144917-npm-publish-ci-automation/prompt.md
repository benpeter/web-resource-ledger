**Outcome**: The @w-r-l/verify npm package is published automatically via CI on tag push, with version bump tooling and changelog generation. Manual npm publish is no longer needed.

**Success criteria**:
- GitHub Actions workflow triggers on `v*` tag push to the `verify/` directory
- Workflow runs tests, builds, and publishes to npm under the @w-r-l org
- npm publish uses a scoped automation token stored as a GitHub Actions secret
- Version bump script updates package.json version and creates a git tag in one command
- CHANGELOG.md is generated from conventional commits (or a lightweight equivalent) covering changes since last tag
- Publishing a pre-existing version fails gracefully (no broken CI state)
- The existing v0.1.0 package on npm is unaffected

**Scope**:
- In: GitHub Actions publish workflow, version bump script, changelog generation, npm token secret setup
- Out: Monorepo publish orchestration (only @w-r-l/verify for now), GitHub Releases (nice-to-have, not required), pre-release/beta channel

**Constraints**:
- npm org @w-r-l already exists; package @w-r-l/verify is already published at v0.1.0
- Workflow must not publish on every push to main -- only on explicit tag push
- The verify tool lives in `verify/` subdirectory; workflow should only trigger for changes in that path
