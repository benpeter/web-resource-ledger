Add build metadata injection via wrangler --define flags to both deploy workflows.

## What to do

### 1. Modify .github/workflows/deploy-staging.yml

In the deploy job, add a "Resolve build metadata" step AFTER npm ci and BEFORE the wrangler-action step:

    - name: Resolve build metadata
      id: meta
      run: |
        sha=$(git rev-parse HEAD)
        version=$(jq -r .version package.json)
        if ! echo "$sha" | grep -qE '^[0-9a-f]{40}$'; then echo "Invalid SHA: $sha" >&2; exit 1; fi
        if ! echo "$version" | grep -qE '^\d+\.\d+\.\d+'; then echo "Invalid version: $version" >&2; exit 1; fi
        echo "sha=$sha" >> "$GITHUB_OUTPUT"
        echo "version=$version" >> "$GITHUB_OUTPUT"
        echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"

Modify the wrangler-action step to include command: with --define flags:

    - uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        environment: staging
        command: >-
          deploy
          --define BUILD_COMMIT:"'${{ steps.meta.outputs.sha }}'"
          --define BUILD_VERSION:"'${{ steps.meta.outputs.version }}'"
          --define BUILD_DEPLOYED_AT:"'${{ steps.meta.outputs.timestamp }}'"
          --define BUILD_ENV:"'staging'"

KEEP environment: staging -- the action auto-appends --env staging.

In the smoke job, add GITHUB_SHA to env:

      - run: ./scripts/smoke-test.sh
        env:
          SMOKE_URL: ${{ vars.WRL_STAGING_BASE_URL }}
          SMOKE_API_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}
          GITHUB_SHA: ${{ github.sha }}

### 2. Modify .github/workflows/deploy-production.yml

In the deploy job, add "Resolve build metadata" step AFTER npm ci:

    - name: Resolve build metadata
      id: meta
      run: |
        sha=$(git rev-parse HEAD)
        version=$(jq -r .version package.json)
        if ! echo "$sha" | grep -qE '^[0-9a-f]{40}$'; then echo "Invalid SHA: $sha" >&2; exit 1; fi
        if ! echo "$version" | grep -qE '^\d+\.\d+\.\d+'; then echo "Invalid version: $version" >&2; exit 1; fi
        echo "sha=$sha" >> "$GITHUB_OUTPUT"
        echo "version=$version" >> "$GITHUB_OUTPUT"
        echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"

Use git rev-parse HEAD (not github.sha) -- resolves correctly for workflow_run and tag rollbacks.

Modify the wrangler-action step:

    - uses: cloudflare/wrangler-action@da0e0dfe58b7a431659754fdf3f186c529afbe65 # v3.14.1
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        command: >-
          deploy
          --define BUILD_COMMIT:"'${{ steps.meta.outputs.sha }}'"
          --define BUILD_VERSION:"'${{ steps.meta.outputs.version }}'"
          --define BUILD_DEPLOYED_AT:"'${{ steps.meta.outputs.timestamp }}'"
          --define BUILD_ENV:"'production'"

No environment: key for production (matches current behavior).

In the smoke job, add GITHUB_SHA:

      - run: ./scripts/smoke-test.sh
        env:
          SMOKE_URL: ${{ vars.WRL_PROD_BASE_URL }}
          SMOKE_API_KEY: ${{ secrets.WRL_PROD_CAPTURE_API_KEY }}
          SMOKE_SKIP_CAPTURE: "1"
          GITHUB_SHA: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}

## What NOT to do
- Do NOT modify src/index.js, test/health.test.js, or openapi.yaml
- Do NOT modify scripts/smoke-test.sh
- Do NOT add [define] to wrangler.toml
- Do NOT change checkout ref logic

## Verification
- YAML is valid (proper indentation)
- environment: staging still present in staging deploy step

When done, mark task completed and report file paths with line counts.
