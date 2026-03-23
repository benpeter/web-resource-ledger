ADVISE

- [security]: GitHub OAuth App redirect_uri allowlist does not include the new custom domain.
  SCOPE: GitHub OAuth App settings (out-of-band infrastructure, not in any file being changed)
  CHANGE: Add `https://api.webresourceledger.com/auth/callback` to the list of authorized callback URLs in the WRL GitHub OAuth App settings. The old `https://wrl.benpeter.workers.dev/auth/callback` may remain (backward compat) or be removed.
  WHY: `src/oauth.js` derives `redirect_uri` dynamically from `new URL(request.url).origin`, which means once users land on the custom domain, the OAuth handshake will send `https://api.webresourceledger.com/auth/callback` as the redirect URI. GitHub validates this against the OAuth App's registered callback URLs and will reject any URI not explicitly listed. Result: all GitHub sign-in flows via the new domain fail with an OAuth error until the App setting is updated. This is not covered by the plan or the grep/test verification steps.
  TASK: Task 1 (verification step) -- add a prerequisite step or checklist item confirming the GitHub OAuth App callback URL is registered before the deployment is considered complete.
