When adding new top-level directories or file categories that don't affect the
Worker runtime (src/, migrations/, wrangler.toml, package.json), add them to
the `paths-ignore` list in `.github/workflows/deploy-staging.yml` so they
don't trigger unnecessary deploys.
