You are api-design-minion. Wire the new OAuth, session, and account routes into the WRL router.

## Context
Read `src/index.js` carefully -- the entire file. Understand:
- The routes array pattern (method, regex, handler)
- How admin auth is checked (prefix-based, before route matching)
- How rate limiting works (getRateLimitGroup, CF bindings)
- How security headers are appended to every response

Also read `src/oauth.js`, `src/account.js`, and `src/session.js` to see the handlers and session verification.

## Changes to `src/index.js`

**1. New imports:**
```js
import { handleAuthLogin, handleAuthCallback, handleAuthLogout, handleAuthSession, handleFirstKey, handleFirstKeyAck } from './oauth.js';
import { handleAccountListKeys, handleAccountCreateKey, handleAccountRevokeKey, handleAccountAcceptTos } from './account.js';
import { verifySession } from './session.js';
```

**2. New routes (add to routes array, BEFORE the 404 fallthrough):**
```
GET  /auth/login                    -> handleAuthLogin
GET  /auth/callback                 -> handleAuthCallback
POST /auth/logout                   -> handleAuthLogout
GET  /auth/session                  -> handleAuthSession
GET  /v1/account/first-key          -> handleFirstKey
POST /v1/account/first-key/ack      -> handleFirstKeyAck
GET  /v1/account/keys               -> handleAccountListKeys
POST /v1/account/keys               -> handleAccountCreateKey
DELETE /v1/account/keys/([a-f0-9]{64}) -> handleAccountRevokeKey
POST /v1/account/tos                -> handleAccountAcceptTos
```

**3. Auth gate for `/v1/account/*` routes (parallel to the admin auth block):**
Add a new block after the admin auth block, before route matching:
```js
const isAccountRoute = pathname.startsWith('/v1/account/');
if (!response && isAccountRoute) {
  // Rate limit: per-IP using AUTH_RATE_LIMITER
  if (env.AUTH_RATE_LIMITER) {
    const { success } = await env.AUTH_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      response = problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  // Session auth
  if (!response) {
    const session = await verifySession(request, env);
    if (!session.ok) {
      response = session.response;
    } else {
      // ToS enforcement: 403 if ToS not accepted (exempt /v1/account/tos itself)
      if (!session.tosAcceptedAt && !pathname.startsWith('/v1/account/tos')) {
        response = problemResponse(403, 'You must accept the Terms of Service before using account endpoints.', {},
          'https://webresourceledger.com/docs/errors#tos-required');
      }
      // CSRF check for mutations
      if (!response && (request.method === 'POST' || request.method === 'DELETE')) {
        if (!request.headers.has('X-WRL-CSRF')) {
          response = problemResponse(403, 'CSRF header X-WRL-CSRF is required for mutations');
        }
      }
      // Attach session to request for handlers
      if (!response) {
        env._session = session;
      }
    }
  }
}
```

**CRITICAL: ToS enforcement** -- The router MUST check `session.tosAcceptedAt` and return 403 when null. The ONLY exception is `POST /v1/account/tos` (otherwise users couldn't accept ToS). This prevents ToS bypass via direct API calls.

**4. Auth rate limit for `/auth/*` routes:**
Add rate limiting for auth endpoints (before route matching):
```js
const isAuthRoute = pathname.startsWith('/auth/');
if (!response && isAuthRoute && env.AUTH_RATE_LIMITER) {
  const { success } = await env.AUTH_RATE_LIMITER.limit({ key: clientIp });
  if (!success) {
    response = problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
  }
}
```

**5. Update getRateLimitGroup to include account routes:**
```js
if (pathname.startsWith('/v1/account/')) return 'account';
if (pathname.startsWith('/auth/')) return 'auth';
```

**6. Session context passing:**
The handlers in account.js need the authenticated session. Use `env._session` as a request-scoped property. The handlers read `env._session.tenantId`, `env._session.githubId`, etc.

## Critical: Do NOT Change
- The existing admin auth block (prefix check for `/v1/admin/`)
- The existing route handlers or their signatures
- The existing security headers block at the end
- The existing CORS handling
- Any existing import

## Deliverables
- Modified `src/index.js`

## What NOT to do
- Do NOT create a "try cookie, fall back to Bearer" auth function
- Do NOT modify the admin auth block
- Do NOT modify any existing route handler
- Do NOT add CORS headers for account/auth routes (same-origin only)
